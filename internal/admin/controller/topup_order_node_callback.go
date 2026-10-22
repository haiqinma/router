package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/internal/admin/model"
	usersvc "github.com/yeying-community/router/internal/admin/service/user"
)

const nodePaymentMaxWebhookBody = 1 << 20

type nodePaymentWebhookPayload struct {
	EventID         string `json:"eventId"`
	Type            string `json:"type"`
	MerchantID      string `json:"merchantId"`
	TradeNo         string `json:"tradeNo"`
	ExternalOrderID string `json:"externalOrderId"`
	AmountMinor     string `json:"amountMinor"`
	Currency        string `json:"currency"`
	Provider        string `json:"provider"`
	ProviderOrderID string `json:"providerOrderId"`
	PaidAt          string `json:"paidAt"`
}

func decodeNodePaymentWebhook(raw []byte) (map[string]any, nodePaymentWebhookPayload, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	body := map[string]any{}
	if err := decoder.Decode(&body); err != nil {
		return nil, nodePaymentWebhookPayload{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, nodePaymentWebhookPayload{}, errInvalidNodePaymentWebhook
	}
	var payload nodePaymentWebhookPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, nodePaymentWebhookPayload{}, err
	}
	return body, payload, nil
}

var errInvalidNodePaymentWebhook = &nodePaymentWebhookError{}

type nodePaymentWebhookError struct{}

func (*nodePaymentWebhookError) Error() string { return "invalid JSON payload" }

func nodePaymentWebhookTimestamp(raw string, now time.Time) bool {
	if len(raw) < 10 || len(raw) > 13 {
		return false
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return false
	}
	if len(raw) == 10 {
		value *= 1000
	}
	delta := now.UnixMilli() - value
	if delta < 0 {
		delta = -delta
	}
	return delta <= (5 * time.Minute).Milliseconds()
}

func ProcessNodePaymentWebhook(c *gin.Context) {
	if config.EffectiveTopUpMode() != config.TopUpModeNode || strings.TrimSpace(config.TopUpNodeMerchantSecret) == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "payment webhook is not enabled"})
		return
	}
	if c.Request.ContentLength > nodePaymentMaxWebhookBody {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "payment webhook payload too large"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, nodePaymentMaxWebhookBody)
	raw, err := common.GetRequestBody(c)
	if err != nil || len(raw) > nodePaymentMaxWebhookBody {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "payment webhook payload too large"})
		return
	}
	body, payload, err := decodeNodePaymentWebhook(raw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid payment webhook payload"})
		return
	}
	eventID := strings.TrimSpace(c.GetHeader("X-Yeying-Payment-Event"))
	timestamp := strings.TrimSpace(c.GetHeader("X-Yeying-Payment-Timestamp"))
	nonce := strings.TrimSpace(c.GetHeader("X-Yeying-Payment-Nonce"))
	signature := strings.TrimSpace(c.GetHeader("X-Yeying-Payment-Signature"))
	configuredMerchantID := strings.TrimSpace(config.TopUpNodeMerchantID)
	if configuredMerchantID == "" || payload.MerchantID != configuredMerchantID ||
		eventID == "" || eventID != payload.EventID || nonce == "" || nonce != payload.EventID ||
		!nodePaymentWebhookTimestamp(timestamp, time.Now()) ||
		!model.VerifyNodePaymentSignature(configuredMerchantID, timestamp, nonce, body, signature, config.TopUpNodeMerchantSecret) {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "invalid payment webhook signature"})
		return
	}
	if payload.Type != "payment.succeeded" || payload.TradeNo == "" || payload.ExternalOrderID == "" ||
		payload.AmountMinor == "" || payload.Currency == "" || payload.ProviderOrderID == "" || payload.PaidAt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid payment webhook fields"})
		return
	}
	order, err := model.GetTopupOrderByIDForAdminWithDB(model.DB, payload.ExternalOrderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "payment order not found"})
		return
	}
	expectedAmount, err := model.TopupOrderAmountMinor(order)
	if err != nil || order.Source != model.TopupOrderSourceTopUpAPI || !model.IsNodeTopupOrder(order) ||
		order.ProviderOrderID != payload.TradeNo || payload.AmountMinor != expectedAmount ||
		!strings.EqualFold(order.Currency, payload.Currency) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "payment webhook does not match order"})
		return
	}
	parsedPaidAt, parseErr := time.Parse(time.RFC3339Nano, payload.PaidAt)
	if parseErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid paidAt"})
		return
	}
	paidAt := parsedPaidAt.Unix()
	order, err = model.ApplyTopupOrderCallbackWithDB(model.DB, model.TopupOrderCallbackInput{
		OrderID:         order.Id,
		TransactionID:   order.TransactionID,
		ProviderOrderID: payload.TradeNo,
		Status:          model.TopupOrderStatusPaid,
		ProviderName:    model.NodePaymentProviderName(),
		PaidAt:          paidAt,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "payment callback processing failed"})
		return
	}
	if order.Status == model.TopupOrderStatusPaid {
		fulfilledOrder, fulfilledNow, fulfillErr := model.FulfillTopupOrderWithDB(model.DB, order.Id)
		if fulfillErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "payment fulfillment failed"})
			return
		}
		order = fulfilledOrder
		if fulfilledNow && order.BusinessType == model.TopupOrderBusinessBalance && order.Quota > 0 {
			usersvc.RecordTopupLog(c.Request.Context(), order.UserID, "Node 支付充值 "+strconv.FormatInt(order.Quota, 10)+" 额度", order.Quota)
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"eventId": payload.EventID, "status": order.Status}})
}
