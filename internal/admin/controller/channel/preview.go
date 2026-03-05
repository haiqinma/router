package channel

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/common/client"
	"github.com/yeying-community/router/common/logger"
	commonutils "github.com/yeying-community/router/common/utils"
	channelsvc "github.com/yeying-community/router/internal/admin/service/channel"
	"github.com/yeying-community/router/internal/relay/channeltype"
)

type previewModelsRequest struct {
	Type    int             `json:"type"`
	Key     string          `json:"key"`
	BaseURL string          `json:"base_url"`
	DraftID string          `json:"draft_id"`
	Config  json.RawMessage `json:"config"`
}

type openAIModelsResponse struct {
	Data []struct {
		ID      string `json:"id"`
		OwnedBy string `json:"owned_by"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func resolveModelsURL(baseURL string) string {
	resolvedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	lower := strings.ToLower(resolvedBaseURL)
	if strings.HasSuffix(lower, "/v1") ||
		strings.HasSuffix(lower, "/openai") ||
		strings.HasSuffix(lower, "/v1beta/openai") {
		return resolvedBaseURL + "/models"
	}
	return resolvedBaseURL + "/v1/models"
}

func fetchModelsByConfiguredChannelDetailed(key, baseURL, modelProvider string) ([]string, string, error) {
	trimmedKey := strings.TrimSpace(key)
	if trimmedKey == "" {
		return nil, "", fmt.Errorf("请先填写 Key")
	}
	trimmedBaseURL := strings.TrimSpace(baseURL)
	if trimmedBaseURL == "" {
		return nil, "", fmt.Errorf("请先填写 Base URL")
	}

	modelsURL := resolveModelsURL(trimmedBaseURL)
	httpReq, err := http.NewRequest(http.MethodGet, modelsURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("创建请求失败")
	}
	httpReq.Header.Set("Authorization", "Bearer "+trimmedKey)

	resp, err := client.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, "", fmt.Errorf("请求模型列表失败")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("读取模型列表失败")
	}

	var parsed openAIModelsResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, "", fmt.Errorf("解析模型列表失败")
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message := fmt.Sprintf("模型列表请求失败（HTTP %d）", resp.StatusCode)
		if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
			message = parsed.Error.Message
		}
		return nil, modelsURL, fmt.Errorf("%s", message)
	}

	provider := commonutils.NormalizeModelProvider(modelProvider)
	seen := make(map[string]struct{}, len(parsed.Data))
	modelIDs := make([]string, 0, len(parsed.Data))
	for _, item := range parsed.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		if provider != "" && !commonutils.MatchModelProvider(id, item.OwnedBy, provider) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		modelIDs = append(modelIDs, id)
	}
	if len(modelIDs) == 0 {
		if provider != "" {
			return nil, modelsURL, fmt.Errorf("未找到符合所选模型供应商的模型")
		}
		return nil, modelsURL, fmt.Errorf("未返回可用模型")
	}
	return modelIDs, modelsURL, nil
}

func fetchModelsByConfiguredChannel(key, baseURL, modelProvider string) ([]string, error) {
	modelIDs, _, err := fetchModelsByConfiguredChannelDetailed(key, baseURL, modelProvider)
	return modelIDs, err
}

func fetchOpenAICompatibleModelIDsByBaseURL(key, baseURL, modelProvider string) ([]string, error) {
	return fetchModelsByConfiguredChannel(key, baseURL, modelProvider)
}

func resolvePreviewBaseURL(channelType int, baseURL string) string {
	trimmedBaseURL := strings.TrimSpace(baseURL)
	if trimmedBaseURL != "" {
		return trimmedBaseURL
	}
	if channelType <= 0 || channelType >= channeltype.Dummy {
		return ""
	}
	return strings.TrimSpace(channeltype.ChannelBaseURLs[channelType])
}

// PreviewChannelModels godoc
// @Summary Preview models for channel type (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body docs.ChannelPreviewModelsRequest true "Preview payload"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/channel/preview/models [post]
func PreviewChannelModels(c *gin.Context) {
	var req previewModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	channelType := req.Type
	key := strings.TrimSpace(req.Key)
	baseURL := strings.TrimSpace(req.BaseURL)
	draftID := strings.TrimSpace(req.DraftID)
	keySource := "request"
	if draftID != "" && key == "" {
		channel, err := channelsvc.GetByID(draftID, true)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "渠道不存在或已删除",
			})
			return
		}
		key = strings.TrimSpace(channel.Key)
		keySource = "draft"
		if channelType == 0 {
			channelType = channel.Type
		}
		if baseURL == "" {
			baseURL = strings.TrimSpace(channel.GetBaseURL())
		}
	}

	baseURL = resolvePreviewBaseURL(channelType, baseURL)
	modelIDs, modelsURL, err := fetchModelsByConfiguredChannelDetailed(key, baseURL, "")
	if err != nil {
		logger.SysWarnf("channel preview models failed: source=%s draft_id=%s models_url=%s err=%v", keySource, draftID, modelsURL, err)
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	logger.SysLogf("channel preview models fetched: source=%s draft_id=%s models_url=%s count=%d", keySource, draftID, modelsURL, len(modelIDs))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    modelIDs,
		"meta": gin.H{
			"source":     "channel",
			"key_source": keySource,
			"draft_id":   draftID,
			"models_url": modelsURL,
		},
	})
}
