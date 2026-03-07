package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	dbmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/admin/monitor"
	"github.com/yeying-community/router/internal/relay/controller"
	relaylogging "github.com/yeying-community/router/internal/relay/logging"
	"github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
	"github.com/yeying-community/router/internal/transport/http/middleware"
)

// https://platform.openai.com/docs/api-reference/chat

func relayHelper(c *gin.Context, relayMode int) *model.ErrorWithStatusCode {
	var err *model.ErrorWithStatusCode
	switch relayMode {
	case relaymode.ImagesGenerations:
		err = controller.RelayImageHelper(c, relayMode)
	case relaymode.AudioSpeech:
		fallthrough
	case relaymode.AudioTranslation:
		fallthrough
	case relaymode.AudioTranscription:
		err = controller.RelayAudioHelper(c, relayMode)
	case relaymode.Proxy:
		err = controller.RelayProxyHelper(c, relayMode)
	default:
		err = controller.RelayTextHelper(c)
	}
	return err
}

// Relay godoc
// @Summary OpenAI-compatible relay
// @Tags public
// @Security BearerAuth
// @Accept json
// @Produce json
func Relay(c *gin.Context) {
	ctx := c.Request.Context()
	c.Set(ctxkey.RelayRetryCount, 0)
	c.Set(ctxkey.RelayError, "")
	relayMode := getEffectiveRelayMode(c)
	if config.DebugEnabled {
		requestBody, _ := common.GetRequestBody(c)
		logger.Debugf(ctx, "request body: %s", string(requestBody))
	}
	channelId := c.GetString(ctxkey.ChannelId)
	userId := c.GetString(ctxkey.Id)
	bizErr := relayHelper(c, relayMode)
	if bizErr == nil {
		monitor.Emit(channelId, true)
		return
	}
	lastFailedChannelId := channelId
	channelName := c.GetString(ctxkey.ChannelName)
	group := c.GetString(ctxkey.Group)
	originalModel := c.GetString(ctxkey.OriginalModel)
	go processChannelRelayError(ctx, userId, channelId, channelName, *bizErr)
	traceID := c.GetString(helper.TraceIDKey)
	retryTimes := config.RetryTimes
	retryCount := 0
	if !shouldRetry(c, bizErr.StatusCode) {
		logger.RelayWarnf(ctx, relaylogging.NewFields("RETRY").
			String("decision", "skip").
			Int("status", bizErr.StatusCode).
			String("channel_id", channelId).
			String("channel_name", channelName).
			String("group", group).
			String("model", originalModel).
			String("reason", "status_not_retryable").
			Build())
		retryTimes = 0
	}
	for i := retryTimes; i > 0; i-- {
		channel, err := dbmodel.CacheGetRandomSatisfiedChannel(group, originalModel, i != retryTimes)
		if err != nil {
			logger.RelayErrorf(ctx, relaylogging.NewFields("RETRY").
				String("decision", "select_failed").
				String("group", group).
				String("model", originalModel).
				String("error", err.Error()).
				Build())
			break
		}
		if channel.Id == lastFailedChannelId {
			continue
		}
		retryCount++
		c.Set(ctxkey.RelayRetryCount, retryCount)
		logger.RelayWarnf(ctx, relaylogging.NewFields("RETRY").
			String("decision", "switch").
			Int("attempt", retryCount).
			String("group", group).
			String("model", originalModel).
			String("from_channel_id", lastFailedChannelId).
			String("to_channel_id", channel.Id).
			String("to_channel_name", channel.Name).
			Int("remaining", i-1).
			Build())
		middleware.SetupContextForSelectedChannel(c, channel, originalModel)
		requestBody, err := common.GetRequestBody(c)
		c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		relayMode = getEffectiveRelayMode(c)
		bizErr = relayHelper(c, relayMode)
		if bizErr == nil {
			return
		}
		channelId := c.GetString(ctxkey.ChannelId)
		lastFailedChannelId = channelId
		channelName := c.GetString(ctxkey.ChannelName)
		go processChannelRelayError(ctx, userId, channelId, channelName, *bizErr)
	}
	if bizErr != nil {
		if bizErr.StatusCode == http.StatusTooManyRequests {
			bizErr.Error.Message = "当前分组上游负载已饱和，请稍后再试"
		}
		c.Set(ctxkey.RelayError, bizErr.Error.Message)
		logger.RelayErrorf(ctx, relaylogging.NewFields("FAIL").
			Int("status", bizErr.StatusCode).
			String("channel_id", lastFailedChannelId).
			String("channel_name", channelName).
			String("group", group).
			String("model", originalModel).
			Int("retry_count", retryCount).
			String("error", bizErr.Error.Message).
			Build())

		// BUG: bizErr is in race condition
		bizErr.Error.Message = helper.MessageWithTraceID(bizErr.Error.Message, traceID)
		c.JSON(bizErr.StatusCode, gin.H{
			"error": bizErr.Error,
		})
	}
}

func getEffectiveRelayMode(c *gin.Context) int {
	return relaymode.GetByPath(c.Request.URL.Path)
}

func shouldRetry(c *gin.Context, statusCode int) bool {
	if _, ok := c.Get(ctxkey.SpecificChannelId); ok {
		return false
	}
	if statusCode == http.StatusTooManyRequests {
		return true
	}
	if statusCode/100 == 5 {
		return true
	}
	if statusCode == http.StatusBadRequest {
		return false
	}
	if statusCode/100 == 2 {
		return false
	}
	return true
}

func processChannelRelayError(ctx context.Context, userId string, channelId string, channelName string, err model.ErrorWithStatusCode) {
	msg := relaylogging.NewFields("UPSTREAM_ERR").
		String("channel_id", channelId).
		String("channel_name", channelName).
		String("user_id", userId).
		Int("status", err.StatusCode).
		String("error", err.Message).
		Build()
	if err.StatusCode >= http.StatusInternalServerError {
		logger.RelayErrorf(ctx, msg)
	} else {
		logger.RelayWarnf(ctx, msg)
	}
	// https://platform.openai.com/docs/guides/error-codes/api-errors
	if monitor.ShouldDisableChannel(&err.Error, err.StatusCode) {
		monitor.DisableChannel(channelId, channelName, err.Message)
	} else {
		monitor.Emit(channelId, false)
	}
}

// RelayNotImplemented godoc
// @Summary OpenAI-compatible endpoint not implemented
// @Tags public
// @Security BearerAuth
// @Produce json
// @Success 501 {object} docs.OpenAIErrorResponse
// @Router /api/v1/public/images/edits [post]
// @Router /api/v1/public/images/variations [post]
// @Router /api/v1/public/files [get]
// @Router /api/v1/public/files [post]
// @Router /api/v1/public/files/{id} [delete]
// @Router /api/v1/public/files/{id} [get]
// @Router /api/v1/public/files/{id}/content [get]
// @Router /api/v1/public/fine_tuning/jobs [post]
// @Router /api/v1/public/fine_tuning/jobs [get]
// @Router /api/v1/public/fine_tuning/jobs/{id} [get]
// @Router /api/v1/public/fine_tuning/jobs/{id}/cancel [post]
// @Router /api/v1/public/fine_tuning/jobs/{id}/events [get]
// @Router /api/v1/public/models/{model} [delete]
// @Router /api/v1/public/assistants [post]
// @Router /api/v1/public/assistants [get]
// @Router /api/v1/public/assistants/{id} [get]
// @Router /api/v1/public/assistants/{id} [post]
// @Router /api/v1/public/assistants/{id} [delete]
// @Router /api/v1/public/assistants/{id}/files [post]
// @Router /api/v1/public/assistants/{id}/files [get]
// @Router /api/v1/public/assistants/{id}/files/{fileId} [get]
// @Router /api/v1/public/assistants/{id}/files/{fileId} [delete]
// @Router /api/v1/public/threads [post]
// @Router /api/v1/public/threads/{id} [get]
// @Router /api/v1/public/threads/{id} [post]
// @Router /api/v1/public/threads/{id} [delete]
// @Router /api/v1/public/threads/{id}/messages [post]
// @Router /api/v1/public/threads/{id}/messages/{messageId} [get]
// @Router /api/v1/public/threads/{id}/messages/{messageId} [post]
// @Router /api/v1/public/threads/{id}/messages/{messageId}/files/{filesId} [get]
// @Router /api/v1/public/threads/{id}/messages/{messageId}/files [get]
// @Router /api/v1/public/threads/{id}/runs [post]
// @Router /api/v1/public/threads/{id}/runs [get]
// @Router /api/v1/public/threads/{id}/runs/{runsId} [get]
// @Router /api/v1/public/threads/{id}/runs/{runsId} [post]
// @Router /api/v1/public/threads/{id}/runs/{runsId}/submit_tool_outputs [post]
// @Router /api/v1/public/threads/{id}/runs/{runsId}/cancel [post]
// @Router /api/v1/public/threads/{id}/runs/{runsId}/steps/{stepId} [get]
// @Router /api/v1/public/threads/{id}/runs/{runsId}/steps [get]
func RelayNotImplemented(c *gin.Context) {
	err := model.Error{
		Message: "API not implemented",
		Type:    "one_api_error",
		Param:   "",
		Code:    "api_not_implemented",
	}
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": err,
	})
}

func RelayNotFound(c *gin.Context) {
	err := model.Error{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
}
