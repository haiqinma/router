package model

import "testing"

func setModelPricingIndexForTest(index providerModelPricingIndex) func() {
	modelPricingIndexLock.Lock()
	previous := modelPricingIndex
	modelPricingIndex = index
	modelPricingIndexLock.Unlock()
	return func() {
		modelPricingIndexLock.Lock()
		modelPricingIndex = previous
		modelPricingIndexLock.Unlock()
	}
}

func TestResolveChannelModelPricingUsesProviderDefaultAndChannelOverride(t *testing.T) {
	restore := setModelPricingIndexForTest(providerModelPricingIndex{
		byProviderAndModel: map[string]providerModelPricingEntry{
			"openai:gpt-4o": {
				Provider: "openai",
				Detail: ProviderModelDetail{
					Model:       "gpt-4o",
					Type:        ProviderModelTypeText,
					InputPrice:  0.005,
					OutputPrice: 0.015,
					PriceUnit:   ProviderPriceUnitPer1KTokens,
					Currency:    ProviderPriceCurrencyUSD,
				},
			},
		},
		byModel: map[string][]providerModelPricingEntry{
			"gpt-4o": {
				{
					Provider: "openai",
					Detail: ProviderModelDetail{
						Model:       "gpt-4o",
						Type:        ProviderModelTypeText,
						InputPrice:  0.005,
						OutputPrice: 0.015,
						PriceUnit:   ProviderPriceUnitPer1KTokens,
						Currency:    ProviderPriceCurrencyUSD,
					},
				},
			},
		},
	})
	defer restore()

	overrideInputPrice := 0.006
	pricing, err := ResolveChannelModelPricing(0, []ChannelModel{
		{
			Model:         "gpt-4o",
			UpstreamModel: "gpt-4o",
			Selected:      true,
			InputPrice:    &overrideInputPrice,
			PriceUnit:     ProviderPriceUnitPer1KTokens,
			Currency:      ProviderPriceCurrencyUSD,
		},
	}, "gpt-4o")
	if err != nil {
		t.Fatalf("ResolveChannelModelPricing returned error: %v", err)
	}
	if pricing.Source != "channel_override" {
		t.Fatalf("expected channel_override source, got %q", pricing.Source)
	}
	if !pricing.HasChannelOverride {
		t.Fatalf("expected HasChannelOverride to be true")
	}
	if pricing.InputPrice != overrideInputPrice {
		t.Fatalf("expected input override %.6f, got %.6f", overrideInputPrice, pricing.InputPrice)
	}
	if pricing.OutputPrice != 0.015 {
		t.Fatalf("expected provider output price 0.015000, got %.6f", pricing.OutputPrice)
	}
}

func TestResolveChannelModelPricingRequiresPositivePrice(t *testing.T) {
	restore := setModelPricingIndexForTest(providerModelPricingIndex{
		byProviderAndModel: map[string]providerModelPricingEntry{},
		byModel:            map[string][]providerModelPricingEntry{},
	})
	defer restore()

	zero := 0.0
	_, err := ResolveChannelModelPricing(0, []ChannelModel{
		{
			Model:         "missing-model",
			UpstreamModel: "missing-model",
			Selected:      true,
			InputPrice:    &zero,
			OutputPrice:   &zero,
			PriceUnit:     ProviderPriceUnitPer1KTokens,
			Currency:      ProviderPriceCurrencyUSD,
		},
	}, "missing-model")
	if err == nil {
		t.Fatalf("expected error when neither provider default nor positive channel override exists")
	}
}
