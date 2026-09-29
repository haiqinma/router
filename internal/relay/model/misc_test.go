package model

import "testing"

// DeepSeek 是包含语义:prompt_tokens = hit + miss,命中量在顶层 prompt_cache_hit_tokens。
// NormalizeCacheDetails 只补 CachedTokens、不改 PromptTokens,让 carve-out 把命中按缓存价扣减。
func TestNormalizeCacheDetailsDeepSeekInclusive(t *testing.T) {
	usage := &Usage{
		PromptTokens:          1000,
		CompletionTokens:      200,
		TotalTokens:           1200,
		PromptCacheHitTokens:  800,
		PromptCacheMissTokens: 200,
	}
	usage.NormalizeCacheDetails()

	if usage.PromptTokens != 1000 {
		t.Fatalf("PromptTokens must stay inclusive at 1000, got %d", usage.PromptTokens)
	}
	if usage.PromptTokensDetails == nil || usage.PromptTokensDetails.CachedTokens != 800 {
		t.Fatalf("expected CachedTokens=800, got %#v", usage.PromptTokensDetails)
	}
}

func TestNormalizeCacheDetailsNoHitIsNoop(t *testing.T) {
	usage := &Usage{PromptTokens: 500, CompletionTokens: 100, TotalTokens: 600}
	usage.NormalizeCacheDetails()
	if usage.PromptTokensDetails != nil {
		t.Fatalf("expected no cache details when hit tokens absent, got %#v", usage.PromptTokensDetails)
	}
}

// 已带 prompt_tokens_details 的响应(如 OpenAI 的 cached_tokens)不应被覆盖。
func TestNormalizeCacheDetailsPreservesExistingDetails(t *testing.T) {
	usage := &Usage{
		PromptTokens:         1000,
		PromptCacheHitTokens: 800,
		PromptTokensDetails:  &PromptTokensDetails{CachedTokens: 512},
	}
	usage.NormalizeCacheDetails()
	if usage.PromptTokensDetails.CachedTokens != 512 {
		t.Fatalf("existing CachedTokens must be preserved, got %d", usage.PromptTokensDetails.CachedTokens)
	}
}

func TestNormalizeCacheDetailsNilReceiver(t *testing.T) {
	var usage *Usage
	usage.NormalizeCacheDetails() // must not panic
}
