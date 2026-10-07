package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestUnifyQwenPricingToCNYWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Provider{}, &ProviderModel{}, &ProviderModelPriceComponent{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	if err := db.Create(&Provider{Id: "qwen", Name: "QianWen"}).Error; err != nil {
		t.Fatalf("seed provider: %v", err)
	}
	// USD models with stray international source URLs, plus an already-CNY model.
	seeds := []ProviderModel{
		{Provider: "qwen", Model: "qwen3.8-max", Currency: ProviderPriceCurrencyUSD, InputPrice: 0.00165, OutputPrice: 0.004951, PriceUnit: ProviderPriceUnitPer1KTokens, SourceURL: "https://www.alibabacloud.com/help/en/model-studio/model-pricing"},
		{Provider: "qwen", Model: "qwen3.8-flash", Currency: ProviderPriceCurrencyUSD, InputPrice: 0.00015, OutputPrice: 0.00047, PriceUnit: ProviderPriceUnitPer1KTokens, SourceURL: "https://www.alibabacloud.com/help/en/model-studio/model-pricing"},
		{Provider: "qwen", Model: "qwen-image-3.0-pro", Currency: ProviderPriceCurrencyUSD, InputPrice: 0.04, PriceUnit: ProviderPriceUnitPerImage, SourceURL: "https://www.alibabacloud.com/help/en/model-studio/model-pricing"},
		{Provider: "qwen", Model: "qwen3.7-max", Currency: ProviderPriceCurrencyCNY, InputPrice: 0.012, OutputPrice: 0.036, PriceUnit: ProviderPriceUnitPer1KTokens, SourceURL: "https://help.aliyun.com/zh/model-studio/model-pricing"},
	}
	if err := db.Create(&seeds).Error; err != nil {
		t.Fatalf("seed models: %v", err)
	}
	if err := db.Create(&ProviderModelPriceComponent{Provider: "qwen", Model: "qwen3.7-max", Component: "text", Currency: ProviderPriceCurrencyUSD, SourceURL: "https://www.alibabacloud.com/help/en/model-studio/model-pricing"}).Error; err != nil {
		t.Fatalf("seed component: %v", err)
	}

	// Idempotent: run twice.
	for i := 0; i < 2; i++ {
		if err := unifyQwenPricingToCNYWithDB(db); err != nil {
			t.Fatalf("iteration %d: unifyQwenPricingToCNYWithDB() error = %v", i, err)
		}
	}

	// Provider-level pricing_url is set.
	var provider Provider
	if err := db.First(&provider, "id = ?", "qwen").Error; err != nil {
		t.Fatalf("load provider: %v", err)
	}
	if provider.PricingURL != qwenPricingURLChina {
		t.Fatalf("provider pricing_url = %q, want %q", provider.PricingURL, qwenPricingURLChina)
	}

	loadModel := func(name string) ProviderModel {
		var row ProviderModel
		if err := db.Where("provider = ? AND model = ?", "qwen", name).First(&row).Error; err != nil {
			t.Fatalf("load %s: %v", name, err)
		}
		return row
	}

	// All Qwen models are CNY with cleared source_url (inherit provider default).
	for _, name := range []string{"qwen3.8-max", "qwen3.8-flash", "qwen-image-3.0-pro", "qwen3.7-max"} {
		row := loadModel(name)
		if row.Currency != ProviderPriceCurrencyCNY {
			t.Fatalf("%s currency = %q, want CNY", name, row.Currency)
		}
		if row.SourceURL != "" {
			t.Fatalf("%s source_url = %q, want empty (inherit)", name, row.SourceURL)
		}
	}

	// USD models converted to their CNY list prices.
	if row := loadModel("qwen3.8-max"); row.InputPrice != 0.012 || row.OutputPrice != 0.036 {
		t.Fatalf("qwen3.8-max price = %v/%v, want 0.012/0.036", row.InputPrice, row.OutputPrice)
	}
	if row := loadModel("qwen3.8-flash"); row.InputPrice != 0.0008 || row.OutputPrice != 0.0027 {
		t.Fatalf("qwen3.8-flash price = %v/%v, want 0.0008/0.0027", row.InputPrice, row.OutputPrice)
	}
	if row := loadModel("qwen-image-3.0-pro"); row.InputPrice != 0.25 || row.PriceUnit != ProviderPriceUnitPerImage {
		t.Fatalf("qwen-image-3.0-pro = %v %q, want 0.25 per_image", row.InputPrice, row.PriceUnit)
	}

	// qwen-image-3.0 is created.
	img := loadModel("qwen-image-3.0")
	if img.InputPrice != 0.18 || img.PriceUnit != ProviderPriceUnitPerImage || img.Currency != ProviderPriceCurrencyCNY {
		t.Fatalf("qwen-image-3.0 = %v %q %q, want 0.18 per_image CNY", img.InputPrice, img.PriceUnit, img.Currency)
	}

	// Component source_url cleared and CNY.
	var comp ProviderModelPriceComponent
	if err := db.Where("provider = ? AND model = ? AND component = ?", "qwen", "qwen3.7-max", "text").First(&comp).Error; err != nil {
		t.Fatalf("load component: %v", err)
	}
	if comp.SourceURL != "" || comp.Currency != ProviderPriceCurrencyCNY {
		t.Fatalf("component = source_url %q currency %q, want empty CNY", comp.SourceURL, comp.Currency)
	}
}
