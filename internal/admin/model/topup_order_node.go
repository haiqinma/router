package model

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/random"
)

const (
	nodePaymentProviderName = "yeying-node"
	nodePaymentCreatePath   = "/api/v1/public/payment/gateway/transactions"
	nodePaymentQueryPath    = "/api/v1/public/payment/gateway/transactions/query"
	nodePaymentCancelPath   = "/api/v1/public/payment/gateway/transactions/cancel"
	nodePaymentMaxResponse  = 1 << 20
)

func NodePaymentProviderName() string { return nodePaymentProviderName }

type nodePaymentCreateResponse struct {
	TradeNo         string `json:"tradeNo"`
	ExternalOrderID string `json:"externalOrderId"`
	Status          string `json:"status"`
	PaymentURL      string `json:"paymentUrl"`
	ExpiresAt       string `json:"expiresAt"`
}

type nodePaymentQueryResponse nodePaymentCreateResponse

type nodePaymentEnvelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type nodePaymentRequest struct {
	MerchantID string
	Timestamp  string
	Nonce      string
	Body       map[string]any
}

func canonicalNodePaymentJSON(value any) (string, error) {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		var builder strings.Builder
		builder.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				builder.WriteByte(',')
			}
			encodedKey, err := nodePaymentJSONString(key)
			if err != nil {
				return "", err
			}
			encodedValue, err := canonicalNodePaymentJSON(typed[key])
			if err != nil {
				return "", err
			}
			builder.WriteString(encodedKey)
			builder.WriteByte(':')
			builder.WriteString(encodedValue)
		}
		builder.WriteByte('}')
		return builder.String(), nil
	case []any:
		parts := make([]string, len(typed))
		for index, item := range typed {
			encoded, err := canonicalNodePaymentJSON(item)
			if err != nil {
				return "", err
			}
			parts[index] = encoded
		}
		return "[" + strings.Join(parts, ",") + "]", nil
	default:
		if text, ok := value.(string); ok {
			return nodePaymentJSONString(text)
		}
		var buffer bytes.Buffer
		encoder := json.NewEncoder(&buffer)
		encoder.SetEscapeHTML(false)
		err := encoder.Encode(value)
		if err != nil {
			return "", err
		}
		return strings.TrimSuffix(buffer.String(), "\n"), nil
	}
}

func nodePaymentJSONString(value string) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	result := string(encoded)
	for _, pair := range [][2]string{
		{`\u003c`, "<"}, {`\u003e`, ">"}, {`\u0026`, "&"},
		{`\u2028`, "\u2028"}, {`\u2029`, "\u2029"},
	} {
		result = strings.ReplaceAll(result, pair[0], pair[1])
	}
	return result, nil
}

func nodePaymentSignature(input nodePaymentRequest, secret string) (string, error) {
	canonical, err := canonicalNodePaymentJSON(input.Body)
	if err != nil {
		return "", err
	}
	message := strings.Join([]string{input.MerchantID, input.Timestamp, input.Nonce, canonical}, ".")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	return "sha256=" + hex.EncodeToString(mac.Sum(nil)), nil
}

func VerifyNodePaymentSignature(merchantID, timestamp, nonce string, body map[string]any, signature, secret string) bool {
	provided := strings.TrimSpace(signature)
	if !strings.HasPrefix(provided, "sha256=") || len(provided) != len("sha256=")+sha256.Size*2 {
		return false
	}
	providedMAC, err := hex.DecodeString(strings.TrimPrefix(provided, "sha256="))
	if err != nil {
		return false
	}
	expected, err := nodePaymentSignature(nodePaymentRequest{
		MerchantID: merchantID,
		Timestamp:  timestamp,
		Nonce:      nonce,
		Body:       body,
	}, secret)
	if err != nil {
		return false
	}
	expectedMAC, err := hex.DecodeString(strings.TrimPrefix(expected, "sha256="))
	return err == nil && hmac.Equal(providedMAC, expectedMAC)
}

func nodePaymentURL(path string) (string, error) {
	base := strings.TrimSpace(config.TopUpNodeURL)
	if base == "" || strings.TrimSpace(config.TopUpNodeMerchantID) == "" || strings.TrimSpace(config.TopUpNodeMerchantSecret) == "" {
		return "", NewTopupFlowError(TopupErrorPaymentConfigMissing, "Node 支付配置不完整", nil)
	}
	parsed, err := url.Parse(base)
	hostname := ""
	if parsed != nil {
		hostname = strings.ToLower(parsed.Hostname())
	}
	loopbackHost := hostname == "localhost" || hostname == "localhost.localdomain"
	if ip := net.ParseIP(hostname); ip != nil && ip.IsLoopback() {
		loopbackHost = true
	}
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(strings.ToLower(parsed.Scheme) != "https" && !(strings.ToLower(parsed.Scheme) == "http" && loopbackHost)) {
		return "", NewTopupFlowError(TopupErrorPaymentConfigInvalid, "Node 支付地址配置无效", err)
	}
	return strings.TrimRight(base, "/") + path, nil
}

func nodePaymentClientType(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), topupOrderClientTypeMobile) {
		return "h5"
	}
	return "native"
}

func nodePaymentAmountMinor(amount float64) (string, error) {
	minor := math.Round(amount * 100)
	if minor <= 0 || minor > math.MaxInt64 {
		return "", NewTopupFlowError(TopupErrorPaymentRequestBuildFailed, "支付金额无效", nil)
	}
	return fmt.Sprintf("%.0f", minor), nil
}

func doNodePaymentRequest(path string, body map[string]any, result any, errorPrefix string) error {
	requestURL, err := nodePaymentURL(path)
	if err != nil {
		return err
	}
	timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())
	nonce := random.GetUUID()
	requestInput := nodePaymentRequest{MerchantID: strings.TrimSpace(config.TopUpNodeMerchantID), Timestamp: timestamp, Nonce: nonce, Body: body}
	signature, err := nodePaymentSignature(requestInput, config.TopUpNodeMerchantSecret)
	if err != nil {
		return NewTopupFlowError(TopupErrorPaymentRequestBuildFailed, "构造 Node 支付签名失败", err)
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return NewTopupFlowError(TopupErrorPaymentRequestBuildFailed, "构造 Node 支付请求失败", err)
	}
	request, err := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return NewTopupFlowError(TopupErrorPaymentRequestBuildFailed, "构造 Node 支付请求失败", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Payment-Merchant", requestInput.MerchantID)
	request.Header.Set("X-Payment-Timestamp", timestamp)
	request.Header.Set("X-Payment-Nonce", nonce)
	request.Header.Set("X-Payment-Signature", signature)
	client := &http.Client{
		Timeout: time.Duration(config.TopUpAPITimeoutSecondsValue()) * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return NewTopupFlowError(nodePaymentRequestErrorCode(errorPrefix), "调用 Node 支付接口失败", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, nodePaymentMaxResponse+1))
	if err != nil {
		return NewTopupFlowError(TopupErrorPaymentResponseInvalid, "读取 Node 支付响应失败", err)
	}
	if len(responseBody) > nodePaymentMaxResponse {
		return NewTopupFlowError(TopupErrorPaymentResponseInvalid, "Node 支付响应过大", nil)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return NewTopupFlowError(nodePaymentHTTPErrorCode(errorPrefix), fmt.Sprintf("Node 支付接口返回 HTTP %d", response.StatusCode), nil)
	}
	envelope := nodePaymentEnvelope{}
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return NewTopupFlowError(TopupErrorPaymentResponseInvalid, "解析 Node 支付响应失败", err)
	}
	if envelope.Code != 0 {
		return NewTopupFlowError(nodePaymentUpstreamErrorCode(errorPrefix), "Node 支付接口返回业务错误", nil)
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return NewTopupFlowError(TopupErrorPaymentResponseInvalid, "Node 支付响应缺少 data", nil)
	}
	if err := json.Unmarshal(envelope.Data, result); err != nil {
		return NewTopupFlowError(TopupErrorPaymentResponseInvalid, "解析 Node 支付 data 失败", err)
	}
	return nil
}

func nodePaymentRequestErrorCode(errorPrefix string) string {
	if errorPrefix == "query" {
		return TopupErrorPaymentQueryFailed
	}
	if errorPrefix == "cancel" {
		return TopupErrorPaymentCancelFailed
	}
	return TopupErrorPaymentCreateFailed
}

func nodePaymentHTTPErrorCode(errorPrefix string) string {
	if errorPrefix == "query" {
		return TopupErrorPaymentQueryHTTPFailed
	}
	if errorPrefix == "cancel" {
		return TopupErrorPaymentCancelHTTPFailed
	}
	return TopupErrorPaymentCreateHTTPFailed
}

func nodePaymentUpstreamErrorCode(errorPrefix string) string {
	if errorPrefix == "query" {
		return TopupErrorPaymentQueryUpstreamFailed
	}
	if errorPrefix == "cancel" {
		return TopupErrorPaymentCancelUpstreamFailed
	}
	return TopupErrorPaymentCreateUpstreamFailed
}

func buildNodePaymentCreateBody(order TopupOrder, clientType string) (map[string]any, error) {
	amountMinor, err := nodePaymentAmountMinor(order.Amount)
	if err != nil {
		return nil, err
	}
	description := strings.TrimSpace(order.Title)
	if description == "" {
		description = "账户充值"
	}
	body := map[string]any{
		"externalOrderId": strings.TrimSpace(order.Id),
		"amountMinor":     amountMinor,
		"currency":        strings.TrimSpace(order.Currency),
		"description":     description,
		"clientType":      nodePaymentClientType(clientType),
		"idempotencyKey":  strings.TrimSpace(order.TransactionID),
	}
	if nodePaymentClientType(clientType) == "h5" && strings.TrimSpace(order.ReturnURL) != "" {
		body["returnUrl"] = strings.TrimSpace(order.ReturnURL)
	}
	return body, nil
}

func createTopupOrderByNode(order TopupOrder, clientType string) (topupExternalPayCreateResult, error) {
	body, err := buildNodePaymentCreateBody(order, clientType)
	if err != nil {
		return topupExternalPayCreateResult{}, err
	}
	result := nodePaymentCreateResponse{}
	if err := doNodePaymentRequest(nodePaymentCreatePath, body, &result, "create"); err != nil {
		return topupExternalPayCreateResult{}, err
	}
	if strings.TrimSpace(result.TradeNo) == "" || strings.TrimSpace(result.PaymentURL) == "" {
		return topupExternalPayCreateResult{}, NewTopupFlowError(TopupErrorPaymentResponseInvalid, "Node 支付响应缺少 tradeNo 或 paymentUrl", nil)
	}
	return topupExternalPayCreateResult{
		RedirectURL:     strings.TrimSpace(result.PaymentURL),
		ProviderOrderID: strings.TrimSpace(result.TradeNo),
		ProviderName:    nodePaymentProviderName,
	}, nil
}

func queryTopupOrderByNode(order TopupOrder) (topupExternalPayQueryResult, error) {
	body := map[string]any{"tradeNo": strings.TrimSpace(order.ProviderOrderID)}
	result := nodePaymentQueryResponse{}
	if err := doNodePaymentRequest(nodePaymentQueryPath, body, &result, "query"); err != nil {
		return topupExternalPayQueryResult{}, err
	}
	status := mapNodePaymentStatus(result.Status)
	if status < 0 {
		return topupExternalPayQueryResult{}, NewTopupFlowError(TopupErrorPaymentResponseInvalid, "Node 返回未知支付状态", nil)
	}
	return topupExternalPayQueryResult{
		TradeNo:         strings.TrimSpace(result.TradeNo),
		Status:          status,
		ProviderName:    nodePaymentProviderName,
		ProviderOrderID: strings.TrimSpace(result.TradeNo),
	}, nil
}

func cancelTopupOrderByNode(order TopupOrder) error {
	body := map[string]any{"tradeNo": strings.TrimSpace(order.ProviderOrderID)}
	result := nodePaymentQueryResponse{}
	return doNodePaymentRequest(nodePaymentCancelPath, body, &result, "cancel")
}

func TopupOrderAmountMinor(order TopupOrder) (string, error) {
	return nodePaymentAmountMinor(order.Amount)
}

func mapNodePaymentStatus(value string) int {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "creating", "pending":
		return 1
	case "paid", "partially_refunded", "refunded":
		return 2
	case "canceled", "cancelled":
		return 3
	case "failed":
		return 4
	default:
		return -1
	}
}

func isNodeTopupOrder(order TopupOrder) bool {
	return strings.EqualFold(strings.TrimSpace(order.ProviderName), nodePaymentProviderName)
}

func IsNodeTopupOrder(order TopupOrder) bool { return isNodeTopupOrder(order) }
