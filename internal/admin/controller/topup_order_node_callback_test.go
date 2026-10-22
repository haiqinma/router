package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/config"
)

func TestNodePaymentWebhookTimestampWindow(t *testing.T) {
	now := time.UnixMilli(1792581689508)
	if !nodePaymentWebhookTimestamp("1792581689508", now) {
		t.Fatal("current millisecond timestamp should be accepted")
	}
	if !nodePaymentWebhookTimestamp("1792581689", now) {
		t.Fatal("current second timestamp should be accepted")
	}
	if nodePaymentWebhookTimestamp("1792581389507", now) {
		t.Fatal("timestamp outside the five-minute window should be rejected")
	}
	if nodePaymentWebhookTimestamp("not-a-time", now) || nodePaymentWebhookTimestamp("123", now) {
		t.Fatal("malformed timestamp should be rejected")
	}
}

func TestProcessNodePaymentWebhookRejectsInvalidSignatureBeforeDatabaseAccess(t *testing.T) {
	previousMode := config.TopUpMode
	previousMerchantID := config.TopUpNodeMerchantID
	previousSecret := config.TopUpNodeMerchantSecret
	config.TopUpMode = config.TopUpModeNode
	config.TopUpNodeMerchantID = "pm_test"
	config.TopUpNodeMerchantSecret = "merchant-secret"
	t.Cleanup(func() {
		config.TopUpMode = previousMode
		config.TopUpNodeMerchantID = previousMerchantID
		config.TopUpNodeMerchantSecret = previousSecret
	})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/v1/public/payment/node/webhook", ProcessNodePaymentWebhook)
	body := `{"eventId":"payment.succeeded:PAY1","type":"payment.succeeded","merchantId":"pm_test","tradeNo":"PAY1","externalOrderId":"order-1","amountMinor":"100","currency":"CNY","provider":"wechat","providerOrderId":"wx-1"}`
	request := httptest.NewRequest(http.MethodPost, "/api/v1/public/payment/node/webhook", strings.NewReader(body))
	eventID := "payment.succeeded:PAY1"
	request.Header.Set("X-Yeying-Payment-Event", eventID)
	request.Header.Set("X-Yeying-Payment-Timestamp", fmt.Sprint(time.Now().UnixMilli()))
	request.Header.Set("X-Yeying-Payment-Nonce", eventID)
	request.Header.Set("X-Yeying-Payment-Signature", "sha256="+strings.Repeat("0", 64))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusUnauthorized, recorder.Body.String())
	}
}

func TestDecodeNodePaymentWebhookRejectsTrailingJSON(t *testing.T) {
	raw := []byte(`{"eventId":"event-1","amountMinor":"100"}`)
	body, payload, err := decodeNodePaymentWebhook(raw)
	if err != nil {
		t.Fatal(err)
	}
	if payload.EventID != "event-1" || body["amountMinor"] != "100" {
		t.Fatalf("decoded body=%#v payload=%#v", body, payload)
	}
	if _, _, err := decodeNodePaymentWebhook([]byte(`{"eventId":"event-1"} {"eventId":"event-2"}`)); err == nil || !strings.Contains(err.Error(), "invalid JSON") {
		t.Fatalf("expected trailing JSON rejection, got %v", err)
	}
}
