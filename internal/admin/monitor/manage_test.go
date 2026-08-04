package monitor

import (
	"net/http"
	"testing"

	relaymodel "github.com/yeying-community/router/internal/relay/model"
)

func TestShouldDisableChannelForZhipuInsufficientBalanceCode(t *testing.T) {
	err := &relaymodel.Error{
		Message: "余额不足或无可用资源包,请充值。",
		Code:    "1113",
	}

	if !ShouldDisableChannel(err, http.StatusTooManyRequests) {
		t.Fatalf("ShouldDisableChannel = false, want true")
	}
}

func TestShouldDisableChannelForHardFailure(t *testing.T) {
	err := &relaymodel.Error{
		Message: "用户账户已于 2026-07-03 到期，并已自动停用。",
		Type:    "one_api_error",
		Code:    "upstream_account_disabled",
	}

	if ShouldDisableChannel(err, http.StatusUnauthorized) {
		t.Fatalf("ShouldDisableChannel = true, want false for a single unauthorized response")
	}
	if !IsHardChannelFailure(err, http.StatusUnauthorized) {
		t.Fatalf("IsHardChannelFailure = false, want true")
	}
}

func TestShouldDisableChannelSkipsTransientUnauthorized(t *testing.T) {
	err := &relaymodel.Error{Message: "Invalid client API key", Type: "authentication_error"}
	if ShouldDisableChannel(err, http.StatusUnauthorized) {
		t.Fatal("generic unauthorized response should not disable the whole channel")
	}
	if !IsHardChannelFailure(err, http.StatusUnauthorized) {
		t.Fatal("unauthorized response should remain retryable")
	}
}

func TestShouldDisableChannelSkipsAllUnauthorized(t *testing.T) {
	err := &relaymodel.Error{Message: "account has been disabled", Code: "upstream_account_disabled"}
	if ShouldDisableChannel(err, http.StatusUnauthorized) {
		t.Fatal("a single unauthorized response should not disable the whole channel")
	}
}

func TestIsInsufficientBalanceError(t *testing.T) {
	tests := []struct {
		name       string
		err        *relaymodel.Error
		statusCode int
		want       bool
	}{
		{
			name:       "payment required",
			err:        &relaymodel.Error{Message: "billing required"},
			statusCode: http.StatusPaymentRequired,
			want:       true,
		},
		{
			name:       "insufficient quota type",
			err:        &relaymodel.Error{Type: "insufficient_quota", Message: "quota exceeded"},
			statusCode: http.StatusTooManyRequests,
			want:       true,
		},
		{
			name:       "zhipu balance code",
			err:        &relaymodel.Error{Code: "1113", Message: "余额不足或无可用资源包,请充值。"},
			statusCode: http.StatusTooManyRequests,
			want:       true,
		},
		{
			name:       "upstream user account expired",
			err:        &relaymodel.Error{Message: "用户账户已于 2026-07-03 到期，并已自动停用。"},
			statusCode: http.StatusUnauthorized,
			want:       true,
		},
		{
			name:       "permission error",
			err:        &relaymodel.Error{Type: "permission_error", Message: "permission denied"},
			statusCode: http.StatusForbidden,
			want:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsInsufficientBalanceError(tt.err, tt.statusCode); got != tt.want {
				t.Fatalf("IsInsufficientBalanceError = %v, want %v", got, tt.want)
			}
		})
	}
}
