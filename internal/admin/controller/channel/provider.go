package channel

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/helper"
	commonutils "github.com/yeying-community/router/common/utils"
	"github.com/yeying-community/router/internal/admin/model"
)

type modelProviderCatalogItem struct {
	Provider     string                           `json:"provider"`
	Name         string                           `json:"name,omitempty"`
	Models       []string                         `json:"models"`
	ModelDetails []model.ModelProviderModelDetail `json:"model_details,omitempty"`
	BaseURL      string                           `json:"base_url,omitempty"`
	APIKey       string                           `json:"api_key,omitempty"`
	SortOrder    int                              `json:"sort_order,omitempty"`
	Source       string                           `json:"source,omitempty"`
	UpdatedAt    int64                            `json:"updated_at,omitempty"`
}

type modelProviderCatalogUpdateRequest struct {
	Providers []modelProviderCatalogItem `json:"providers"`
}

type modelProviderFetchRequest struct {
	Provider string `json:"provider"`
	Key      string `json:"key"`
	BaseURL  string `json:"base_url"`
}

var providerDefaultBaseURLs = model.GetModelProviderDefaultBaseURLs()

func normalizeCatalogSortOrder(sortOrder int) int {
	if sortOrder > 0 {
		return sortOrder
	}
	return 0
}

func finalizeModelProviderCatalogSortOrder(items []modelProviderCatalogItem) []modelProviderCatalogItem {
	sort.SliceStable(items, func(i, j int) bool {
		leftOrder := normalizeCatalogSortOrder(items[i].SortOrder)
		rightOrder := normalizeCatalogSortOrder(items[j].SortOrder)
		if leftOrder > 0 && rightOrder > 0 {
			if leftOrder != rightOrder {
				return leftOrder < rightOrder
			}
			return items[i].Provider < items[j].Provider
		}
		if leftOrder > 0 {
			return true
		}
		if rightOrder > 0 {
			return false
		}
		return items[i].Provider < items[j].Provider
	})

	nextOrder := 10
	for i := range items {
		order := normalizeCatalogSortOrder(items[i].SortOrder)
		if order > 0 {
			items[i].SortOrder = order
			if order >= nextOrder {
				nextOrder = order + 10
			}
			continue
		}
		items[i].SortOrder = nextOrder
		nextOrder += 10
	}
	return items
}

func normalizeModelProviderCatalog(items []modelProviderCatalogItem) []modelProviderCatalogItem {
	now := helper.GetTimestamp()
	indexByProvider := make(map[string]int, len(items))
	normalized := make([]modelProviderCatalogItem, 0, len(items))
	for _, item := range items {
		provider := commonutils.NormalizeModelProvider(item.Provider)
		if provider == "" {
			provider = commonutils.NormalizeModelProvider(item.Name)
		}
		if provider == "" {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = provider
		}
		source := strings.TrimSpace(strings.ToLower(item.Source))
		if source == "" {
			source = "manual"
		}
		baseURL := strings.TrimSpace(item.BaseURL)
		apiKey := strings.TrimSpace(item.APIKey)
		detailsInput := make([]model.ModelProviderModelDetail, 0, len(item.ModelDetails)+len(item.Models))
		detailsInput = append(detailsInput, item.ModelDetails...)
		for _, modelName := range item.Models {
			detailsInput = append(detailsInput, model.ModelProviderModelDetail{Model: strings.TrimSpace(modelName)})
		}
		details := model.MergeModelProviderDetails(provider, detailsInput, item.Models, false, now)
		entry := modelProviderCatalogItem{
			Provider:     provider,
			Name:         name,
			Models:       model.ModelProviderModelNames(details),
			ModelDetails: details,
			BaseURL:      baseURL,
			APIKey:       apiKey,
			SortOrder:    normalizeCatalogSortOrder(item.SortOrder),
			Source:       source,
			UpdatedAt:    item.UpdatedAt,
		}
		if idx, ok := indexByProvider[provider]; ok {
			existing := normalized[idx]
			existing.ModelDetails = model.MergeModelProviderDetails(
				provider,
				append(existing.ModelDetails, entry.ModelDetails...),
				append(existing.Models, entry.Models...),
				false,
				now,
			)
			existing.Models = model.ModelProviderModelNames(existing.ModelDetails)
			if existing.Name == existing.Provider && entry.Name != entry.Provider {
				existing.Name = entry.Name
			}
			if existing.BaseURL == "" && entry.BaseURL != "" {
				existing.BaseURL = entry.BaseURL
			}
			if entry.BaseURL != "" && entry.Source != "default" {
				existing.BaseURL = entry.BaseURL
			}
			if existing.APIKey == "" && entry.APIKey != "" {
				existing.APIKey = entry.APIKey
			}
			if entry.APIKey != "" && entry.Source != "default" {
				existing.APIKey = entry.APIKey
			}
			if entry.SortOrder > 0 && entry.Source != "default" {
				existing.SortOrder = entry.SortOrder
			}
			if existing.SortOrder <= 0 && entry.SortOrder > 0 {
				existing.SortOrder = entry.SortOrder
			}
			if entry.UpdatedAt > existing.UpdatedAt {
				existing.UpdatedAt = entry.UpdatedAt
			}
			existing.Source = entry.Source
			normalized[idx] = existing
			continue
		}
		indexByProvider[provider] = len(normalized)
		normalized = append(normalized, entry)
	}
	return finalizeModelProviderCatalogSortOrder(normalized)
}

func loadModelProviderCatalog() ([]modelProviderCatalogItem, error) {
	detailsByProvider, err := model.LoadModelProviderModelDetailsMap(model.DB)
	if err != nil {
		return nil, err
	}
	legacyRawByProvider, legacyErr := model.LoadLegacyModelProviderModelsRawMap(model.DB)
	if legacyErr != nil {
		return nil, legacyErr
	}

	rows := make([]model.ModelProvider, 0)
	if err := model.DB.Order("sort_order asc, provider asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]modelProviderCatalogItem, 0, len(rows))
	for _, row := range rows {
		provider := commonutils.NormalizeModelProvider(row.Provider)
		if provider == "" {
			continue
		}
		details := detailsByProvider[provider]
		if len(details) == 0 {
			legacyRaw := strings.TrimSpace(legacyRawByProvider[provider])
			if legacyRaw != "" {
				details = model.ParseModelProviderModelsRaw(legacyRaw)
			}
		}
		details = model.MergeModelProviderDetails(provider, details, nil, false, helper.GetTimestamp())
		items = append(items, modelProviderCatalogItem{
			Provider:     provider,
			Name:         strings.TrimSpace(row.Name),
			Models:       model.ModelProviderModelNames(details),
			ModelDetails: details,
			BaseURL:      strings.TrimSpace(row.BaseURL),
			APIKey:       strings.TrimSpace(row.APIKey),
			SortOrder:    normalizeCatalogSortOrder(row.SortOrder),
			Source:       strings.TrimSpace(strings.ToLower(row.Source)),
			UpdatedAt:    row.UpdatedAt,
		})
	}
	return normalizeModelProviderCatalog(items), nil
}

func saveModelProviderCatalog(items []modelProviderCatalogItem) ([]modelProviderCatalogItem, error) {
	now := helper.GetTimestamp()
	currentItems, currentErr := loadModelProviderCatalog()
	if currentErr != nil {
		return nil, currentErr
	}
	currentDetailsByProvider := make(map[string][]model.ModelProviderModelDetail, len(currentItems))
	currentAPIKeyByProvider := make(map[string]string, len(currentItems))
	for _, item := range currentItems {
		provider := commonutils.NormalizeModelProvider(item.Provider)
		if provider == "" {
			continue
		}
		details := model.MergeModelProviderDetails(provider, item.ModelDetails, item.Models, false, now)
		currentDetailsByProvider[provider] = details
		currentAPIKeyByProvider[provider] = strings.TrimSpace(item.APIKey)
	}

	normalized := finalizeModelProviderCatalogSortOrder(normalizeModelProviderCatalog(items))
	for i := range normalized {
		if strings.TrimSpace(normalized[i].APIKey) == "" {
			if currentAPIKey, ok := currentAPIKeyByProvider[normalized[i].Provider]; ok {
				normalized[i].APIKey = currentAPIKey
			}
		}
		if len(normalized[i].ModelDetails) == 0 && len(normalized[i].Models) == 0 {
			if existingDetails, ok := currentDetailsByProvider[normalized[i].Provider]; ok {
				normalized[i].ModelDetails = existingDetails
				normalized[i].Models = model.ModelProviderModelNames(existingDetails)
			}
		}
		if normalized[i].UpdatedAt == 0 {
			normalized[i].UpdatedAt = now
		}
	}
	providerRows := make([]model.ModelProvider, 0, len(normalized))
	modelRows := make([]model.ModelProviderModel, 0)
	for _, item := range normalized {
		details := model.MergeModelProviderDetails(item.Provider, item.ModelDetails, item.Models, false, now)
		item.Models = model.ModelProviderModelNames(details)
		item.ModelDetails = details
		providerRows = append(providerRows, model.ModelProvider{
			Provider:  item.Provider,
			Name:      strings.TrimSpace(item.Name),
			BaseURL:   strings.TrimSpace(item.BaseURL),
			APIKey:    strings.TrimSpace(item.APIKey),
			SortOrder: item.SortOrder,
			Source:    strings.TrimSpace(strings.ToLower(item.Source)),
			UpdatedAt: item.UpdatedAt,
		})
		modelRows = append(modelRows, model.BuildModelProviderModelRows(item.Provider, details, now)...)
	}
	tx := model.DB.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	if err := tx.Where("1 = 1").Delete(&model.ModelProviderModel{}).Error; err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Where("1 = 1").Delete(&model.ModelProvider{}).Error; err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if len(providerRows) > 0 {
		if err := tx.Create(&providerRows).Error; err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	if len(modelRows) > 0 {
		if err := tx.Create(&modelRows).Error; err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	return normalized, nil
}

func buildDefaultModelProviderCatalog() []modelProviderCatalogItem {
	now := helper.GetTimestamp()
	seeds := model.BuildDefaultModelProviderCatalogSeeds(now)
	entries := make([]modelProviderCatalogItem, 0, len(seeds))
	for _, seed := range seeds {
		entries = append(entries, modelProviderCatalogItem{
			Provider:     seed.Provider,
			Name:         seed.Name,
			Models:       model.ModelProviderModelNames(seed.ModelDetails),
			ModelDetails: seed.ModelDetails,
			BaseURL:      seed.BaseURL,
			SortOrder:    seed.SortOrder,
			Source:       "default",
			UpdatedAt:    now,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		leftOrder := normalizeCatalogSortOrder(entries[i].SortOrder)
		rightOrder := normalizeCatalogSortOrder(entries[j].SortOrder)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return entries[i].Provider < entries[j].Provider
	})
	return entries
}

// GetModelProviders godoc
// @Summary Get model provider catalog (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Success 200 {object} docs.ModelProviderCatalogResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/model-provider [get]
func GetModelProviders(c *gin.Context) {
	items, err := loadModelProviderCatalog()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "模型供应商配置解析失败: " + err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    items,
	})
}

// UpdateModelProviders godoc
// @Summary Update model provider catalog (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body docs.ModelProviderCatalogUpdateRequest true "Model provider catalog payload"
// @Success 200 {object} docs.ModelProviderCatalogResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/model-provider [put]
func UpdateModelProviders(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "读取请求失败",
		})
		return
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求体不能为空",
		})
		return
	}
	providers := make([]modelProviderCatalogItem, 0)
	if trimmed[0] == '[' {
		if err := json.Unmarshal(trimmed, &providers); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "请求体格式错误",
			})
			return
		}
	} else {
		req := modelProviderCatalogUpdateRequest{}
		if err := json.Unmarshal(trimmed, &req); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "请求体格式错误",
			})
			return
		}
		providers = req.Providers
	}

	saved, err := saveModelProviderCatalog(providers)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "保存模型供应商配置失败: " + err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    saved,
	})
}

// GetDefaultModelProviders godoc
// @Summary Get default code model provider catalog (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Success 200 {object} docs.ModelProviderCatalogResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/model-provider/defaults [get]
func GetDefaultModelProviders(c *gin.Context) {
	defaults := buildDefaultModelProviderCatalog()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    defaults,
	})
}

// FetchModelProviderModels godoc
// @Summary Fetch models from provider API (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body docs.ModelProviderFetchRequest true "Provider fetch payload"
// @Success 200 {object} docs.ModelProviderFetchResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/model-provider/fetch [post]
func FetchModelProviderModels(c *gin.Context) {
	req := modelProviderFetchRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	provider := commonutils.NormalizeModelProvider(req.Provider)
	if provider == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请先选择模型供应商",
		})
		return
	}

	baseURL := strings.TrimSpace(req.BaseURL)
	catalogItems, loadErr := loadModelProviderCatalog()
	if loadErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "读取模型供应商配置失败: " + loadErr.Error(),
		})
		return
	}
	savedProvider := modelProviderCatalogItem{}
	for _, item := range catalogItems {
		if commonutils.NormalizeModelProvider(item.Provider) == provider {
			savedProvider = item
			break
		}
	}
	if baseURL == "" {
		baseURL = strings.TrimSpace(savedProvider.BaseURL)
	}
	if baseURL == "" {
		baseURL = providerDefaultBaseURLs[provider]
	}
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "该供应商未配置默认 Base URL，请手动填写",
		})
		return
	}
	apiKey := strings.TrimSpace(req.Key)
	if apiKey == "" {
		apiKey = strings.TrimSpace(savedProvider.APIKey)
	}
	if apiKey == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请先配置该供应商 API Key",
		})
		return
	}

	models, err := fetchOpenAICompatibleModelIDsByBaseURL(apiKey, baseURL, provider)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"message":  "",
		"provider": provider,
		"data":     models,
	})
}
