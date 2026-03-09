package model

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	commonutils "github.com/yeying-community/router/common/utils"
)

//go:embed default_provider_seeds.json
var defaultProviderSeedsJSON []byte

var defaultProviderSeedTemplates = mustLoadDefaultProviderSeedTemplates()

func mustLoadDefaultProviderSeedTemplates() []ProviderCatalogSeed {
	rows := make([]ProviderCatalogSeed, 0)
	if err := json.Unmarshal(defaultProviderSeedsJSON, &rows); err != nil {
		panic(fmt.Sprintf("invalid default provider seeds: %v", err))
	}

	normalized := make([]ProviderCatalogSeed, 0, len(rows))
	for _, row := range rows {
		provider := commonutils.NormalizeProvider(row.Provider)
		if provider == "" || provider == "unknown" {
			provider = strings.TrimSpace(strings.ToLower(row.Provider))
		}
		if provider == "" || provider == "unknown" {
			continue
		}
		name := strings.TrimSpace(row.Name)
		if name == "" {
			name = provider
		}
		normalized = append(normalized, ProviderCatalogSeed{
			Provider:     provider,
			Name:         name,
			BaseURL:      strings.TrimSpace(row.BaseURL),
			SortOrder:    row.SortOrder,
			ModelDetails: normalizeDefaultProviderSeedModelDetails(provider, row.ModelDetails, 0),
		})
	}

	sort.SliceStable(normalized, func(i, j int) bool {
		leftOrder := normalized[i].SortOrder
		rightOrder := normalized[j].SortOrder
		switch {
		case leftOrder > 0 && rightOrder > 0:
			if leftOrder != rightOrder {
				return leftOrder < rightOrder
			}
		case leftOrder > 0:
			return true
		case rightOrder > 0:
			return false
		}
		return normalized[i].Provider < normalized[j].Provider
	})

	nextOrder := 10
	for i := range normalized {
		if normalized[i].SortOrder <= 0 {
			normalized[i].SortOrder = nextOrder
		}
		nextOrder = normalized[i].SortOrder + 10
	}
	return normalized
}

func BuildDefaultProviderCatalogSeeds(now int64) []ProviderCatalogSeed {
	seeds := make([]ProviderCatalogSeed, 0, len(defaultProviderSeedTemplates))
	for _, template := range defaultProviderSeedTemplates {
		details := normalizeDefaultProviderSeedModelDetails(template.Provider, template.ModelDetails, now)
		seeds = append(seeds, ProviderCatalogSeed{
			Provider:     template.Provider,
			Name:         template.Name,
			BaseURL:      template.BaseURL,
			SortOrder:    template.SortOrder,
			ModelDetails: details,
		})
	}
	return seeds
}

func normalizeDefaultProviderSeedModelDetails(provider string, details []ProviderModelDetail, now int64) []ProviderModelDetail {
	normalizedProvider := commonutils.NormalizeProvider(provider)
	if normalizedProvider == "" || normalizedProvider == "unknown" {
		normalizedProvider = strings.TrimSpace(strings.ToLower(provider))
	}
	cloned := make([]ProviderModelDetail, 0, len(details))
	for _, detail := range details {
		next := detail
		next.Model = canonicalizeModelNameForProvider(normalizedProvider, next.Model)
		if strings.TrimSpace(next.Model) == "" {
			continue
		}
		if next.UpdatedAt <= 0 {
			next.UpdatedAt = now
		}
		cloned = append(cloned, next)
	}
	return NormalizeProviderModelDetails(cloned)
}

func buildDefaultProviderModelDetailIndex(now int64) map[string]map[string]ProviderModelDetail {
	seeds := BuildDefaultProviderCatalogSeeds(now)
	index := make(map[string]map[string]ProviderModelDetail, len(seeds))
	for _, seed := range seeds {
		provider := commonutils.NormalizeProvider(seed.Provider)
		if provider == "" || provider == "unknown" {
			provider = strings.TrimSpace(strings.ToLower(seed.Provider))
		}
		if provider == "" || provider == "unknown" {
			continue
		}
		if index[provider] == nil {
			index[provider] = make(map[string]ProviderModelDetail, len(seed.ModelDetails))
		}
		for _, detail := range seed.ModelDetails {
			if strings.TrimSpace(detail.Model) == "" {
				continue
			}
			index[provider][detail.Model] = detail
		}
	}
	return index
}
