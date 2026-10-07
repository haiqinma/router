package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRefreshQwenPricingSourceURLWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ProviderModel{}, &ProviderModelPriceComponent{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	// CNY 内地模型、USD 国际模型(含待订正的 qwen3.8-max)、以及已有 source_url 的模型
	seeds := []ProviderModel{
		{Provider: "qwen", Model: "qwen3.7-max", Currency: ProviderPriceCurrencyCNY, InputPrice: 0.012, OutputPrice: 0.036},
		{Provider: "qwen", Model: "qwen3.8-max", Currency: ProviderPriceCurrencyUSD, InputPrice: 0.002, OutputPrice: 0.006},
		{Provider: "qwen", Model: "qwen3.8-flash", Currency: ProviderPriceCurrencyUSD, InputPrice: 0.00015, OutputPrice: 0.00047},
		{Provider: "qwen", Model: "qwen-manual", Currency: ProviderPriceCurrencyCNY, SourceURL: "https://example.com/custom"},
	}
	if err := db.Create(&seeds).Error; err != nil {
		t.Fatalf("seed models: %v", err)
	}
	components := []ProviderModelPriceComponent{
		{Provider: "qwen", Model: "qwen3.7-max", Component: "text", Currency: ProviderPriceCurrencyCNY},
		{Provider: "qwen", Model: "qwen3.8-flash", Component: "text", Currency: ProviderPriceCurrencyUSD},
	}
	if err := db.Create(&components).Error; err != nil {
		t.Fatalf("seed components: %v", err)
	}

	// 幂等:跑两次结果一致
	for i := 0; i < 2; i++ {
		if err := refreshQwenPricingSourceURLWithDB(db); err != nil {
			t.Fatalf("iteration %d: refreshQwenPricingSourceURLWithDB() error = %v", i, err)
		}
	}

	assertSourceURL := func(model, want string) {
		var row ProviderModel
		if err := db.Where("provider = ? AND model = ?", "qwen", model).First(&row).Error; err != nil {
			t.Fatalf("load %s: %v", model, err)
		}
		if row.SourceURL != want {
			t.Fatalf("%s source_url = %q, want %q", model, row.SourceURL, want)
		}
	}
	assertSourceURL("qwen3.7-max", qwenPricingSourceURLChina)
	assertSourceURL("qwen3.8-flash", qwenPricingSourceURLIntl)
	assertSourceURL("qwen3.8-max", qwenPricingSourceURLIntl)
	// 已有自定义 source_url 不被覆盖
	assertSourceURL("qwen-manual", "https://example.com/custom")

	// qwen3.8-max 价格订正为海外官价
	var maxRow ProviderModel
	if err := db.Where("provider = ? AND model = ?", "qwen", "qwen3.8-max").First(&maxRow).Error; err != nil {
		t.Fatalf("load qwen3.8-max: %v", err)
	}
	if maxRow.InputPrice != 0.00165 || maxRow.OutputPrice != 0.004951 {
		t.Fatalf("qwen3.8-max price = %v/%v, want 0.00165/0.004951", maxRow.InputPrice, maxRow.OutputPrice)
	}
	if maxRow.Currency != ProviderPriceCurrencyUSD {
		t.Fatalf("qwen3.8-max currency = %q, want USD", maxRow.Currency)
	}

	// 价格组件也回填 source_url
	var comp ProviderModelPriceComponent
	if err := db.Where("provider = ? AND model = ? AND component = ?", "qwen", "qwen3.8-flash", "text").First(&comp).Error; err != nil {
		t.Fatalf("load flash component: %v", err)
	}
	if comp.SourceURL != qwenPricingSourceURLIntl {
		t.Fatalf("flash component source_url = %q, want %q", comp.SourceURL, qwenPricingSourceURLIntl)
	}
}
