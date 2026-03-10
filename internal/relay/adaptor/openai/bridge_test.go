package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newBridgeTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	return ctx, recorder
}

func TestRelayResponsesAsChatResponse(t *testing.T) {
	ctx, recorder := newBridgeTestContext()
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"X-Upstream": []string{"ok"},
		},
		Body: io.NopCloser(strings.NewReader(`{
			"id":"resp_123",
			"object":"response",
			"model":"gpt-4.1",
			"created_at":1710000000,
			"output_text":"hello world",
			"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}
		}`)),
	}

	usage, relayErr := relayResponsesAsChatResponse(ctx, resp, "gpt-4.1", 10)
	if relayErr != nil {
		t.Fatalf("relayResponsesAsChatResponse returned error: %+v", relayErr)
	}
	if usage == nil || usage.TotalTokens != 15 || usage.PromptTokens != 10 || usage.CompletionTokens != 5 {
		t.Fatalf("unexpected usage: %#v", usage)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, `"object":"chat.completion"`) || !strings.Contains(body, `"content":"hello world"`) {
		t.Fatalf("unexpected bridged chat payload: %s", body)
	}
	if recorder.Header().Get("X-Upstream") != "ok" {
		t.Fatalf("expected upstream header to be copied, got %q", recorder.Header().Get("X-Upstream"))
	}
}

func TestRelayChatAsResponsesResponse(t *testing.T) {
	ctx, recorder := newBridgeTestContext()
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body: io.NopCloser(strings.NewReader(`{
			"id":"chatcmpl_123",
			"object":"chat.completion",
			"model":"gpt-4.1",
			"created":1710000000,
			"choices":[{"index":0,"message":{"role":"assistant","content":"hello back"},"finish_reason":"stop"}],
			"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}
		}`)),
	}

	usage, relayErr := relayChatAsResponsesResponse(ctx, resp, "gpt-4.1", 11)
	if relayErr != nil {
		t.Fatalf("relayChatAsResponsesResponse returned error: %+v", relayErr)
	}
	if usage == nil || usage.TotalTokens != 18 || usage.PromptTokens != 11 || usage.CompletionTokens != 7 {
		t.Fatalf("unexpected usage: %#v", usage)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, `"object":"response"`) || !strings.Contains(body, `"output_text":"hello back"`) {
		t.Fatalf("unexpected bridged responses payload: %s", body)
	}
	if !strings.Contains(body, `"input_tokens":11`) || !strings.Contains(body, `"output_tokens":7`) {
		t.Fatalf("expected usage to be converted into responses shape: %s", body)
	}
}
