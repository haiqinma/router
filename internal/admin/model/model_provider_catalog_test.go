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

func TestParseModelProviderModelsRaw_BackwardCompatible(t *testing.T) {
	detailRaw := `[{"model":"gpt-4o-mini","type":"text","input_price":0.00015,"output_price":0.0006,"price_unit":"per_1k_tokens","currency":"USD"}]`
	details := ParseModelProviderModelsRaw(detailRaw)
	if len(details) != 1 {
		t.Fatalf("expected 1 detail from object array, got %d", len(details))
	}
	if details[0].Model != "gpt-4o-mini" {
		t.Fatalf("unexpected model parsed from object array: %q", details[0].Model)
	}
	if details[0].Type != ModelProviderModelTypeText {
		t.Fatalf("unexpected type parsed from object array: %q", details[0].Type)
	}

	legacyRaw := `["gpt-4o-mini","whisper-1"]`
	legacyDetails := ParseModelProviderModelsRaw(legacyRaw)
	if len(legacyDetails) != 2 {
		t.Fatalf("expected 2 details from legacy array, got %d", len(legacyDetails))
	}

	names := ModelProviderModelNames(legacyDetails)
	if len(names) != 2 {
		t.Fatalf("expected 2 model names from legacy details, got %d", len(names))
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
