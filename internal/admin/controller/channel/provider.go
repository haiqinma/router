package channel

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	commonutils "github.com/yeying-community/router/common/utils"
	"github.com/yeying-community/router/internal/admin/model"
	relay "github.com/yeying-community/router/internal/relay"
	"github.com/yeying-community/router/internal/relay/channeltype"
	"github.com/yeying-community/router/internal/relay/meta"
)

const modelProviderCatalogOptionKey = "ModelProviderCatalog"

type modelProviderCatalogItem struct {
	Provider  string   `json:"provider"`
	Name      string   `json:"name,omitempty"`
	Models    []string `json:"models"`
	Source    string   `json:"source,omitempty"`
	UpdatedAt int64    `json:"updated_at,omitempty"`
}

type modelProviderCatalogUpdateRequest struct {
	Providers []modelProviderCatalogItem `json:"providers"`
}

type modelProviderFetchRequest struct {
	Provider string `json:"provider"`
	Key      string `json:"key"`
	BaseURL  string `json:"base_url"`
}

var providerDefaultBaseURLs = map[string]string{
	"openai":    "https://api.openai.com",
	"google":    "https://generativelanguage.googleapis.com/v1beta/openai",
	"anthropic": "https://api.anthropic.com",
	"deepseek":  "https://api.deepseek.com",
	"qwen":      "https://dashscope.aliyuncs.com/compatible-mode",
}

func normalizeAndSortModels(models []string) []string {
	seen := make(map[string]struct{}, len(models))
	normalized := make([]string, 0, len(models))
	for _, modelName := range models {
		name := strings.TrimSpace(modelName)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		normalized = append(normalized, name)
	}
	sort.Strings(normalized)
	return normalized
}

func mergeAndSortModels(first, second []string) []string {
	merged := make([]string, 0, len(first)+len(second))
	merged = append(merged, first...)
	merged = append(merged, second...)
	return normalizeAndSortModels(merged)
}

func normalizeModelProviderCatalog(items []modelProviderCatalogItem) []modelProviderCatalogItem {
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
		entry := modelProviderCatalogItem{
			Provider:  provider,
			Name:      name,
			Models:    normalizeAndSortModels(item.Models),
			Source:    source,
			UpdatedAt: item.UpdatedAt,
		}
		if idx, ok := indexByProvider[provider]; ok {
			existing := normalized[idx]
			existing.Models = mergeAndSortModels(existing.Models, entry.Models)
			if existing.Name == existing.Provider && entry.Name != entry.Provider {
				existing.Name = entry.Name
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
	sort.Slice(normalized, func(i, j int) bool {
		return normalized[i].Provider < normalized[j].Provider
	})
	return normalized
}

func loadModelProviderCatalog() ([]modelProviderCatalogItem, error) {
	config.OptionMapRWMutex.RLock()
	raw := strings.TrimSpace(config.OptionMap[modelProviderCatalogOptionKey])
	config.OptionMapRWMutex.RUnlock()
	if raw == "" {
		return make([]modelProviderCatalogItem, 0), nil
	}
	items := make([]modelProviderCatalogItem, 0)
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, err
	}
	return normalizeModelProviderCatalog(items), nil
}

func saveModelProviderCatalog(items []modelProviderCatalogItem) ([]modelProviderCatalogItem, error) {
	now := helper.GetTimestamp()
	normalized := normalizeModelProviderCatalog(items)
	for i := range normalized {
		if normalized[i].UpdatedAt == 0 {
			normalized[i].UpdatedAt = now
		}
	}
	raw, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}
	if err := model.UpdateOption(modelProviderCatalogOptionKey, string(raw)); err != nil {
		return nil, err
	}
	return normalized, nil
}

func buildDefaultModelProviderCatalog() []modelProviderCatalogItem {
	providerSet := make(map[string]map[string]struct{})
	for channelType := 1; channelType < channeltype.Dummy; channelType++ {
		adaptor := relay.GetAdaptor(channeltype.ToAPIType(channelType))
		if adaptor == nil {
			continue
		}
		metaObj := &meta.Meta{ChannelType: channelType}
		adaptor.Init(metaObj)
		models := adaptor.GetModelList()
		for _, modelName := range models {
			provider := commonutils.ResolveModelProvider(modelName)
			if provider == "" || provider == "unknown" {
				continue
			}
			if providerSet[provider] == nil {
				providerSet[provider] = make(map[string]struct{})
			}
			providerSet[provider][modelName] = struct{}{}
		}
	}
	entries := make([]modelProviderCatalogItem, 0, len(providerSet))
	now := helper.GetTimestamp()
	for provider, models := range providerSet {
		list := make([]string, 0, len(models))
		for modelName := range models {
			list = append(list, modelName)
		}
		sort.Strings(list)
		entries = append(entries, modelProviderCatalogItem{
			Provider:  provider,
			Name:      provider,
			Models:    list,
			Source:    "default",
			UpdatedAt: now,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
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
// @Summary Get default model providers from built-in model lists (admin)
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

	models, err := fetchOpenAICompatibleModelIDsByBaseURL(req.Key, baseURL, provider)
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
