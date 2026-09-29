package gemini

import "testing"

// Gemini 的 cachedContentTokenCount 是包含语义(promptTokenCount 的一部分),
// 映射时 PromptTokens 不变,只补 PromptTokensDetails.CachedTokens。
func TestUsageMetadataToOpenAIUsageWithCache(t *testing.T) {
	usage := (&UsageMetadata{
		PromptTokenCount:        1000,
		CandidatesTokenCount:    200,
		TotalTokenCount:         1200,
		CachedContentTokenCount: 700,
	}).toOpenAIUsage()

	if usage == nil {
		t.Fatalf("expected usage, got nil")
	}
	if usage.PromptTokens != 1000 || usage.CompletionTokens != 200 || usage.TotalTokens != 1200 {
		t.Fatalf("unexpected token counts: %#v", usage)
	}
	if usage.PromptTokensDetails == nil || usage.PromptTokensDetails.CachedTokens != 700 {
		t.Fatalf("expected CachedTokens=700, got %#v", usage.PromptTokensDetails)
	}
}

func TestUsageMetadataToOpenAIUsageNoCache(t *testing.T) {
	usage := (&UsageMetadata{PromptTokenCount: 500, CandidatesTokenCount: 100, TotalTokenCount: 600}).toOpenAIUsage()
	if usage == nil || usage.PromptTokens != 500 || usage.CompletionTokens != 100 {
		t.Fatalf("unexpected usage: %#v", usage)
	}
	if usage.PromptTokensDetails != nil {
		t.Fatalf("expected nil cache details, got %#v", usage.PromptTokensDetails)
	}
}

// TotalTokenCount 缺失时用 prompt+candidates 兜底。
func TestUsageMetadataToOpenAIUsageTotalFallback(t *testing.T) {
	usage := (&UsageMetadata{PromptTokenCount: 500, CandidatesTokenCount: 100}).toOpenAIUsage()
	if usage == nil || usage.TotalTokens != 600 {
		t.Fatalf("expected total fallback 600, got %#v", usage)
	}
}

// 上游未返回用量(空 metadata / nil)时返回 nil,交由调用方退回本地估算。
func TestUsageMetadataToOpenAIUsageNilAndEmpty(t *testing.T) {
	var nilMeta *UsageMetadata
	if nilMeta.toOpenAIUsage() != nil {
		t.Fatalf("nil metadata should map to nil usage")
	}
	if (&UsageMetadata{}).toOpenAIUsage() != nil {
		t.Fatalf("empty metadata should map to nil usage")
	}
}
