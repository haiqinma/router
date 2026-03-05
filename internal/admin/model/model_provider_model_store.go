package model

import (
	"strings"

	commonutils "github.com/yeying-community/router/common/utils"
	"gorm.io/gorm"
)

type legacyModelProviderModelsRow struct {
	Provider string
	Models   string
}

func LoadModelProviderModelDetailsMap(db *gorm.DB) (map[string][]ModelProviderModelDetail, error) {
	rows := make([]ModelProviderModel, 0)
	if err := db.Order("provider asc, model asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string][]ModelProviderModelDetail, 0)
	for _, row := range rows {
		provider := commonutils.NormalizeModelProvider(row.Provider)
		if provider == "" {
			provider = strings.TrimSpace(strings.ToLower(row.Provider))
		}
		if provider == "" {
			continue
		}
		result[provider] = append(result[provider], ModelProviderModelDetail{
			Model:       strings.TrimSpace(row.Model),
			Type:        strings.TrimSpace(strings.ToLower(row.Type)),
			InputPrice:  row.InputPrice,
			OutputPrice: row.OutputPrice,
			PriceUnit:   strings.TrimSpace(strings.ToLower(row.PriceUnit)),
			Currency:    strings.TrimSpace(strings.ToUpper(row.Currency)),
			Source:      strings.TrimSpace(strings.ToLower(row.Source)),
			UpdatedAt:   row.UpdatedAt,
		})
	}
	for provider, details := range result {
		result[provider] = NormalizeModelProviderModelDetails(details)
	}
	return result, nil
}

func BuildModelProviderModelRows(provider string, details []ModelProviderModelDetail, now int64) []ModelProviderModel {
	normalizedProvider := commonutils.NormalizeModelProvider(provider)
	if normalizedProvider == "" {
		normalizedProvider = strings.TrimSpace(strings.ToLower(provider))
	}
	if normalizedProvider == "" {
		return nil
	}
	normalizedDetails := NormalizeModelProviderModelDetails(details)
	rows := make([]ModelProviderModel, 0, len(normalizedDetails))
	for _, detail := range normalizedDetails {
		updatedAt := detail.UpdatedAt
		if updatedAt == 0 {
			updatedAt = now
		}
		rows = append(rows, ModelProviderModel{
			Provider:    normalizedProvider,
			Model:       detail.Model,
			Type:        detail.Type,
			InputPrice:  detail.InputPrice,
			OutputPrice: detail.OutputPrice,
			PriceUnit:   detail.PriceUnit,
			Currency:    detail.Currency,
			Source:      detail.Source,
			UpdatedAt:   updatedAt,
		})
	}
	return rows
}

func LoadLegacyModelProviderModelsRawMap(db *gorm.DB) (map[string]string, error) {
	result := make(map[string]string, 0)
	if !db.Migrator().HasColumn("model_providers", "models") {
		return result, nil
	}
	rows := make([]legacyModelProviderModelsRow, 0)
	if err := db.Raw("SELECT provider, models FROM model_providers").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		provider := commonutils.NormalizeModelProvider(row.Provider)
		if provider == "" {
			provider = strings.TrimSpace(strings.ToLower(row.Provider))
		}
		if provider == "" {
			continue
		}
		raw := strings.TrimSpace(row.Models)
		if raw == "" {
			continue
		}
		result[provider] = raw
	}
	return result, nil
}
