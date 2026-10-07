package model

import (
	"encoding/json"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

type providerImageMaskCatalogEntry struct {
	provider string
	models   []string
	// create 为 true 时，目录里尚未收录的模型会被补建一行（仅用于本仓库此前没有的模型）。
	create bool
}

// refreshProviderImageEditMaskCapabilityWithDB 为支持遮罩局部重绘的图像编辑模型，在
// /v1/images/edits 的 specification 中声明 mask 参数。客户端据此决定是否展示遮罩工具；
// 指令式编辑模型（qwen-image-edit 等）不声明，relay 收到遮罩时会明确拒绝。
func refreshProviderImageEditMaskCapabilityWithDB(db *gorm.DB) error {
	if db == nil {
		return gorm.ErrInvalidDB
	}
	entries := []providerImageMaskCatalogEntry{
		{provider: "openai", models: []string{"dall-e-2", "gpt-image-1", "gpt-image-2"}},
		{provider: "qwen", models: []string{"wanx2.1-imageedit"}, create: true},
	}
	now := helper.GetTimestamp()
	for _, entry := range entries {
		for _, modelName := range entry.models {
			var row ProviderModel
			err := db.Where("provider = ? AND model = ?", entry.provider, modelName).First(&row).Error
			if err != nil {
				if err != gorm.ErrRecordNotFound {
					return err
				}
				if !entry.create {
					continue
				}
				endpoints, _ := json.Marshal([]string{ChannelModelEndpointImageEdit})
				row = ProviderModel{
					Provider:           entry.provider,
					Model:              modelName,
					Tags:               strings.Join(NormalizeProviderModelTags([]string{ProviderModelTagImage}), ","),
					SupportedEndpoints: string(endpoints),
					Specification:      MarshalProviderModelSpecification(withImageEditMaskParameter(nil)),
					PriceUnit:          ProviderPriceUnitPerImage,
					Currency:           "CNY",
					Source:             "migration",
					UpdatedAt:          now,
				}
				if err := db.Create(&row).Error; err != nil {
					return err
				}
				continue
			}
			spec, err := ParseProviderModelSpecification(row.Specification)
			if err != nil {
				return err
			}
			spec = withImageEditMaskParameter(spec)
			if err := db.Model(&ProviderModel{}).
				Where("provider = ? AND model = ?", entry.provider, modelName).
				Updates(map[string]any{
					"specification": MarshalProviderModelSpecification(spec),
					"updated_at":    now,
				}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// withImageEditMaskParameter 在 /v1/images/edits 端点上声明 mask（文件）参数，其余字段保留。
func withImageEditMaskParameter(spec *ProviderModelSpecification) *ProviderModelSpecification {
	if spec == nil {
		spec = &ProviderModelSpecification{Version: 1}
	}
	if spec.Endpoints == nil {
		spec.Endpoints = map[string]ProviderModelEndpointSpecification{}
	}
	endpoint := spec.Endpoints[ChannelModelEndpointImageEdit]
	if endpoint.Parameters == nil {
		endpoint.Parameters = map[string]ProviderModelParameterSpecification{}
	}
	endpoint.Parameters["mask"] = ProviderModelParameterSpecification{Type: "file"}
	endpoint.InputModalities = normalizeSpecificationValues(append(endpoint.InputModalities, "image", "text"))
	spec.Endpoints[ChannelModelEndpointImageEdit] = endpoint
	return spec
}
