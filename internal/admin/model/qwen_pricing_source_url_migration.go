package model

import (
	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

const (
	// qwenPricingSourceURLChina is the official Alibaba Model Studio pricing page
	// for China mainland (CNY) list prices.
	qwenPricingSourceURLChina = "https://help.aliyun.com/zh/model-studio/model-pricing"
	// qwenPricingSourceURLIntl is the official Alibaba Cloud Model Studio pricing
	// page for the international (USD) region.
	qwenPricingSourceURLIntl = "https://www.alibabacloud.com/help/en/model-studio/model-pricing"
)

// refreshQwenPricingSourceURLWithDB backfills auditable source URLs onto every
// Qwen pricing row so the admin UI can link each number to its official origin.
// URLs are assigned by currency (CNY -> China mainland page, USD -> international
// page) and only written when currently empty, keeping the migration idempotent.
// It also corrects the qwen3.8-max international price, which was seeded wrong.
func refreshQwenPricingSourceURLWithDB(db *gorm.DB) error {
	if db == nil {
		return gorm.ErrInvalidDB
	}
	now := helper.GetTimestamp()

	// Versioned migrations run before the schema AutoMigrate pass, so make sure the
	// source_url columns exist before backfilling them.
	if err := db.AutoMigrate(&ProviderModel{}, &ProviderModelPriceComponent{}); err != nil {
		return err
	}

	// Correct the qwen3.8-max international (USD) price before backfilling links,
	// so the corrected row still receives its source URL below. Official overseas
	// list price is $1.65 / $4.951 per 1M tokens (per_1k_tokens: 0.00165 / 0.004951).
	if err := db.Model(&ProviderModel{}).
		Where("provider = ? AND model = ?", "qwen", "qwen3.8-max").
		Updates(map[string]any{
			"input_price":  0.00165,
			"output_price": 0.004951,
			"currency":     ProviderPriceCurrencyUSD,
			"updated_at":   now,
		}).Error; err != nil {
		return err
	}

	for _, backfill := range []struct {
		currency  string
		sourceURL string
	}{
		{currency: ProviderPriceCurrencyCNY, sourceURL: qwenPricingSourceURLChina},
		{currency: ProviderPriceCurrencyUSD, sourceURL: qwenPricingSourceURLIntl},
	} {
		if err := db.Model(&ProviderModel{}).
			Where("provider = ? AND currency = ? AND (source_url = ? OR source_url IS NULL)", "qwen", backfill.currency, "").
			Updates(map[string]any{
				"source_url": backfill.sourceURL,
				"updated_at": now,
			}).Error; err != nil {
			return err
		}
		if err := db.Model(&ProviderModelPriceComponent{}).
			Where("provider = ? AND currency = ? AND (source_url = ? OR source_url IS NULL)", "qwen", backfill.currency, "").
			Updates(map[string]any{
				"source_url": backfill.sourceURL,
				"updated_at": now,
			}).Error; err != nil {
			return err
		}
	}

	return nil
}
