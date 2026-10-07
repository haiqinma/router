package model

import (
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRefreshProviderImageEditMaskCapabilityWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ProviderModel{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	// 已有 OpenAI 编辑模型：旧 spec 里只有 size，迁移后应追加 mask 且保留 size
	legacySpec := MarshalProviderModelSpecification(&ProviderModelSpecification{
		Version: 1,
		Endpoints: map[string]ProviderModelEndpointSpecification{
			ChannelModelEndpointImageEdit: {
				Parameters: map[string]ProviderModelParameterSpecification{
					"size": {Type: "string", AllowedValues: []string{"1024x1024"}},
				},
			},
		},
	})
	if err := db.Create(&ProviderModel{Provider: "openai", Model: "dall-e-2", Specification: legacySpec}).Error; err != nil {
		t.Fatalf("seed dall-e-2: %v", err)
	}
	// 指令式编辑模型：不得被声明 mask
	if err := db.Create(&ProviderModel{Provider: "qwen", Model: "qwen-image-3.0-pro"}).Error; err != nil {
		t.Fatalf("seed qwen-image-3.0-pro: %v", err)
	}

	if err := refreshProviderImageEditMaskCapabilityWithDB(db); err != nil {
		t.Fatalf("refreshProviderImageEditMaskCapabilityWithDB() error = %v", err)
	}

	var dalle ProviderModel
	if err := db.Where("provider = ? AND model = ?", "openai", "dall-e-2").First(&dalle).Error; err != nil {
		t.Fatalf("load dall-e-2: %v", err)
	}
	dalleSpec, err := ParseProviderModelSpecification(dalle.Specification)
	if err != nil || dalleSpec == nil {
		t.Fatalf("parse dall-e-2 spec: spec=%v err=%v", dalleSpec, err)
	}
	dalleEdit := dalleSpec.Endpoints[ChannelModelEndpointImageEdit]
	if got := dalleEdit.Parameters["mask"].Type; got != "file" {
		t.Fatalf("dall-e-2 mask type = %q, want file", got)
	}
	if got := dalleEdit.Parameters["size"].AllowedValues; len(got) != 1 || got[0] != "1024x1024" {
		t.Fatalf("dall-e-2 size parameter not preserved: %#v", got)
	}

	// wanx2.1-imageedit 不存在时应被补建，且声明 mask 与 /v1/images/edits
	var wanx ProviderModel
	if err := db.Where("provider = ? AND model = ?", "qwen", "wanx2.1-imageedit").First(&wanx).Error; err != nil {
		t.Fatalf("wanx2.1-imageedit should be created: %v", err)
	}
	if !strings.Contains(wanx.SupportedEndpoints, ChannelModelEndpointImageEdit) {
		t.Fatalf("wanx supported_endpoints = %q", wanx.SupportedEndpoints)
	}
	if wanx.PriceUnit != ProviderPriceUnitPerImage {
		t.Fatalf("wanx price_unit = %q, want %q", wanx.PriceUnit, ProviderPriceUnitPerImage)
	}
	wanxSpec, err := ParseProviderModelSpecification(wanx.Specification)
	if err != nil || wanxSpec == nil {
		t.Fatalf("parse wanx spec: spec=%v err=%v", wanxSpec, err)
	}
	if got := wanxSpec.Endpoints[ChannelModelEndpointImageEdit].Parameters["mask"].Type; got != "file" {
		t.Fatalf("wanx mask type = %q, want file", got)
	}

	// gpt-image-2 不存在且 create=false：不应被凭空创建
	var count int64
	db.Model(&ProviderModel{}).Where("provider = ? AND model = ?", "openai", "gpt-image-2").Count(&count)
	if count != 0 {
		t.Fatalf("gpt-image-2 should not be created, count=%d", count)
	}

	var qwen ProviderModel
	if err := db.Where("provider = ? AND model = ?", "qwen", "qwen-image-3.0-pro").First(&qwen).Error; err != nil {
		t.Fatalf("load qwen-image-3.0-pro: %v", err)
	}
	qwenSpec, err := ParseProviderModelSpecification(qwen.Specification)
	if err != nil {
		t.Fatalf("parse qwen spec: %v", err)
	}
	if qwenSpec != nil {
		if _, declared := qwenSpec.Endpoints[ChannelModelEndpointImageEdit].Parameters["mask"]; declared {
			t.Fatalf("qwen-image-3.0-pro must not declare mask")
		}
	}
}
