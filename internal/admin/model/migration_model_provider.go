package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	commonutils "github.com/yeying-community/router/common/utils"
	"gorm.io/gorm"
)

const optionKeyModelProviderCatalog = "ModelProviderCatalog"

type modelProviderCatalogMigrationItem struct {
	Provider     string                     `json:"provider"`
	Name         string                     `json:"name,omitempty"`
	Models       []string                   `json:"models"`
	ModelDetails []ModelProviderModelDetail `json:"model_details,omitempty"`
	BaseURL      string                     `json:"base_url,omitempty"`
	APIKey       string                     `json:"api_key,omitempty"`
	SortOrder    int                        `json:"sort_order,omitempty"`
	Source       string                     `json:"source,omitempty"`
	UpdatedAt    int64                      `json:"updated_at,omitempty"`
}

func normalizeModelProviderSortOrderValue(sortOrder int) int {
	if sortOrder > 0 {
		return sortOrder
	}
	return 0
}

func finalizeModelProviderCatalogSortOrders(items []modelProviderCatalogMigrationItem) []modelProviderCatalogMigrationItem {
	sort.SliceStable(items, func(i, j int) bool {
		leftOrder := normalizeModelProviderSortOrderValue(items[i].SortOrder)
		rightOrder := normalizeModelProviderSortOrderValue(items[j].SortOrder)
		if leftOrder > 0 && rightOrder > 0 {
			if leftOrder != rightOrder {
				return leftOrder < rightOrder
			}
			return items[i].Provider < items[j].Provider
		}
		if leftOrder > 0 {
			return true
		}
		if rightOrder > 0 {
			return false
		}
		return items[i].Provider < items[j].Provider
	})

	nextOrder := 10
	for i := range items {
		order := normalizeModelProviderSortOrderValue(items[i].SortOrder)
		if order > 0 {
			items[i].SortOrder = order
			if order >= nextOrder {
				nextOrder = order + 10
			}
			continue
		}
		items[i].SortOrder = nextOrder
		nextOrder += 10
	}
	return items
}

func runModelProviderMigrationsWithDB(db *gorm.DB) error {
	if err := normalizeChannelModelProviders(db); err != nil {
		return err
	}
	if err := backfillChannelModelProviderFromModels(db); err != nil {
		return err
	}
	if err := ensureModelProviderCatalogTable(db); err != nil {
		return err
	}
	return nil
}

func runModelProviderSortOrderMigrationWithDB(db *gorm.DB) error {
	rows := make([]ModelProvider, 0)
	if err := db.Order("sort_order asc, provider asc").Find(&rows).Error; err != nil {
		return err
	}
	updated := 0
	nextOrder := 10
	for _, row := range rows {
		targetOrder := normalizeModelProviderSortOrderValue(row.SortOrder)
		if targetOrder > 0 {
			if targetOrder >= nextOrder {
				nextOrder = targetOrder + 10
			}
		} else {
			targetOrder = nextOrder
			nextOrder += 10
		}
		if row.SortOrder == targetOrder {
			continue
		}
		if err := db.Model(&ModelProvider{}).
			Where("provider = ?", row.Provider).
			Update("sort_order", targetOrder).Error; err != nil {
			return err
		}
		updated++
	}
	if updated > 0 {
		logger.SysLogf("migration: normalized sort_order for %d model providers", updated)
	}
	return nil
}

func runModelProviderModelsTableMigrationWithDB(db *gorm.DB) error {
	if err := db.AutoMigrate(&ModelProviderModel{}); err != nil {
		return err
	}

	detailsByProvider, err := LoadModelProviderModelDetailsMap(db)
	if err != nil {
		return err
	}
	legacyRawByProvider, legacyErr := LoadLegacyModelProviderModelsRawMap(db)
	if legacyErr != nil {
		return legacyErr
	}

	if len(legacyRawByProvider) > 0 {
		now := helper.GetTimestamp()
		rowsToCreate := make([]ModelProviderModel, 0)
		for provider, raw := range legacyRawByProvider {
			if len(detailsByProvider[provider]) > 0 {
				continue
			}
			details := MergeModelProviderDetails(provider, ParseModelProviderModelsRaw(raw), nil, false, now)
			rowsToCreate = append(rowsToCreate, BuildModelProviderModelRows(provider, details, now)...)
		}
		if len(rowsToCreate) > 0 {
			if err := db.Create(&rowsToCreate).Error; err != nil {
				return err
			}
			logger.SysLogf("migration: backfilled %d provider-model rows from legacy model_providers.models", len(rowsToCreate))
		}
	}

	if db.Migrator().HasColumn("model_providers", "models") {
		if err := db.Migrator().DropColumn("model_providers", "models"); err != nil {
			return err
		}
		logger.SysLog("migration: dropped legacy model_providers.models column")
	}
	return nil
}

func runModelProviderModelsTableRenameMigrationWithDB(db *gorm.DB) error {
	oldTable := LegacyModelProviderModelsTableName
	newTable := ModelProviderModelsTableName

	hasOld := db.Migrator().HasTable(oldTable)
	if !hasOld {
		return nil
	}
	hasNew := db.Migrator().HasTable(newTable)

	if !hasNew {
		if err := db.Migrator().RenameTable(oldTable, newTable); err != nil {
			return err
		}
		logger.SysLogf("migration: renamed table %s -> %s", oldTable, newTable)
		return nil
	}

	copySQL := fmt.Sprintf(
		"INSERT INTO %s (provider, model, type, input_price, output_price, price_unit, currency, source, updated_at) "+
			"SELECT provider, model, type, input_price, output_price, price_unit, currency, source, updated_at FROM %s "+
			"ON CONFLICT (provider, model) DO NOTHING",
		newTable,
		oldTable,
	)
	if err := db.Exec(copySQL).Error; err != nil {
		return err
	}
	if err := db.Migrator().DropTable(oldTable); err != nil {
		return err
	}
	logger.SysLogf("migration: merged table %s into %s and dropped %s", oldTable, newTable, oldTable)
	return nil
}

func normalizeChannelModelProviders(db *gorm.DB) error {
	channels := make([]Channel, 0)
	if err := db.Select("id", "model_provider").
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
		if err := db.Model(&Channel{}).
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

func backfillChannelModelProviderFromModels(db *gorm.DB) error {
	channels := make([]Channel, 0)
	if err := db.Select("id", "models", "model_provider").
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
		if err := db.Model(&Channel{}).
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

func ensureModelProviderCatalogTable(db *gorm.DB) error {
	tableItems, err := loadModelProviderCatalogFromTable(db)
	if err != nil {
		return err
	}

	if len(tableItems) == 0 {
		legacyItems, legacyErr := loadModelProviderCatalogFromLegacyOption(db)
		if legacyErr != nil {
			return legacyErr
		}
		if len(legacyItems) > 0 {
			tableItems = legacyItems
			logger.SysLog("migration: imported model providers from options.ModelProviderCatalog")
		} else {
			tableItems = buildDefaultModelProviderCatalogMigration(helper.GetTimestamp())
			logger.SysLog("migration: initialized model providers from code model catalog")
		}
	}

	normalizedItems, normalizeErr := normalizeModelProviderCatalogItems(tableItems, true)
	if normalizeErr != nil {
		logger.SysError("migration: normalize model providers failed, fallback to code defaults: " + normalizeErr.Error())
		normalizedItems = buildDefaultModelProviderCatalogMigration(helper.GetTimestamp())
	}

	if err := saveModelProviderCatalogToTable(db, normalizedItems); err != nil {
		return err
	}

	if err := db.Where("key = ?", optionKeyModelProviderCatalog).Delete(&Option{}).Error; err != nil {
		return err
	}
	return nil
}

func normalizeModelProviderCatalogItems(items []modelProviderCatalogMigrationItem, mergeWithCodeDefaults bool) ([]modelProviderCatalogMigrationItem, error) {
	now := helper.GetTimestamp()
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
		details := make([]ModelProviderModelDetail, 0, len(item.ModelDetails)+len(item.Models))
		details = append(details, item.ModelDetails...)
		for _, modelName := range item.Models {
			details = append(details, ModelProviderModelDetail{Model: strings.TrimSpace(modelName)})
		}
		details = MergeModelProviderDetails(provider, details, item.Models, false, now)
		entry := modelProviderCatalogMigrationItem{
			Provider:     provider,
			Name:         name,
			Models:       ModelProviderModelNames(details),
			ModelDetails: details,
			BaseURL:      strings.TrimSpace(item.BaseURL),
			APIKey:       strings.TrimSpace(item.APIKey),
			SortOrder:    normalizeModelProviderSortOrderValue(item.SortOrder),
			Source:       source,
			UpdatedAt:    item.UpdatedAt,
		}

		if idx, ok := indexByProvider[provider]; ok {
			existing := normalized[idx]
			existing.ModelDetails = MergeModelProviderDetails(
				provider,
				append(existing.ModelDetails, entry.ModelDetails...),
				append(existing.Models, entry.Models...),
				false,
				now,
			)
			existing.Models = ModelProviderModelNames(existing.ModelDetails)
			if existing.Name == existing.Provider && entry.Name != entry.Provider {
				existing.Name = entry.Name
			}
			if existing.BaseURL == "" && entry.BaseURL != "" {
				existing.BaseURL = entry.BaseURL
			}
			if entry.BaseURL != "" && entry.Source != "default" {
				existing.BaseURL = entry.BaseURL
			}
			if existing.APIKey == "" && entry.APIKey != "" {
				existing.APIKey = entry.APIKey
			}
			if entry.APIKey != "" && entry.Source != "default" {
				existing.APIKey = entry.APIKey
			}
			if entry.SortOrder > 0 && entry.Source != "default" {
				existing.SortOrder = entry.SortOrder
			}
			if existing.SortOrder <= 0 && entry.SortOrder > 0 {
				existing.SortOrder = entry.SortOrder
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

	if mergeWithCodeDefaults {
		normalized = reconcileWithCodeDefaults(normalized, now)
	}
	normalized = finalizeModelProviderCatalogSortOrders(normalized)
	return normalized, nil
}

func loadModelProviderCatalogFromLegacyOption(db *gorm.DB) ([]modelProviderCatalogMigrationItem, error) {
	var option Option
	err := db.Where("key = ?", optionKeyModelProviderCatalog).First(&option).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	raw := strings.TrimSpace(option.Value)
	if raw == "" {
		return nil, nil
	}
	normalizedRaw, normalizeErr := normalizeModelProviderCatalogRaw(raw, true)
	if normalizeErr != nil {
		logger.SysError("migration: failed to parse options.ModelProviderCatalog, fallback to defaults: " + normalizeErr.Error())
		return nil, nil
	}
	items := make([]modelProviderCatalogMigrationItem, 0)
	if err := json.Unmarshal([]byte(normalizedRaw), &items); err != nil {
		return nil, err
	}
	return items, nil
}

func loadModelProviderCatalogFromTable(db *gorm.DB) ([]modelProviderCatalogMigrationItem, error) {
	detailsByProvider, err := LoadModelProviderModelDetailsMap(db)
	if err != nil {
		return nil, err
	}
	legacyRawByProvider, legacyErr := LoadLegacyModelProviderModelsRawMap(db)
	if legacyErr != nil {
		return nil, legacyErr
	}

	rows := make([]ModelProvider, 0)
	if err := db.Order("sort_order asc, provider asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]modelProviderCatalogMigrationItem, 0, len(rows))
	for _, row := range rows {
		provider := commonutils.NormalizeModelProvider(row.Provider)
		if provider == "" {
			continue
		}
		details := detailsByProvider[provider]
		if len(details) == 0 {
			legacyRaw := strings.TrimSpace(legacyRawByProvider[provider])
			if legacyRaw != "" {
				details = ParseModelProviderModelsRaw(legacyRaw)
			}
		}
		details = MergeModelProviderDetails(provider, details, nil, false, helper.GetTimestamp())
		items = append(items, modelProviderCatalogMigrationItem{
			Provider:     provider,
			Name:         strings.TrimSpace(row.Name),
			Models:       ModelProviderModelNames(details),
			ModelDetails: details,
			BaseURL:      strings.TrimSpace(row.BaseURL),
			APIKey:       strings.TrimSpace(row.APIKey),
			SortOrder:    normalizeModelProviderSortOrderValue(row.SortOrder),
			Source:       strings.TrimSpace(strings.ToLower(row.Source)),
			UpdatedAt:    row.UpdatedAt,
		})
	}
	return items, nil
}

func saveModelProviderCatalogToTable(db *gorm.DB, items []modelProviderCatalogMigrationItem) error {
	now := helper.GetTimestamp()
	items = finalizeModelProviderCatalogSortOrders(items)
	providerRows := make([]ModelProvider, 0, len(items))
	modelRows := make([]ModelProviderModel, 0)
	for _, item := range items {
		provider := commonutils.NormalizeModelProvider(item.Provider)
		if provider == "" {
			continue
		}
		details := MergeModelProviderDetails(provider, item.ModelDetails, item.Models, false, now)
		updatedAt := item.UpdatedAt
		if updatedAt == 0 {
			updatedAt = now
		}
		source := strings.TrimSpace(strings.ToLower(item.Source))
		if source == "" {
			source = "manual"
		}
		providerRows = append(providerRows, ModelProvider{
			Provider:  provider,
			Name:      strings.TrimSpace(item.Name),
			BaseURL:   strings.TrimSpace(item.BaseURL),
			APIKey:    strings.TrimSpace(item.APIKey),
			SortOrder: item.SortOrder,
			Source:    source,
			UpdatedAt: updatedAt,
		})
		modelRows = append(modelRows, BuildModelProviderModelRows(provider, details, now)...)
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&ModelProviderModel{}).Error; err != nil {
			return err
		}
		if err := tx.Where("1 = 1").Delete(&ModelProvider{}).Error; err != nil {
			return err
		}
		if len(providerRows) > 0 {
			if err := tx.Create(&providerRows).Error; err != nil {
				return err
			}
		}
		if len(modelRows) > 0 {
			if err := tx.Create(&modelRows).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func buildDefaultModelProviderCatalogMigration(now int64) []modelProviderCatalogMigrationItem {
	seeds := BuildDefaultModelProviderCatalogSeeds(now)
	items := make([]modelProviderCatalogMigrationItem, 0, len(seeds))
	for _, seed := range seeds {
		items = append(items, modelProviderCatalogMigrationItem{
			Provider:     seed.Provider,
			Name:         seed.Name,
			Models:       ModelProviderModelNames(seed.ModelDetails),
			ModelDetails: seed.ModelDetails,
			BaseURL:      seed.BaseURL,
			SortOrder:    seed.SortOrder,
			Source:       "default",
			UpdatedAt:    now,
		})
	}
	return items
}

func buildDefaultModelProviderCatalogRaw() (string, error) {
	items := buildDefaultModelProviderCatalogMigration(helper.GetTimestamp())
	raw, err := json.Marshal(items)
	return string(raw), err
}

func normalizeModelProviderCatalogRaw(raw string, mergeWithCodeDefaults bool) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		if mergeWithCodeDefaults {
			return buildDefaultModelProviderCatalogRaw()
		}
		emptyRaw, err := json.Marshal([]modelProviderCatalogMigrationItem{})
		return string(emptyRaw), err
	}
	items := make([]modelProviderCatalogMigrationItem, 0)
	if err := json.Unmarshal([]byte(trimmed), &items); err != nil {
		return "", err
	}
	normalized, err := normalizeModelProviderCatalogItems(items, mergeWithCodeDefaults)
	if err != nil {
		return "", err
	}
	normalizedRaw, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(normalizedRaw), nil
}

func reconcileWithCodeDefaults(items []modelProviderCatalogMigrationItem, now int64) []modelProviderCatalogMigrationItem {
	defaults := buildDefaultModelProviderCatalogMigration(now)
	defaultByProvider := make(map[string]modelProviderCatalogMigrationItem, len(defaults))
	for _, item := range defaults {
		defaultByProvider[item.Provider] = item
	}

	result := make(map[string]modelProviderCatalogMigrationItem, len(items)+len(defaults))
	for _, item := range defaults {
		result[item.Provider] = item
	}

	for _, item := range items {
		provider := commonutils.NormalizeModelProvider(item.Provider)
		if provider == "" {
			continue
		}
		item.Provider = provider
		item.ModelDetails = MergeModelProviderDetails(provider, item.ModelDetails, item.Models, false, now)
		item.Models = ModelProviderModelNames(item.ModelDetails)

		if seededItem, ok := defaultByProvider[provider]; ok {
			merged := seededItem
			if strings.TrimSpace(item.Name) != "" && item.Name != provider {
				merged.Name = strings.TrimSpace(item.Name)
			}
			if strings.TrimSpace(item.BaseURL) != "" {
				merged.BaseURL = strings.TrimSpace(item.BaseURL)
			}
			if strings.TrimSpace(item.APIKey) != "" {
				merged.APIKey = strings.TrimSpace(item.APIKey)
			}
			if item.SortOrder > 0 {
				merged.SortOrder = item.SortOrder
			}
			if item.UpdatedAt > 0 {
				merged.UpdatedAt = item.UpdatedAt
			}
			if item.Source != "default" {
				merged.Source = item.Source
			}
			merged.ModelDetails = MergeModelProviderDetails(
				provider,
				append(seededItem.ModelDetails, item.ModelDetails...),
				append(seededItem.Models, item.Models...),
				false,
				now,
			)
			merged.Models = ModelProviderModelNames(merged.ModelDetails)
			result[provider] = merged
			continue
		}
		if item.Source == "" {
			item.Source = "manual"
		}
		item.SortOrder = normalizeModelProviderSortOrderValue(item.SortOrder)
		result[provider] = item
	}

	mergedItems := make([]modelProviderCatalogMigrationItem, 0, len(result))
	for _, item := range result {
		item.ModelDetails = MergeModelProviderDetails(item.Provider, item.ModelDetails, item.Models, false, now)
		item.Models = ModelProviderModelNames(item.ModelDetails)
		if item.Name == "" {
			item.Name = item.Provider
		}
		if item.Source == "" {
			item.Source = "manual"
		}
		item.SortOrder = normalizeModelProviderSortOrderValue(item.SortOrder)
		mergedItems = append(mergedItems, item)
	}
	return finalizeModelProviderCatalogSortOrders(mergedItems)
}
