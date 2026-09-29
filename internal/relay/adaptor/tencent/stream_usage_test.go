package tencent

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTencentStreamTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	return ctx, recorder
}

// 混元流式末 chunk 带真实 Usage,应据此计费,而非本地估算。
func TestTencentStreamHandlerUsesProviderUsage(t *testing.T) {
	ctx, _ := newTencentStreamTestContext()
	body := "data: {\"Choices\":[{\"Delta\":{\"Content\":\"hello\"},\"FinishReason\":\"\"}]}\n" +
		"data: {\"Choices\":[{\"Delta\":{\"Content\":\" world\"},\"FinishReason\":\"stop\"}],\"Usage\":{\"PromptTokens\":123,\"CompletionTokens\":45,\"TotalTokens\":168}}\n"
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body:       io.NopCloser(strings.NewReader(body)),
	}

	relayErr, usage, responseText := StreamHandler(ctx, resp)
	if relayErr != nil {
		t.Fatalf("StreamHandler returned error: %+v", relayErr)
	}
	if usage == nil {
		t.Fatalf("expected provider usage, got nil")
	}
	if usage.PromptTokens != 123 || usage.CompletionTokens != 45 || usage.TotalTokens != 168 {
		t.Fatalf("unexpected provider usage: %#v", usage)
	}
	if responseText != "hello world" {
		t.Fatalf("unexpected responseText: %q", responseText)
	}
}

// 上游未给 Usage 时返回 nil,交由调用方回退本地估算。
func TestTencentStreamHandlerNoUsageReturnsNil(t *testing.T) {
	ctx, _ := newTencentStreamTestContext()
	body := "data: {\"Choices\":[{\"Delta\":{\"Content\":\"hi\"},\"FinishReason\":\"stop\"}]}\n"
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body:       io.NopCloser(strings.NewReader(body)),
	}

	relayErr, usage, _ := StreamHandler(ctx, resp)
	if relayErr != nil {
		t.Fatalf("StreamHandler returned error: %+v", relayErr)
	}
	if usage != nil {
		t.Fatalf("expected nil usage when upstream omits it, got %#v", usage)
	}
}
