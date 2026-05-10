package channel

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/internal/admin/model"
	channelsvc "github.com/yeying-community/router/internal/admin/service/channel"
)

type updateChannelEndpointRequest struct {
	Model    string `json:"model"`
	Endpoint string `json:"endpoint"`
	BaseURL  string `json:"base_url"`
	Enabled  *bool  `json:"enabled"`
}

type channelEndpointItem struct {
	ChannelId string `json:"channel_id"`
	Model     string `json:"model"`
	Endpoint  string `json:"endpoint"`
	BaseURL   string `json:"base_url,omitempty"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt int64  `json:"updated_at"`
}

// GetChannelEndpoints godoc
// @Summary List channel endpoint capabilities (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param id path string true "Channel ID"
// @Param model query string false "Model"
// @Param endpoint query string false "Endpoint"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/channel/{id}/endpoints [get]
func GetChannelEndpoints(c *gin.Context) {
	channelID := strings.TrimSpace(c.Param("id"))
	if channelID == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "渠道 ID 无效",
		})
		return
	}
	modelName := strings.TrimSpace(c.Query("model"))
	endpoint := strings.TrimSpace(c.Query("endpoint"))
	explicitRows, err := model.ListChannelModelEndpointsByChannelIDWithDB(model.DB, channelID, modelName, endpoint)
	if err != nil {
		logChannelAdminWarn(c, "list_endpoints", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	snapshotRows, err := model.ListChannelModelEndpointCandidatesByChannelIDWithDB(model.DB, channelID, modelName, endpoint)
	if err != nil {
		logChannelAdminWarn(c, "list_endpoints", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	mergedRows := model.MergeChannelModelEndpointListRows(snapshotRows, explicitRows)
	items := make([]channelEndpointItem, 0, len(mergedRows))
	for _, row := range mergedRows {
		items = append(items, channelEndpointItem{
			ChannelId: row.ChannelId,
			Model:     row.Model,
			Endpoint:  row.Endpoint,
			BaseURL:   row.BaseURL,
			Enabled:   row.Enabled,
			UpdatedAt: row.UpdatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items": items,
			"total": len(items),
		},
	})
}

// UpdateChannelEndpoint godoc
// @Summary Upsert channel endpoint capability (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Channel ID"
// @Param body body docs.StandardResponse true "Endpoint capability payload"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/channel/{id}/endpoints [put]
func UpdateChannelEndpoint(c *gin.Context) {
	channelID := strings.TrimSpace(c.Param("id"))
	if channelID == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "渠道 ID 无效",
		})
		return
	}
	req := updateChannelEndpointRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		logChannelAdminWarn(c, "update_endpoint", stringField("channel_id", channelID), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	channelRow, err := channelsvc.GetByID(channelID)
	if err != nil {
		logChannelAdminWarn(c, "update_endpoint", stringField("channel_id", channelID), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	modelName := strings.TrimSpace(req.Model)
	endpoint := model.NormalizeRequestedChannelModelEndpoint(req.Endpoint)
	if modelName == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model 不能为空",
		})
		return
	}
	if endpoint == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "endpoint 无效",
		})
		return
	}
	snapshotRows, err := model.ListChannelModelEndpointCandidatesByChannelIDWithDB(model.DB, channelID, modelName, endpoint)
	if err != nil {
		logChannelAdminWarn(c, "update_endpoint", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if !model.HasChannelModelEndpoint(snapshotRows, modelName, endpoint) {
		message := "该渠道当前未启用该模型端点，无法更新端点状态"
		logChannelAdminWarn(c, "update_endpoint", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("reason", message))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": message,
		})
		return
	}
	explicitRows, err := model.ListChannelModelEndpointsByChannelIDWithDB(model.DB, channelID, "", "")
	if err != nil {
		logChannelAdminWarn(c, "update_endpoint", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	row := model.ChannelModelEndpoint{
		ChannelId: channelRow.Id,
		Model:     modelName,
		Endpoint:  endpoint,
		BaseURL:   strings.TrimSpace(req.BaseURL),
		Enabled:   enabled,
	}
	if err := model.ReplaceChannelModelEndpointsWithDB(model.DB, channelID, mergeUpdatedChannelEndpointRows(explicitRows, row)); err != nil {
		logChannelAdminWarn(c, "update_endpoint", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("reason", err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	logChannelAdminInfo(c, "update_endpoint", stringField("channel_id", channelID), stringField("model", modelName), stringField("endpoint", endpoint), stringField("enabled", map[bool]string{true: "true", false: "false"}[enabled]))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": channelEndpointItem{
			ChannelId: channelRow.Id,
			Model:     modelName,
			Endpoint:  endpoint,
			BaseURL:   strings.TrimSpace(req.BaseURL),
			Enabled:   enabled,
		},
	})
}

func mergeUpdatedChannelEndpointRows(rows []model.ChannelModelEndpoint, updated model.ChannelModelEndpoint) []model.ChannelModelEndpoint {
	normalizedUpdated := model.ChannelModelEndpoint{
		ChannelId: strings.TrimSpace(updated.ChannelId),
		Model:     strings.TrimSpace(updated.Model),
		Endpoint:  model.NormalizeRequestedChannelModelEndpoint(updated.Endpoint),
		BaseURL:   strings.TrimSpace(updated.BaseURL),
		Enabled:   updated.Enabled,
		UpdatedAt: updated.UpdatedAt,
	}
	result := make([]model.ChannelModelEndpoint, 0, len(rows)+1)
	replaced := false
	for _, row := range rows {
		normalizedRow := model.ChannelModelEndpoint{
			ChannelId: strings.TrimSpace(row.ChannelId),
			Model:     strings.TrimSpace(row.Model),
			Endpoint:  model.NormalizeRequestedChannelModelEndpoint(row.Endpoint),
			BaseURL:   strings.TrimSpace(row.BaseURL),
			Enabled:   row.Enabled,
			UpdatedAt: row.UpdatedAt,
		}
		if normalizedRow.ChannelId == normalizedUpdated.ChannelId &&
			normalizedRow.Model == normalizedUpdated.Model &&
			normalizedRow.Endpoint == normalizedUpdated.Endpoint {
			normalizedRow.BaseURL = normalizedUpdated.BaseURL
			normalizedRow.Enabled = normalizedUpdated.Enabled
			replaced = true
		}
		if normalizedRow.ChannelId == "" || normalizedRow.Model == "" || normalizedRow.Endpoint == "" {
			continue
		}
		result = append(result, normalizedRow)
	}
	if !replaced && normalizedUpdated.ChannelId != "" && normalizedUpdated.Model != "" && normalizedUpdated.Endpoint != "" {
		result = append(result, normalizedUpdated)
	}
	return result
}
