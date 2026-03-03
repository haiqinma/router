package channel

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/common/client"
	commonutils "github.com/yeying-community/router/common/utils"
	"github.com/yeying-community/router/internal/relay/channeltype"
)

type previewModelsRequest struct {
	Type          int             `json:"type"`
	Key           string          `json:"key"`
	BaseURL       string          `json:"base_url"`
	Config        json.RawMessage `json:"config"`
	ModelProvider string          `json:"model_provider"`
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

func isOpenAICompatibleType(channelType int) bool {
	return channelType == channeltype.OpenAICompatible || channelType == channeltype.GeminiOpenAICompatible
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

func fetchOpenAICompatibleModelIDsByBaseURL(key, baseURL, modelProvider string) ([]string, error) {
	if strings.TrimSpace(key) == "" {
		return nil, fmt.Errorf("请先填写 Key")
	}

	provider := commonutils.NormalizeModelProvider(modelProvider)
	if strings.TrimSpace(baseURL) == "" {
		return nil, fmt.Errorf("请先填写 Base URL")
	}
	modelsURL := resolveModelsURL(baseURL)

	httpReq, err := http.NewRequest(http.MethodGet, modelsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败")
	}
	httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(key))

	resp, err := client.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求模型列表失败")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取模型列表失败")
	}

	var parsed openAIModelsResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("解析模型列表失败")
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		msg := fmt.Sprintf("模型列表请求失败（HTTP %d）", resp.StatusCode)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		return nil, fmt.Errorf("%s", msg)
	}

	modelIDs := make([]string, 0, len(parsed.Data))
	seen := make(map[string]struct{}, len(parsed.Data))
	for _, item := range parsed.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		if !commonutils.MatchModelProvider(id, item.OwnedBy, provider) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		modelIDs = append(modelIDs, id)
	}
	if len(modelIDs) == 0 {
		msg := "未返回可用模型"
		if provider != "" {
			msg = "未找到符合所选模型供应商的模型"
		}
		return nil, fmt.Errorf("%s", msg)
	}
	return modelIDs, nil
}

func fetchOpenAICompatibleModelIDs(channelType int, key, baseURL, modelProvider string) ([]string, error) {
	if !isOpenAICompatibleType(channelType) {
		return nil, fmt.Errorf("当前渠道类型暂不支持自动获取模型")
	}
	resolvedBaseURL := strings.TrimSpace(baseURL)
	if resolvedBaseURL == "" {
		resolvedBaseURL = channeltype.ChannelBaseURLs[channelType]
		if resolvedBaseURL == "" {
			resolvedBaseURL = channeltype.ChannelBaseURLs[channeltype.OpenAICompatible]
		}
	}
	return fetchOpenAICompatibleModelIDsByBaseURL(key, resolvedBaseURL, modelProvider)
}

// PreviewChannelModels godoc
// @Summary Preview models for OpenAI-compatible channel (admin)
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
	modelIDs, err := fetchOpenAICompatibleModelIDs(req.Type, req.Key, req.BaseURL, req.ModelProvider)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    modelIDs,
	})
}
