package model

import "testing"

func TestCanonicalizeModelNameForProvider(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		model    string
		want     string
	}{
		{
			name:     "strip openai self prefix",
			provider: "openai",
			model:    "openai/gpt-4o-mini",
			want:     "gpt-4o-mini",
		},
		{
			name:     "keep openrouter namespace model",
			provider: "openrouter",
			model:    "openai/gpt-4o-mini",
			want:     "openai/gpt-4o-mini",
		},
		{
			name:     "keep plain model",
			provider: "openai",
			model:    "gpt-4o-mini",
			want:     "gpt-4o-mini",
		},
		{
			name:     "strip black-forest-labs self prefix",
			provider: "black-forest-labs",
			model:    "black-forest-labs/flux-1.1-pro",
			want:     "flux-1.1-pro",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canonicalizeModelNameForProvider(tt.provider, tt.model)
			if got != tt.want {
				t.Fatalf("canonicalizeModelNameForProvider(%q,%q)=%q, want %q", tt.provider, tt.model, got, tt.want)
			}
		})
	}
}

func TestBuildProviderModelRows_CanonicalizeAndMergeDuplicates(t *testing.T) {
	rows := BuildProviderModelRows("openai", []ProviderModelDetail{
		{
			Model:       "gpt-3.5-turbo-0613",
			Type:        ProviderModelTypeText,
			InputPrice:  0,
			OutputPrice: 0.001,
			PriceUnit:   ProviderPriceUnitPer1KTokens,
			Currency:    ProviderPriceCurrencyUSD,
			Source:      "manual",
			UpdatedAt:   100,
		},
		{
			Model:       "openai/gpt-3.5-turbo-0613",
			Type:        ProviderModelTypeText,
			InputPrice:  0.002,
			OutputPrice: 0,
			PriceUnit:   ProviderPriceUnitPer1KTokens,
			Currency:    ProviderPriceCurrencyUSD,
			Source:      "default",
			UpdatedAt:   200,
		},
	}, 300)

	if len(rows) != 1 {
		t.Fatalf("expected 1 canonicalized row, got %d", len(rows))
	}
	if rows[0].Model != "gpt-3.5-turbo-0613" {
		t.Fatalf("expected canonical model name, got %q", rows[0].Model)
	}
	if rows[0].InputPrice <= 0 {
		t.Fatalf("expected merged positive input price, got %f", rows[0].InputPrice)
	}
	if rows[0].OutputPrice <= 0 {
		t.Fatalf("expected existing output price to be preserved, got %f", rows[0].OutputPrice)
	}
}
