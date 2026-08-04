package monitor

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/yeying-community/router/internal/relay/model"
)

func ShouldDisableChannel(err *model.Error, statusCode int) bool {
	if statusCode == http.StatusUnauthorized {
		return false
	}
	return IsHardChannelFailure(err, statusCode)
}

func IsHardChannelFailure(err *model.Error, statusCode int) bool {
	if err == nil {
		return false
	}
	if statusCode == http.StatusUnauthorized {
		return true
	}
	switch err.Type {
	case "insufficient_quota", "authentication_error", "permission_error", "forbidden":
		return true
	}
	code := strings.ToLower(strings.TrimSpace(fmt.Sprint(err.Code)))
	if code == "invalid_api_key" || code == "account_deactivated" || code == "1113" {
		return true
	}
	lowerMessage := strings.ToLower(err.Message)
	return strings.Contains(lowerMessage, "your credit balance is too low") ||
		strings.Contains(lowerMessage, "organization has been disabled") ||
		strings.Contains(lowerMessage, "permission denied") ||
		strings.Contains(lowerMessage, "organization has been restricted") || // groq
		strings.Contains(lowerMessage, "api key not valid") || // gemini
		strings.Contains(lowerMessage, "api key expired") || // gemini
		strings.Contains(lowerMessage, "已欠费") ||
		strings.Contains(lowerMessage, "余额不足") ||
		strings.Contains(lowerMessage, "无可用资源包") ||
		strings.Contains(lowerMessage, "用户账户已于") ||
		strings.Contains(lowerMessage, "账户已于") ||
		strings.Contains(lowerMessage, "自动停用")
}

func IsInsufficientBalanceError(err *model.Error, statusCode int) bool {
	if err == nil {
		return false
	}
	if statusCode == http.StatusPaymentRequired {
		return true
	}
	lowerType := strings.ToLower(strings.TrimSpace(err.Type))
	if lowerType == "insufficient_quota" || lowerType == "billing_error" {
		return true
	}
	code := strings.ToLower(strings.TrimSpace(fmt.Sprint(err.Code)))
	if code == "insufficient_quota" || code == "billing_hard_limit_reached" || code == "1113" {
		return true
	}
	lowerMessage := strings.ToLower(strings.TrimSpace(err.Message))
	return strings.Contains(lowerMessage, "your credit balance is too low") ||
		strings.Contains(lowerMessage, "credit") ||
		strings.Contains(lowerMessage, "balance") ||
		strings.Contains(lowerMessage, "已欠费") ||
		strings.Contains(lowerMessage, "余额不足") ||
		strings.Contains(lowerMessage, "无可用资源包") ||
		strings.Contains(lowerMessage, "用户账户已于") ||
		strings.Contains(lowerMessage, "账户已于") ||
		strings.Contains(lowerMessage, "自动停用")
}
