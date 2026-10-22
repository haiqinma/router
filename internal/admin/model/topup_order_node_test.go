package model

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yeying-community/router/common/config"
)

func setNodePaymentTestConfig(t *testing.T, baseURL string) {
	t.Helper()
	previousURL := config.TopUpNodeURL
	previousMerchantID := config.TopUpNodeMerchantID
	previousSecret := config.TopUpNodeMerchantSecret
	config.TopUpNodeURL = baseURL
	config.TopUpNodeMerchantID = "pm_test"
	config.TopUpNodeMerchantSecret = "test-merchant-secret"
	t.Cleanup(func() {
		config.TopUpNodeURL = previousURL
		config.TopUpNodeMerchantID = previousMerchantID
		config.TopUpNodeMerchantSecret = previousSecret
	})
}

func TestCanonicalNodePaymentJSONMatchesNodeStringify(t *testing.T) {
	got, err := canonicalNodePaymentJSON(map[string]any{
		"z": []any{true, "<&>\u2028"},
		"a": map[string]any{"b": "value", "a": 2},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := "{\"a\":{\"a\":2,\"b\":\"value\"},\"z\":[true,\"<&>\u2028\"]}"
	if got != want {
		t.Fatalf("canonical JSON = %q, want %q", got, want)
	}
}

func TestVerifyNodePaymentSignatureRejectsChangedPayload(t *testing.T) {
	body := map[string]any{"eventId": "payment.succeeded:PAY123", "amountMinor": "100"}
	request := nodePaymentRequest{MerchantID: "pm_test", Timestamp: "1792581689508", Nonce: "payment.succeeded:PAY123", Body: body}
	signature, err := nodePaymentSignature(request, "merchant-secret")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyNodePaymentSignature(request.MerchantID, request.Timestamp, request.Nonce, body, signature, "merchant-secret") {
		t.Fatal("expected valid signature")
	}
	body["amountMinor"] = "101"
	if VerifyNodePaymentSignature(request.MerchantID, request.Timestamp, request.Nonce, body, signature, "merchant-secret") {
		t.Fatal("expected changed payload to fail signature verification")
	}
}

func TestNodePaymentCreateQueryAndCancelRequests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("X-Payment-Merchant") != "pm_test" {
			t.Errorf("merchant header = %q", r.Header.Get("X-Payment-Merchant"))
		}
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		timestamp := r.Header.Get("X-Payment-Timestamp")
		nonce := r.Header.Get("X-Payment-Nonce")
		if !VerifyNodePaymentSignature("pm_test", timestamp, nonce, body, r.Header.Get("X-Payment-Signature"), "test-merchant-secret") {
			t.Error("request signature did not verify")
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case nodePaymentCreatePath:
			if body["externalOrderId"] != "order-1" || body["amountMinor"] != "1250" || body["clientType"] != "h5" || body["returnUrl"] != "https://router.example/return" {
				t.Errorf("unexpected create body: %#v", body)
			}
			_, _ = w.Write([]byte(`{"code":0,"data":{"tradeNo":"PAY1","paymentUrl":"https://node.example/pay"}}`))
		case nodePaymentQueryPath:
			if body["tradeNo"] != "PAY1" {
				t.Errorf("query body = %#v", body)
			}
			_, _ = w.Write([]byte(`{"code":0,"data":{"tradeNo":"PAY1","status":"paid"}}`))
		case nodePaymentCancelPath:
			if body["tradeNo"] != "PAY1" {
				t.Errorf("cancel body = %#v", body)
			}
			_, _ = w.Write([]byte(`{"code":0,"data":{"tradeNo":"PAY1","status":"canceled"}}`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	setNodePaymentTestConfig(t, server.URL)

	order := TopupOrder{Id: "order-1", Amount: 12.5, Currency: "CNY", Title: "Top up", TransactionID: "txn-1", ReturnURL: "https://router.example/return", ProviderOrderID: "PAY1"}
	created, err := createTopupOrderByNode(order, topupOrderClientTypeMobile)
	if err != nil {
		t.Fatal(err)
	}
	if created.ProviderName != nodePaymentProviderName || created.ProviderOrderID != "PAY1" || created.RedirectURL != "https://node.example/pay" {
		t.Fatalf("create result = %#v", created)
	}
	queried, err := queryTopupOrderByNode(order)
	if err != nil {
		t.Fatal(err)
	}
	if queried.Status != 2 || queried.ProviderName != nodePaymentProviderName {
		t.Fatalf("query result = %#v", queried)
	}
	if err := cancelTopupOrderByNode(order); err != nil {
		t.Fatal(err)
	}
}

func TestNodePaymentCreateOmitsReturnURLForNativeAndErrorIsSanitized(t *testing.T) {
	var nativeReturnURL any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		nativeReturnURL = body["returnUrl"]
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":422,"message":"secret must not escape","data":null}`))
	}))
	defer server.Close()
	setNodePaymentTestConfig(t, server.URL)
	order := TopupOrder{Id: "order-2", Amount: 1, Currency: "CNY", TransactionID: "txn-2", ReturnURL: "https://router.example/return"}
	_, err := createTopupOrderByNode(order, "pc")
	if nativeReturnURL != nil {
		t.Fatalf("native returnUrl = %#v, want omitted", nativeReturnURL)
	}
	if TopupErrorCode(err) != TopupErrorPaymentCreateUpstreamFailed || strings.Contains(err.Error(), "secret") {
		t.Fatalf("error = %v (%s), must be classified and sanitized", err, TopupErrorCode(err))
	}
}

func TestNodePaymentHTTPErrorUsesOperationSpecificCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "failure", http.StatusBadGateway)
	}))
	defer server.Close()
	setNodePaymentTestConfig(t, server.URL)
	err := doNodePaymentRequest(nodePaymentQueryPath, map[string]any{"tradeNo": "PAY1"}, &nodePaymentQueryResponse{}, "query")
	if TopupErrorCode(err) != TopupErrorPaymentQueryHTTPFailed {
		t.Fatalf("error code = %q, want %q", TopupErrorCode(err), TopupErrorPaymentQueryHTTPFailed)
	}
}
