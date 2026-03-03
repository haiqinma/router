package model

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	commonutils "github.com/yeying-community/router/common/utils"
	"gorm.io/gorm"
)

const optionKeyModelProviderCatalog = "ModelProviderCatalog"

type modelProviderCatalogMigrationItem struct {
	Provider  string   `json:"provider"`
	Name      string   `json:"name,omitempty"`
	Models    []string `json:"models"`
	Source    string   `json:"source,omitempty"`
	UpdatedAt int64    `json:"updated_at,omitempty"`
}

func runModelProviderMigrations() error {
	if err := normalizeChannelModelProviders(); err != nil {
		return err
	}
	if err := backfillChannelModelProviderFromModels(); err != nil {
		return err
	}
	if err := ensureModelProviderCatalogOption(); err != nil {
		return err
	}
	return nil
}

func normalizeChannelModelProviders() error {
	channels := make([]Channel, 0)
	if err := DB.Select("id", "model_provider").
		Where("COALESCE(model_provider, '') <> ''").
		Find(&channels).Error; err != nil {
		return err
	}
	updated := 0
	for _, channel := range channels {
		normalized := commonutils.NormalizeModelProvider(channel.ModelProvider)
		if normalized == "" || normalized == channel.ModelProvider {
			continue
		}
		if err := DB.Model(&Channel{}).
			Where("id = ?", channel.Id).
			Update("model_provider", normalized).Error; err != nil {
			return err
		}
		updated++
	}
	if updated > 0 {
		logger.SysLogf("migration: normalized model_provider for %d channels", updated)
	}
	return nil
}

func backfillChannelModelProviderFromModels() error {
	channels := make([]Channel, 0)
	if err := DB.Select("id", "models", "model_provider").
		Where("COALESCE(model_provider, '') = ''").
		Find(&channels).Error; err != nil {
		return err
	}
	updated := 0
	for _, channel := range channels {
		provider := inferModelProviderFromModelList(channel.Models)
		if provider == "" {
			continue
		}
		if err := DB.Model(&Channel{}).
			Where("id = ? AND COALESCE(model_provider, '') = ''", channel.Id).
			Update("model_provider", provider).Error; err != nil {
			return err
		}
		updated++
	}
	if updated > 0 {
		logger.SysLogf("migration: backfilled model_provider for %d channels", updated)
	}
	return nil
}

func inferModelProviderFromModelList(modelList string) string {
	models := strings.Split(modelList, ",")
	counts := make(map[string]int)
	for _, modelName := range models {
		provider := commonutils.NormalizeModelProvider(commonutils.ResolveModelProvider(modelName))
		if provider == "" || provider == "unknown" {
			continue
		}
		counts[provider]++
	}
	if len(counts) == 0 {
		return ""
	}
	// Deterministic selection: highest frequency, then lexical order.
	type item struct {
		provider string
		count    int
	}
	items := make([]item, 0, len(counts))
	for provider, count := range counts {
		items = append(items, item{provider: provider, count: count})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].count == items[j].count {
			return items[i].provider < items[j].provider
		}
		return items[i].count > items[j].count
	})
	return items[0].provider
}

func ensureModelProviderCatalogOption() error {
	var option Option
	err := DB.Where("key = ?", optionKeyModelProviderCatalog).First(&option).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		raw, buildErr := buildDefaultModelProviderCatalogRaw()
		if buildErr != nil {
			return buildErr
		}
		created := Option{
			Key:   optionKeyModelProviderCatalog,
			Value: raw,
		}
		if createErr := DB.Create(&created).Error; createErr != nil {
			return createErr
		}
		logger.SysLog("migration: initialized ModelProviderCatalog option")
		return nil
	}

	normalizedRaw, normalizeErr := normalizeModelProviderCatalogRaw(option.Value)
	if normalizeErr != nil {
		normalizedRaw, normalizeErr = buildDefaultModelProviderCatalogRaw()
		if normalizeErr != nil {
			return normalizeErr
		}
	}
	if normalizedRaw == option.Value {
		return nil
	}
	if err := DB.Model(&Option{}).
		Where("key = ?", optionKeyModelProviderCatalog).
		Update("value", normalizedRaw).Error; err != nil {
		return err
	}
	logger.SysLog("migration: normalized ModelProviderCatalog option")
	return nil
}

func buildDefaultModelProviderCatalogRaw() (string, error) {
	seedProviders := []string{"openai", "google", "anthropic", "deepseek", "qwen"}
	providerSet := make(map[string]map[string]struct{}, len(seedProviders))
	for _, provider := range seedProviders {
		providerSet[provider] = make(map[string]struct{})
	}

	channels := make([]Channel, 0)
	if err := DB.Select("models").Find(&channels).Error; err != nil {
		return "", err
	}
	for _, channel := range channels {
		models := strings.Split(channel.Models, ",")
		for _, modelName := range models {
			name := strings.TrimSpace(modelName)
			if name == "" {
				continue
			}
			provider := commonutils.NormalizeModelProvider(commonutils.ResolveModelProvider(name))
			if provider == "" || provider == "unknown" {
				continue
			}
			if providerSet[provider] == nil {
				providerSet[provider] = make(map[string]struct{})
			}
			providerSet[provider][name] = struct{}{}
		}
	}
	items := make([]modelProviderCatalogMigrationItem, 0, len(providerSet))
	now := helper.GetTimestamp()
	for provider, modelSet := range providerSet {
		models := make([]string, 0, len(modelSet))
		for modelName := range modelSet {
			if modelName == "" {
				continue
			}
			models = append(models, modelName)
		}
		sort.Strings(models)
		items = append(items, modelProviderCatalogMigrationItem{
			Provider:  provider,
			Name:      provider,
			Models:    models,
			Source:    "default",
			UpdatedAt: now,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Provider < items[j].Provider
	})
	raw, err := json.Marshal(items)
	return string(raw), err
}

func normalizeModelProviderCatalogRaw(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return buildDefaultModelProviderCatalogRaw()
	}
	items := make([]modelProviderCatalogMigrationItem, 0)
	if err := json.Unmarshal([]byte(trimmed), &items); err != nil {
		return "", err
	}

	indexByProvider := make(map[string]int, len(items))
	normalized := make([]modelProviderCatalogMigrationItem, 0, len(items))
	for _, item := range items {
		provider := commonutils.NormalizeModelProvider(item.Provider)
		if provider == "" {
			provider = commonutils.NormalizeModelProvider(item.Name)
		}
		if provider == "" {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = provider
		}
		source := strings.TrimSpace(strings.ToLower(item.Source))
		if source == "" {
			source = "manual"
		}
		modelSet := make(map[string]struct{}, len(item.Models))
		for _, modelName := range item.Models {
			name := strings.TrimSpace(modelName)
			if name == "" {
				continue
			}
			modelSet[name] = struct{}{}
		}
		models := make([]string, 0, len(modelSet))
		for name := range modelSet {
			models = append(models, name)
		}
		sort.Strings(models)

		entry := modelProviderCatalogMigrationItem{
			Provider:  provider,
			Name:      name,
			Models:    models,
			Source:    source,
			UpdatedAt: item.UpdatedAt,
		}
		if idx, ok := indexByProvider[provider]; ok {
			existing := normalized[idx]
			modelUnion := make(map[string]struct{}, len(existing.Models)+len(entry.Models))
			for _, m := range existing.Models {
				modelUnion[m] = struct{}{}
			}
			for _, m := range entry.Models {
				modelUnion[m] = struct{}{}
			}
			mergedModels := make([]string, 0, len(modelUnion))
			for m := range modelUnion {
				mergedModels = append(mergedModels, m)
			}
			sort.Strings(mergedModels)
			existing.Models = mergedModels
			if existing.Name == existing.Provider && entry.Name != entry.Provider {
				existing.Name = entry.Name
			}
			if entry.UpdatedAt > existing.UpdatedAt {
				existing.UpdatedAt = entry.UpdatedAt
			}
			existing.Source = entry.Source
			normalized[idx] = existing
			continue
		}
		indexByProvider[provider] = len(normalized)
		normalized = append(normalized, entry)
	}
	sort.Slice(normalized, func(i, j int) bool {
		return normalized[i].Provider < normalized[j].Provider
	})

	normalizedRaw, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(normalizedRaw), nil
}
