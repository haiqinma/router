package model

import (
	"encoding/json"
	"testing"
)

func decodeProviderCatalog(t *testing.T, raw string) []modelProviderCatalogMigrationItem {
	t.Helper()
	items := make([]modelProviderCatalogMigrationItem, 0)
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		t.Fatalf("unmarshal catalog failed: %v", err)
	}
	return items
}

func hasProvider(items []modelProviderCatalogMigrationItem, provider string) bool {
	for _, item := range items {
		if item.Provider == provider {
			return true
		}
	}
	return false
}

func TestNormalizeModelProviderCatalogRawWithoutMainstreamDefaults(t *testing.T) {
	raw := `[{"provider":"openai","name":"OpenAI","models":["gpt-4.1"],"source":"manual"}]`

	normalizedRaw, err := normalizeModelProviderCatalogRaw(raw, false)
	if err != nil {
		t.Fatalf("normalizeModelProviderCatalogRaw returned error: %v", err)
	}
	items := decodeProviderCatalog(t, normalizedRaw)
	if len(items) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(items))
	}
	if items[0].Provider != "openai" {
		t.Fatalf("expected provider openai, got %s", items[0].Provider)
	}
	if hasProvider(items, "qwen") {
		t.Fatalf("unexpected default provider qwen when mergeWithMainstreamDefaults=false")
	}
}

func TestNormalizeModelProviderCatalogRawWithMainstreamDefaults(t *testing.T) {
	raw := `[{"provider":"openai","name":"OpenAI","models":["gpt-4.1"],"source":"manual"}]`

	normalizedRaw, err := normalizeModelProviderCatalogRaw(raw, true)
	if err != nil {
		t.Fatalf("normalizeModelProviderCatalogRaw returned error: %v", err)
	}
	items := decodeProviderCatalog(t, normalizedRaw)
	if len(items) < len(mainstreamProviderSeeds) {
		t.Fatalf("expected at least %d providers, got %d", len(mainstreamProviderSeeds), len(items))
	}
	for _, seed := range mainstreamProviderSeeds {
		if !hasProvider(items, seed.Provider) {
			t.Fatalf("expected provider %s in merged catalog", seed.Provider)
		}
	}
}

func TestNormalizeModelProviderCatalogRawEmptyWithoutMainstreamDefaults(t *testing.T) {
	normalizedRaw, err := normalizeModelProviderCatalogRaw("", false)
	if err != nil {
		t.Fatalf("normalizeModelProviderCatalogRaw returned error: %v", err)
	}
	items := decodeProviderCatalog(t, normalizedRaw)
	if len(items) != 0 {
		t.Fatalf("expected empty catalog, got %d providers", len(items))
	}
}
