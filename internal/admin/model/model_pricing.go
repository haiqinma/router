package model

import (
	"fmt"
	"sort"
	"strings"
	"sync"

	commonutils "github.com/yeying-community/router/common/utils"
	"gorm.io/gorm"
)

type ResolvedModelPricing struct {
	Model              string  `json:"model"`
	Provider           string  `json:"provider,omitempty"`
	Type               string  `json:"type"`
	InputPrice         float64 `json:"input_price"`
	OutputPrice        float64 `json:"output_price"`
	PriceUnit          string  `json:"price_unit"`
	Currency           string  `json:"currency"`
	Source             string  `json:"source"`
	HasChannelOverride bool    `json:"has_channel_override"`
}

func (pricing ResolvedModelPricing) IsConfigured() bool {
	return pricing.InputPrice > 0 || pricing.OutputPrice > 0
}

type providerModelPricingEntry struct {
	Provider string
	Detail   ProviderModelDetail
}

type providerModelPricingIndex struct {
	byProviderAndModel map[string]providerModelPricingEntry
	byModel            map[string][]providerModelPricingEntry
}

var (
	modelPricingIndexLock sync.RWMutex
	modelPricingIndex     = providerModelPricingIndex{
		byProviderAndModel: make(map[string]providerModelPricingEntry),
		byModel:            make(map[string][]providerModelPricingEntry),
	}
)

func SyncModelPricingCatalogWithDB(db *gorm.DB) error {
	if db == nil {
		return nil
	}

	rows := make([]ProviderModel, 0)
	if err := db.Order("provider asc, model asc").Find(&rows).Error; err != nil {
		return err
	}

	next := providerModelPricingIndex{
		byProviderAndModel: make(map[string]providerModelPricingEntry, len(rows)),
		byModel:            make(map[string][]providerModelPricingEntry),
	}
	for _, row := range rows {
		provider := commonutils.NormalizeProvider(row.Provider)
		if provider == "" {
			provider = strings.TrimSpace(strings.ToLower(row.Provider))
		}
		if provider == "" {
			continue
		}
		modelName := canonicalizeModelNameForProvider(provider, row.Model)
		modelName = normalizePricingLookupModelName(modelName)
		if modelName == "" {
			continue
		}

		detail := ProviderModelDetail{
			Model:       modelName,
			Type:        normalizeModelType(row.Type, modelName),
			InputPrice:  row.InputPrice,
			OutputPrice: row.OutputPrice,
			PriceUnit:   strings.TrimSpace(strings.ToLower(row.PriceUnit)),
			Currency:    strings.TrimSpace(strings.ToUpper(row.Currency)),
			Source:      strings.TrimSpace(strings.ToLower(row.Source)),
			UpdatedAt:   row.UpdatedAt,
		}
		detail = NormalizeProviderModelDetails([]ProviderModelDetail{detail})[0]
		entry := providerModelPricingEntry{
			Provider: provider,
			Detail:   detail,
		}

		next.byProviderAndModel[buildProviderModelPricingKey(provider, modelName)] = entry
		next.byModel[modelName] = append(next.byModel[modelName], entry)
	}

	for modelName, entries := range next.byModel {
		sort.SliceStable(entries, func(i, j int) bool {
			return entries[i].Provider < entries[j].Provider
		})
		next.byModel[modelName] = entries
	}

	modelPricingIndexLock.Lock()
	modelPricingIndex = next
	modelPricingIndexLock.Unlock()
	return nil
}

func ResolveChannelModelPricing(channelProtocol int, channelModels []ChannelModel, modelName string) (ResolvedModelPricing, error) {
	normalizedModel := normalizePricingLookupModelName(modelName)
	if normalizedModel == "" {
		return ResolvedModelPricing{}, fmt.Errorf("model name is empty")
	}

	pricing, ok := lookupProviderDefaultModelPricing(normalizedModel, channelProtocol)
	if !ok {
		pricing = ResolvedModelPricing{}
	}

	if override, ok := findSelectedChannelModelPricingOverride(channelModels, normalizedModel); ok {
		hasOverride := false
		if override.InputPrice != nil && *override.InputPrice > 0 {
			pricing.InputPrice = *override.InputPrice
			hasOverride = true
		}
		if override.OutputPrice != nil && *override.OutputPrice > 0 {
			pricing.OutputPrice = *override.OutputPrice
			hasOverride = true
		}
		if hasOverride {
			if override.PriceUnit != "" {
				pricing.PriceUnit = override.PriceUnit
			}
			if override.Currency != "" {
				pricing.Currency = override.Currency
			}
			pricing.HasChannelOverride = true
			pricing.Source = "channel_override"
		}
	}

	if pricing.Type == "" {
		pricing.Type = normalizeModelType("", normalizedModel)
	}
	if pricing.PriceUnit == "" {
		pricing.PriceUnit = defaultPriceUnitByType(pricing.Type, normalizedModel)
	}
	if pricing.Currency == "" {
		pricing.Currency = ProviderPriceCurrencyUSD
	}
	pricing.Model = normalizedModel
	if !pricing.IsConfigured() {
		return pricing, fmt.Errorf("model pricing not configured for %s", normalizedModel)
	}
	return pricing, nil
}

func buildProviderModelPricingKey(provider string, modelName string) string {
	return provider + ":" + modelName
}

func normalizePricingLookupModelName(modelName string) string {
	name := strings.TrimSpace(modelName)
	if strings.HasPrefix(name, "qwen-") && strings.HasSuffix(name, "-internet") {
		name = strings.TrimSuffix(name, "-internet")
	}
	if strings.HasPrefix(name, "command-") && strings.HasSuffix(name, "-internet") {
		name = strings.TrimSuffix(name, "-internet")
	}
	return strings.TrimSpace(name)
}

func lookupProviderDefaultModelPricing(modelName string, channelProtocol int) (ResolvedModelPricing, bool) {
	modelPricingIndexLock.RLock()
	index := modelPricingIndex
	modelPricingIndexLock.RUnlock()
	if len(index.byProviderAndModel) == 0 && DB != nil {
		_ = SyncModelPricingCatalogWithDB(DB)
		modelPricingIndexLock.RLock()
		index = modelPricingIndex
		modelPricingIndexLock.RUnlock()
	}

	preferredProvider := inferProviderByModel(modelName, channelProtocol, channelProtocol > 0)
	if preferredProvider != "" {
		canonicalModel := canonicalizeModelNameForProvider(preferredProvider, modelName)
		if entry, ok := index.byProviderAndModel[buildProviderModelPricingKey(preferredProvider, canonicalModel)]; ok {
			return resolvedModelPricingFromProviderEntry(modelName, entry), true
		}
	}

	candidates := []string{modelName}
	if strings.Contains(modelName, "/") {
		parts := strings.SplitN(modelName, "/", 2)
		if len(parts) == 2 {
			candidates = append(candidates, normalizePricingLookupModelName(parts[1]))
		}
	}
	if preferredProvider != "" {
		candidates = append(candidates, canonicalizeModelNameForProvider(preferredProvider, modelName))
	}

	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = normalizePricingLookupModelName(candidate)
		if candidate == "" {
			continue
		}
		if _, exists := seen[candidate]; exists {
			continue
		}
		seen[candidate] = struct{}{}
		entries := index.byModel[candidate]
		if len(entries) == 0 {
			continue
		}
		entry, ok := pickProviderModelPricingEntry(entries, preferredProvider)
		if !ok {
			continue
		}
		return resolvedModelPricingFromProviderEntry(modelName, entry), true
	}
	return ResolvedModelPricing{}, false
}

func pickProviderModelPricingEntry(entries []providerModelPricingEntry, preferredProvider string) (providerModelPricingEntry, bool) {
	if len(entries) == 0 {
		return providerModelPricingEntry{}, false
	}
	for _, entry := range entries {
		if entry.Provider == preferredProvider {
			return entry, true
		}
	}
	for _, entry := range entries {
		if entry.Provider != "other" {
			return entry, true
		}
	}
	return entries[0], true
}

func resolvedModelPricingFromProviderEntry(modelName string, entry providerModelPricingEntry) ResolvedModelPricing {
	return ResolvedModelPricing{
		Model:       modelName,
		Provider:    entry.Provider,
		Type:        normalizeModelType(entry.Detail.Type, entry.Detail.Model),
		InputPrice:  entry.Detail.InputPrice,
		OutputPrice: entry.Detail.OutputPrice,
		PriceUnit:   entry.Detail.PriceUnit,
		Currency:    entry.Detail.Currency,
		Source:      "provider_default",
	}
}

func findSelectedChannelModelPricingOverride(rows []ChannelModel, modelName string) (ChannelModel, bool) {
	normalizedRows := NormalizeChannelModelConfigsPreserveOrder(rows)
	normalizedModelName := normalizePricingLookupModelName(modelName)
	for _, row := range normalizedRows {
		if !row.Selected {
			continue
		}
		if !channelModelMatchesPricing(row, normalizedModelName) {
			continue
		}
		return row, true
	}
	return ChannelModel{}, false
}

func channelModelMatchesPricing(row ChannelModel, modelName string) bool {
	upstream := normalizePricingLookupModelName(row.UpstreamModel)
	alias := normalizePricingLookupModelName(row.Model)
	return upstream == modelName || alias == modelName
}
