package model

import "testing"

func TestLegacyPricingRatioHelper(t *testing.T) {
	if got := legacyGetModelRatio("gpt-4o", 0); got != 2.5 {
		t.Fatalf("legacyGetModelRatio(gpt-4o) = %v, want 2.5", got)
	}

	if got := legacyGetCompletionRatio("gpt-4o", 0); got != 4 {
		t.Fatalf("legacyGetCompletionRatio(gpt-4o) = %v, want 4", got)
	}

	if got := legacyRatioToOriginalPrice(ModelProviderModelTypeText, ModelProviderPriceUnitPer1KTokens, 2.5); got != 0.005 {
		t.Fatalf("legacyRatioToOriginalPrice(text, per_1k_tokens, 2.5) = %v, want 0.005", got)
	}
}
