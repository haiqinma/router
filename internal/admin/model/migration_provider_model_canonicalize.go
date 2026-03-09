package model

import (
	"strings"

	"github.com/yeying-community/router/common/helper"
	commonutils "github.com/yeying-community/router/common/utils"
	"gorm.io/gorm"
)

func syncCanonicalProviderModelNamesWithDB(db *gorm.DB) error {
	if db == nil || !db.Migrator().HasTable(&ProviderModel{}) {
		return nil
	}

	rows := make([]ProviderModel, 0)
	if err := db.Order("provider asc, model asc").Find(&rows).Error; err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	byProvider := make(map[string][]ProviderModelDetail, len(rows))
	providerOrder := make([]string, 0)
	providerSeen := make(map[string]struct{}, len(rows))
	changed := false

	for _, row := range rows {
		provider := commonutils.NormalizeProvider(row.Provider)
		if provider == "" || provider == "unknown" {
			provider = strings.TrimSpace(strings.ToLower(row.Provider))
		}
		if provider == "" || provider == "unknown" {
			continue
		}

		canonicalModel := canonicalizeModelNameForProvider(provider, row.Model)
		if provider != row.Provider || canonicalModel != strings.TrimSpace(row.Model) {
			changed = true
		}

		if _, ok := providerSeen[provider]; !ok {
			providerSeen[provider] = struct{}{}
			providerOrder = append(providerOrder, provider)
		}

		byProvider[provider] = append(byProvider[provider], ProviderModelDetail{
			Model:       row.Model,
			Type:        row.Type,
			InputPrice:  row.InputPrice,
			OutputPrice: row.OutputPrice,
			PriceUnit:   row.PriceUnit,
			Currency:    row.Currency,
			Source:      row.Source,
			UpdatedAt:   row.UpdatedAt,
		})
	}

	if !changed {
		return nil
	}

	now := helper.GetTimestamp()
	nextRows := make([]ProviderModel, 0, len(rows))
	for _, provider := range providerOrder {
		nextRows = append(nextRows, BuildProviderModelRows(provider, byProvider[provider], now)...)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&ProviderModel{}).Error; err != nil {
			return err
		}
		if len(nextRows) == 0 {
			return nil
		}
		return tx.Create(&nextRows).Error
	})
}
