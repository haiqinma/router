package model

import "testing"

func floatPtr(v float64) *float64 { return &v }

func TestValidateChannelModelPublishBillingBlocksZeroPriceTextModel(t *testing.T) {
	// 文本模型输入/输出价均为空时,发布会造成零价供给,必须拦截。
	row := ChannelModel{Model: "gpt-zero", Type: "text"}
	if err := validateChannelModelPublishBilling(row); err == nil {
		t.Fatalf("expected zero-price text model to be blocked, got nil")
	}

	// 输入价为 0 输出价也为 0,同样拦截。
	row = ChannelModel{Model: "gpt-zero2", Type: "text", InputPrice: floatPtr(0), OutputPrice: floatPtr(0)}
	if err := validateChannelModelPublishBilling(row); err == nil {
		t.Fatalf("expected explicit zero prices to be blocked, got nil")
	}
}

func TestValidateChannelModelPublishBillingAllowsPricedTextModel(t *testing.T) {
	// 只要有一项正的销售价即可通过(输出价 > 0)。
	row := ChannelModel{Model: "gpt-ok", Type: "text", OutputPrice: floatPtr(0.002)}
	if err := validateChannelModelPublishBilling(row); err != nil {
		t.Fatalf("expected priced text model to pass, got %v", err)
	}

	// 通过价格组件配置的正价也应通过。
	row = ChannelModel{
		Model: "gpt-component",
		Type:  "text",
		PriceComponents: []ProviderModelPriceComponentDetail{
			{Component: ProviderModelPriceComponentText, InputPrice: 0.001},
		},
	}
	if err := validateChannelModelPublishBilling(row); err != nil {
		t.Fatalf("expected component-priced text model to pass, got %v", err)
	}
}
