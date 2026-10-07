package model

import (
	"encoding/json"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// qwenPricingURLChina is the single official Alibaba Model Studio (China mainland)
// pricing page used as the Qwen provider-level default price source. Individual
// models inherit it by leaving their source_url empty; a non-empty model source_url
// is treated as an explicit override.
const qwenPricingURLChina = "https://help.aliyun.com/zh/model-studio/model-pricing"

// unifyQwenPricingToCNYWithDB consolidates Qwen pricing onto a single auditable
// source of truth:
//   - sets the provider-level pricing_url to the China mainland (zh) pricing page;
//   - clears every Qwen model/component source_url so they inherit that default,
//     removing the stray international (alibabacloud.com/en) links;
//   - normalizes all Qwen currency to CNY and converts the four previously
//     USD-priced models to their China mainland list prices (best-effort for the
//     qwen3.8 series, audited via the inherited zh link);
//   - catalogs qwen-image-3.0 (¥0.18/image), which was previously missing.
//
// The migration is idempotent: it assigns absolute values and upserts, so a retry
// after a mid-transaction failure converges to the same state.
func unifyQwenPricingToCNYWithDB(db *gorm.DB) error {
	if db == nil {
		return gorm.ErrInvalidDB
	}
	now := helper.GetTimestamp()

	// Versioned migrations run before the schema AutoMigrate pass, so make sure the
	// pricing_url / source_url columns exist before writing to them.
	if err := db.AutoMigrate(&Provider{}, &ProviderModel{}, &ProviderModelPriceComponent{}); err != nil {
		return err
	}

	// Provider-level default price source (inherited by models with empty source_url).
	if err := db.Model(&Provider{}).
		Where("id = ?", "qwen").
		Updates(map[string]any{
			"pricing_url": qwenPricingURLChina,
			"updated_at":  now,
		}).Error; err != nil {
		return err
	}

	// Clear per-model and per-component source URLs so they inherit the provider
	// default, and unify every Qwen row to CNY.
	if err := db.Model(&ProviderModel{}).
		Where("provider = ?", "qwen").
		Updates(map[string]any{
			"source_url": "",
			"currency":   ProviderPriceCurrencyCNY,
			"updated_at": now,
		}).Error; err != nil {
		return err
	}
	if err := db.Model(&ProviderModelPriceComponent{}).
		Where("provider = ?", "qwen").
		Updates(map[string]any{
			"source_url": "",
			"currency":   ProviderPriceCurrencyCNY,
			"updated_at": now,
		}).Error; err != nil {
		return err
	}

	// Convert the four previously USD-priced models to China mainland (华北2/北京)
	// CNY list prices from the official Alibaba Model Studio pricing page. The
	// qwen3.8 text models are priced per 1M tokens on the site (0.8/2.7 for
	// flash & omni-flash, 12/36 for max), stored here as per_1k_tokens.
	for _, correction := range []struct {
		model       string
		inputPrice  float64
		outputPrice float64
		priceUnit   string
	}{
		{model: "qwen3.8-max", inputPrice: 0.012, outputPrice: 0.036, priceUnit: ProviderPriceUnitPer1KTokens},
		{model: "qwen3.8-flash", inputPrice: 0.0008, outputPrice: 0.0027, priceUnit: ProviderPriceUnitPer1KTokens},
		{model: "qwen3.8-omni-flash", inputPrice: 0.0008, outputPrice: 0.0027, priceUnit: ProviderPriceUnitPer1KTokens},
		{model: "qwen-image-3.0-pro", inputPrice: 0.25, outputPrice: 0, priceUnit: ProviderPriceUnitPerImage},
	} {
		if err := db.Model(&ProviderModel{}).
			Where("provider = ? AND model = ?", "qwen", correction.model).
			Updates(map[string]any{
				"input_price":  correction.inputPrice,
				"output_price": correction.outputPrice,
				"price_unit":   correction.priceUnit,
				"currency":     ProviderPriceCurrencyCNY,
				"source_url":   "",
				"updated_at":   now,
			}).Error; err != nil {
			return err
		}
	}

	// qwen-image-3.0-pro is tiered (1k base ¥0.25, 2k ¥0.5). Convert the 2k component
	// to its CNY list price so the price-detail popup stays accurate.
	if err := db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "provider"}, {Name: "model"}, {Name: "component"}, {Name: "condition"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"input_price", "output_price", "price_unit", "currency", "source", "source_url", "sort_order", "updated_at",
		}),
	}).Create(&ProviderModelPriceComponent{
		Provider: "qwen", Model: "qwen-image-3.0-pro", Component: ProviderModelPriceComponentImageGeneration, Condition: "size=2k",
		InputPrice: 0.5, PriceUnit: ProviderPriceUnitPerImage, Currency: ProviderPriceCurrencyCNY, Source: "migration", SortOrder: 20, UpdatedAt: now,
	}).Error; err != nil {
		return err
	}

	// Catalog qwen-image-3.0 (¥0.18/image), previously missing from the snapshot.
	imageEndpoints, _ := json.Marshal([]string{"/v1/images/generations", "/v1/images/edits"})
	if err := db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "provider"}, {Name: "model"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"tags", "supported_endpoints", "input_price", "output_price",
			"price_unit", "currency", "source", "updated_at",
		}),
	}).Create(&ProviderModel{
		Provider:           "qwen",
		Model:              "qwen-image-3.0",
		Tags:               strings.Join(NormalizeProviderModelTags([]string{ProviderModelTagImage}), ","),
		SupportedEndpoints: string(imageEndpoints),
		InputPrice:         0.18,
		PriceUnit:          ProviderPriceUnitPerImage,
		Currency:           ProviderPriceCurrencyCNY,
		Source:             "migration",
		UpdatedAt:          now,
	}).Error; err != nil {
		return err
	}

	return nil
}
