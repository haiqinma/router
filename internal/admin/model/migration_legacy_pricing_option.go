package model

import "gorm.io/gorm"

func dropLegacyPricingOptionsWithDB(tx *gorm.DB) error {
	if tx == nil || !tx.Migrator().HasTable(&Option{}) {
		return nil
	}
	return tx.Where("key IN ?", []string{
		"ModelRatio",
		"CompletionRatio",
		"GroupRatio",
	}).Delete(&Option{}).Error
}
