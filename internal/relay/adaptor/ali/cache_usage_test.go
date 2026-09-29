package ali

import "testing"

// DashScope 缓存命中是包含语义:cached 量已计入 input_tokens,PromptTokens 不变,
// 只补 PromptTokensDetails,让 carve-out 把命中按缓存价扣减。
func TestAliCachePromptDetailsNestedNewFormat(t *testing.T) {
	details := aliCachePromptDetails(Usage{
		InputTokens:  1000,
		OutputTokens: 200,
		PromptTokensDetails: &UsagePromptTokenDetail{
			CachedTokens:             800,
			CacheCreationInputTokens: 50,
		},
	})
	if details == nil {
		t.Fatalf("expected cache details, got nil")
	}
	if details.CachedTokens != 800 {
		t.Fatalf("CachedTokens = %d, want 800", details.CachedTokens)
	}
	if details.CacheCreationTokens != 50 {
		t.Fatalf("CacheCreationTokens = %d, want 50", details.CacheCreationTokens)
	}
}

// 旧版模型把命中量放在顶层 cached_tokens。
func TestAliCachePromptDetailsLegacyFlatFormat(t *testing.T) {
	details := aliCachePromptDetails(Usage{InputTokens: 1000, OutputTokens: 200, CachedTokens: 640})
	if details == nil || details.CachedTokens != 640 {
		t.Fatalf("expected legacy CachedTokens=640, got %#v", details)
	}
}

func TestAliCachePromptDetailsNoneReturnsNil(t *testing.T) {
	if details := aliCachePromptDetails(Usage{InputTokens: 1000, OutputTokens: 200}); details != nil {
		t.Fatalf("expected nil when no cache, got %#v", details)
	}
}

// 新版嵌套字段优先于旧版顶层字段。
func TestAliCacheReadPrefersNested(t *testing.T) {
	u := Usage{CachedTokens: 100, PromptTokensDetails: &UsagePromptTokenDetail{CachedTokens: 800}}
	if got := u.CacheReadTokens(); got != 800 {
		t.Fatalf("CacheReadTokens = %d, want 800 (nested wins)", got)
	}
}
