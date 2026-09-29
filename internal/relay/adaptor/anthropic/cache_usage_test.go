package anthropic

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

// Anthropic 的用量是叠加语义:input_tokens 不含缓存,cache_read/creation 是额外输入。
// PromptTokens 必须等于三者之和,否则下游 carve-out 无法还原 regularInput=input_tokens。
func TestClaudeUsageToOpenAIUsageIsAdditive(t *testing.T) {
	usage := ClaudeUsageToOpenAIUsage(Usage{
		InputTokens:              100,
		OutputTokens:             20,
		CacheReadInputTokens:     300,
		CacheCreationInputTokens: 50,
	})
	if usage.PromptTokens != 450 {
		t.Fatalf("PromptTokens = %d, want 450 (input+read+write)", usage.PromptTokens)
	}
	if usage.CompletionTokens != 20 {
		t.Fatalf("CompletionTokens = %d, want 20", usage.CompletionTokens)
	}
	if usage.TotalTokens != 470 {
		t.Fatalf("TotalTokens = %d, want 470", usage.TotalTokens)
	}
	if usage.PromptTokensDetails == nil {
		t.Fatalf("PromptTokensDetails is nil, want cache fields populated")
	}
	if usage.PromptTokensDetails.CacheReadTokens != 300 {
		t.Fatalf("CacheReadTokens = %d, want 300", usage.PromptTokensDetails.CacheReadTokens)
	}
	if usage.PromptTokensDetails.CacheCreationTokens != 50 {
		t.Fatalf("CacheCreationTokens = %d, want 50", usage.PromptTokensDetails.CacheCreationTokens)
	}
}

func TestClaudeUsageToOpenAIUsageNoCacheLeavesDetailsNil(t *testing.T) {
	usage := ClaudeUsageToOpenAIUsage(Usage{InputTokens: 100, OutputTokens: 20})
	if usage.PromptTokens != 100 || usage.CompletionTokens != 20 || usage.TotalTokens != 120 {
		t.Fatalf("unexpected usage without cache: %#v", usage)
	}
	if usage.PromptTokensDetails != nil {
		t.Fatalf("PromptTokensDetails should stay nil when no cache tokens, got %#v", usage.PromptTokensDetails)
	}
}

func TestRelayMessagesResponseCarriesCacheTokens(t *testing.T) {
	ctx, _ := newAnthropicPassthroughTestContext()
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body: io.NopCloser(strings.NewReader(`{
			"id":"msg_123",
			"type":"message",
			"role":"assistant",
			"content":[{"type":"text","text":"hi"}],
			"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":300,"cache_creation_input_tokens":50}
		}`)),
	}

	usage, relayErr := relayMessagesResponse(ctx, resp)
	if relayErr != nil {
		t.Fatalf("relayMessagesResponse returned error: %+v", relayErr)
	}
	if usage.PromptTokens != 450 || usage.CompletionTokens != 20 || usage.TotalTokens != 470 {
		t.Fatalf("unexpected additive usage: %#v", usage)
	}
	if usage.PromptTokensDetails == nil || usage.PromptTokensDetails.CacheReadTokens != 300 || usage.PromptTokensDetails.CacheCreationTokens != 50 {
		t.Fatalf("cache details not carried: %#v", usage.PromptTokensDetails)
	}
}

func TestRelayMessagesStreamResponseCarriesCacheTokens(t *testing.T) {
	ctx, _ := newAnthropicPassthroughTestContext()
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(
			"event: message_start\n" +
				"data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"usage\":{\"input_tokens\":100,\"output_tokens\":1,\"cache_read_input_tokens\":300,\"cache_creation_input_tokens\":50}}}\n\n" +
				"event: content_block_delta\n" +
				"data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n" +
				"event: message_delta\n" +
				"data: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":20}}\n\n",
		)),
	}

	usage, relayErr := relayMessagesStreamResponse(ctx, resp)
	if relayErr != nil {
		t.Fatalf("relayMessagesStreamResponse returned error: %+v", relayErr)
	}
	if usage.PromptTokens != 450 || usage.CompletionTokens != 20 || usage.TotalTokens != 470 {
		t.Fatalf("unexpected additive stream usage: %#v", usage)
	}
	if usage.PromptTokensDetails == nil || usage.PromptTokensDetails.CacheReadTokens != 300 || usage.PromptTokensDetails.CacheCreationTokens != 50 {
		t.Fatalf("cache details not carried in stream: %#v", usage.PromptTokensDetails)
	}
}
