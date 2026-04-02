package model

import (
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"gorm.io/gorm"
)

func normalizeProviderSortOrderValue(sortOrder int) int {
	if sortOrder > 0 {
		return sortOrder
	}
	return 0
}

func syncDefaultProviderCatalogWithDB(db *gorm.DB) error {
	if err := db.AutoMigrate(&Provider{}, &ProviderModel{}, &ProviderModelPriceComponent{}); err != nil {
		return err
	}
	seeds := BuildDefaultProviderCatalogSeeds(helper.GetTimestamp())
	logger.SysLogf("migration: synced model provider catalog with %d default providers", len(seeds))
	return saveProviderCatalogSeedsToTable(db, seeds)
}

func saveProviderCatalogSeedsToTable(db *gorm.DB, seeds []ProviderCatalogSeed) error {
	now := helper.GetTimestamp()
	providerRows := make([]Provider, 0, len(seeds))
	modelRows := make([]ProviderModel, 0)
	componentRows := make([]ProviderModelPriceComponent, 0)
	providerIDs := make([]string, 0, len(seeds))
	existingCreatedAtByProvider := make(map[string]int64)
	existingRows := make([]Provider, 0)
	if err := db.Select("id", "created_at").Find(&existingRows).Error; err != nil {
		return err
	}
	for _, row := range existingRows {
		provider := strings.TrimSpace(strings.ToLower(row.Id))
		if provider == "" || row.CreatedAt <= 0 {
			continue
		}
		existingCreatedAtByProvider[provider] = row.CreatedAt
	}
	for _, seed := range seeds {
		provider := strings.TrimSpace(strings.ToLower(seed.Provider))
		if provider == "" {
			continue
		}
		providerIDs = append(providerIDs, provider)
		details := normalizeDefaultProviderSeedModelDetails(provider, seed.ModelDetails, now)
		providerRows = append(providerRows, Provider{
			Id:          provider,
			Name:        strings.TrimSpace(seed.Name),
			BaseURL:     strings.TrimSpace(seed.BaseURL),
			OfficialURL: strings.TrimSpace(seed.OfficialURL),
			SortOrder:   normalizeProviderSortOrderValue(seed.SortOrder),
			Source:      "default",
			CreatedAt: func() int64 {
				if existingCreatedAtByProvider[provider] > 0 {
					return existingCreatedAtByProvider[provider]
				}
				return now
			}(),
			UpdatedAt: now,
		})
		storeRows := BuildProviderModelStoreRows(provider, details, now)
		modelRows = append(modelRows, storeRows.Models...)
		componentRows = append(componentRows, storeRows.PriceComponents...)
	}
	return db.Transaction(func(tx *gorm.DB) error {
		existingDefaultProviderIDs := make([]string, 0)
		if err := tx.Model(&Provider{}).Where("source = ?", "default").Pluck("id", &existingDefaultProviderIDs).Error; err != nil {
			return err
		}
		deleteProviderIDs := mergeProviderIDs(existingDefaultProviderIDs, providerIDs)
		if len(deleteProviderIDs) > 0 {
			if err := tx.Where("provider IN ?", deleteProviderIDs).Delete(&ProviderModelPriceComponent{}).Error; err != nil {
				return err
			}
			if err := tx.Where("provider IN ?", deleteProviderIDs).Delete(&ProviderModel{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", deleteProviderIDs).Delete(&Provider{}).Error; err != nil {
				return err
			}
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
		if len(componentRows) > 0 {
			if err := tx.Create(&componentRows).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func mergeProviderIDs(left []string, right []string) []string {
	seen := make(map[string]struct{}, len(left)+len(right))
	result := make([]string, 0, len(left)+len(right))
	for _, item := range left {
		provider := strings.TrimSpace(strings.ToLower(item))
		if provider == "" {
			continue
		}
		if _, exists := seen[provider]; exists {
			continue
		}
		seen[provider] = struct{}{}
		result = append(result, provider)
	}
	for _, item := range right {
		provider := strings.TrimSpace(strings.ToLower(item))
		if provider == "" {
			continue
		}
		if _, exists := seen[provider]; exists {
			continue
		}
		seen[provider] = struct{}{}
		result = append(result, provider)
	}
	return result
}
