package model

import (
	"sort"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	commonutils "github.com/yeying-community/router/common/utils"
	"gorm.io/gorm"
)

type providerCatalogMigrationItem struct {
	Provider     string                `json:"provider"`
	Name         string                `json:"name,omitempty"`
	Models       []string              `json:"models"`
	ModelDetails []ProviderModelDetail `json:"model_details,omitempty"`
	BaseURL      string                `json:"base_url,omitempty"`
	SortOrder    int                   `json:"sort_order,omitempty"`
	Source       string                `json:"source,omitempty"`
	UpdatedAt    int64                 `json:"updated_at,omitempty"`
}

func normalizeProviderSortOrderValue(sortOrder int) int {
	if sortOrder > 0 {
		return sortOrder
	}
	return 0
}

func finalizeProviderCatalogSortOrders(items []providerCatalogMigrationItem) []providerCatalogMigrationItem {
	sort.SliceStable(items, func(i, j int) bool {
		leftOrder := normalizeProviderSortOrderValue(items[i].SortOrder)
		rightOrder := normalizeProviderSortOrderValue(items[j].SortOrder)
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
		order := normalizeProviderSortOrderValue(items[i].SortOrder)
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

func syncProviderCatalogWithDB(db *gorm.DB) error {
	if err := db.AutoMigrate(&Provider{}, &ProviderModel{}); err != nil {
		return err
	}
	var count int64
	if err := db.Model(&Provider{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	items := buildDefaultProviderCatalogMigration(helper.GetTimestamp())
	logger.SysLogf("migration: initialized model provider catalog with %d default providers", len(items))
	return saveProviderCatalogToTable(db, items)
}

func saveProviderCatalogToTable(db *gorm.DB, items []providerCatalogMigrationItem) error {
	now := helper.GetTimestamp()
	items = finalizeProviderCatalogSortOrders(items)
	providerRows := make([]Provider, 0, len(items))
	modelRows := make([]ProviderModel, 0)
	for _, item := range items {
		provider := commonutils.NormalizeProvider(item.Provider)
		if provider == "" {
			continue
		}
		details := MergeProviderDetails(provider, item.ModelDetails, item.Models, false, now)
		updatedAt := item.UpdatedAt
		if updatedAt == 0 {
			updatedAt = now
		}
		source := strings.TrimSpace(strings.ToLower(item.Source))
		if source == "" {
			source = "manual"
		}
		providerRows = append(providerRows, Provider{
			Id:        provider,
			Name:      strings.TrimSpace(item.Name),
			BaseURL:   strings.TrimSpace(item.BaseURL),
			SortOrder: item.SortOrder,
			Source:    source,
			UpdatedAt: updatedAt,
		})
		modelRows = append(modelRows, BuildProviderModelRows(provider, details, now)...)
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&ProviderModel{}).Error; err != nil {
			return err
		}
		if err := tx.Where("1 = 1").Delete(&Provider{}).Error; err != nil {
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

func buildDefaultProviderCatalogMigration(now int64) []providerCatalogMigrationItem {
	seeds := BuildDefaultProviderCatalogSeeds(now)
	items := make([]providerCatalogMigrationItem, 0, len(seeds))
	for _, seed := range seeds {
		items = append(items, providerCatalogMigrationItem{
			Provider:     seed.Provider,
			Name:         seed.Name,
			Models:       ProviderModelNames(seed.ModelDetails),
			ModelDetails: seed.ModelDetails,
			BaseURL:      seed.BaseURL,
			SortOrder:    seed.SortOrder,
			Source:       "default",
			UpdatedAt:    now,
		})
	}
	return items
}
