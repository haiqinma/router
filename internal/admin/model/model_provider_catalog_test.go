package model

import "testing"

func TestBuildDefaultModelProviderCatalogSeeds_ModelDetailsMeta(t *testing.T) {
	seeds := BuildDefaultModelProviderCatalogSeeds(1700000000)
	if len(seeds) == 0 {
		t.Fatalf("expected non-empty provider seeds")
	}

	hasAudio := false
	hasImage := false
	hasText := false
	totalModels := 0

	for _, seed := range seeds {
		for _, detail := range seed.ModelDetails {
			totalModels++
			switch detail.Type {
			case ModelProviderModelTypeAudio:
				hasAudio = true
			case ModelProviderModelTypeImage:
				hasImage = true
			case ModelProviderModelTypeText:
				hasText = true
			default:
				t.Fatalf("unexpected model type %q for model %q", detail.Type, detail.Model)
			}
			if detail.PriceUnit == "" {
				t.Fatalf("price_unit should not be empty for model %q", detail.Model)
			}
			if detail.Currency == "" {
				t.Fatalf("currency should not be empty for model %q", detail.Model)
			}
			if detail.InputPrice < 0 {
				t.Fatalf("input_price should not be negative for model %q", detail.Model)
			}
			if detail.OutputPrice < 0 {
				t.Fatalf("output_price should not be negative for model %q", detail.Model)
			}
		}
	}

	if totalModels == 0 {
		t.Fatalf("expected non-empty model details in provider seeds")
	}
	if !hasText {
		t.Fatalf("expected at least one text model")
	}
	if !hasImage {
		t.Fatalf("expected at least one image model")
	}
	if !hasAudio {
		t.Fatalf("expected at least one audio model")
	}
}

func TestBuildDefaultModelProviderCatalogSeeds_AssignsSortOrder(t *testing.T) {
	seeds := BuildDefaultModelProviderCatalogSeeds(1700000000)
	if len(seeds) == 0 {
		t.Fatalf("expected non-empty provider seeds")
	}
	prev := 0
	for _, seed := range seeds {
		if seed.SortOrder <= 0 {
			t.Fatalf("sort_order should be positive for provider %q", seed.Provider)
		}
		if seed.SortOrder <= prev {
			t.Fatalf("sort_order should be strictly ascending, prev=%d current=%d provider=%q", prev, seed.SortOrder, seed.Provider)
		}
		prev = seed.SortOrder
	}
}
