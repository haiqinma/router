package model

import "gorm.io/gorm"

func migrateGroupBillingRatioWithDB(tx *gorm.DB) error {
	if tx == nil {
		return nil
	}
	if err := tx.AutoMigrate(&GroupCatalog{}); err != nil {
		return err
	}
	if err := backfillGroupBillingRatiosFromLegacyOptionWithDB(tx); err != nil {
		return err
	}
	return normalizeGroupBillingRatiosWithDB(tx)
}

func normalizeGroupBillingRatiosWithDB(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	rows, err := listGroupCatalogWithDB(db)
	if err != nil {
		return err
	}
	for _, row := range rows {
		nextRatio := normalizeGroupBillingRatio(row.BillingRatio)
		if row.BillingRatio == nextRatio {
			continue
		}
		if err := db.Model(&GroupCatalog{}).
			Where("name = ?", row.Name).
			Update("billing_ratio", nextRatio).Error; err != nil {
			return err
		}
	}
	return nil
}
