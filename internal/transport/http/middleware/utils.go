package middleware

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
)

func abortWithMessage(c *gin.Context, statusCode int, message string) {
	errorType := c.GetString(ctxkey.RelayErrorType)
	if errorType == "" {
		errorType = "one_api_error"
	}
	errorCode := c.GetString(ctxkey.RelayErrorCode)
	if errorCode == "" {
		errorCode = "request_aborted"
	}
	c.Set(ctxkey.RelayError, strings.TrimSpace(message))
	c.Set(ctxkey.RelayErrorType, errorType)
	c.Set(ctxkey.RelayErrorCode, errorCode)
	c.JSON(statusCode, gin.H{
		"error": gin.H{
			"message": helper.MessageWithTraceID(message, c.GetString(helper.TraceIDKey)),
			"type":    errorType,
			"code":    errorCode,
		},
	})
	c.Abort()
	logger.Warnf(c.Request.Context(), "request aborted status=%d reason=%q path=%s", statusCode, strings.TrimSpace(message), c.Request.URL.Path)
}

func normalizeRelayPath(path string) string {
	if strings.HasPrefix(path, "/api/v1/public/") {
		return "/v1/" + strings.TrimPrefix(path, "/api/v1/public/")
	}
	return path
}

func getRequestModel(c *gin.Context) (string, error) {
	var modelRequest ModelRequest
	err := common.UnmarshalBodyReusable(c, &modelRequest)
	if err != nil {
		return "", fmt.Errorf("common.UnmarshalBodyReusable failed: %w", err)
	}
	path := normalizeRelayPath(c.Request.URL.Path)
	if strings.HasPrefix(path, "/v1/moderations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "text-moderation-stable"
		}
	}
	if strings.HasSuffix(path, "embeddings") {
		if modelRequest.Model == "" {
			modelRequest.Model = c.Param("model")
		}
	}
	if strings.HasPrefix(path, "/v1/images/generations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "dall-e-2"
		}
	}
	if strings.HasPrefix(path, "/v1/images/edits") && modelRequest.Model == "" {
		if modelValue := strings.TrimSpace(c.PostForm("model")); modelValue != "" {
			modelRequest.Model = modelValue
		}
	}
	if strings.HasPrefix(path, "/v1/audio/transcriptions") || strings.HasPrefix(path, "/v1/audio/translations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "whisper-1"
		}
	}
	if strings.HasPrefix(path, "/v1/videos") && modelRequest.Model == "" {
		if modelValue := strings.TrimSpace(c.Query("model")); modelValue != "" {
			modelRequest.Model = modelValue
		} else if modelValue := strings.TrimSpace(c.PostForm("model")); modelValue != "" {
			modelRequest.Model = modelValue
		}
	}
	if strings.HasPrefix(path, "/v1/realtime") && modelRequest.Model == "" {
		if modelValue := strings.TrimSpace(c.Query("model")); modelValue != "" {
			modelRequest.Model = modelValue
		} else if rawBody, bodyErr := common.GetRequestBody(c); bodyErr == nil && len(rawBody) > 0 {
			payload := map[string]any{}
			if err := json.Unmarshal(rawBody, &payload); err == nil {
				if modelValue := strings.TrimSpace(fmt.Sprint(payload["model"])); modelValue != "" && modelValue != "<nil>" {
					modelRequest.Model = modelValue
				} else if sessionValue, ok := payload["session"].(map[string]any); ok {
					if modelValue := strings.TrimSpace(fmt.Sprint(sessionValue["model"])); modelValue != "" && modelValue != "<nil>" {
						modelRequest.Model = modelValue
					}
				}
			}
		}
	}
	return modelRequest.Model, nil
}

func isModelInList(modelName string, models string) bool {
	modelList := strings.Split(models, ",")
	for _, model := range modelList {
		if modelName == model {
			return true
		}
	}
	return false
}
