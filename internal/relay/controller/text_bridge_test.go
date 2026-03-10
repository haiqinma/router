package controller

import (
	"testing"

	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/meta"
	relaymodel "github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
)

func TestResolveChannelTextUpstreamPrefersSelectedModelEndpoint(t *testing.T) {
	meta := &meta.Meta{
		Mode: relaymode.ChatCompletions,
		ChannelModelConfigs: []adminmodel.ChannelModel{{
			Model:     "gpt-4.1",
			Type:      adminmodel.ProviderModelTypeText,
			Selected:  true,
			Endpoint:  adminmodel.ChannelModelEndpointResponses,
			SortOrder: 1,
		}},
	}

	mode, path := resolveChannelTextUpstream(meta, "gpt-4.1", "gpt-4.1")
	if mode != relaymode.Responses || path != adminmodel.ChannelModelEndpointResponses {
		t.Fatalf("resolveChannelTextUpstream selected responses = (%d, %q), want (%d, %q)", mode, path, relaymode.Responses, adminmodel.ChannelModelEndpointResponses)
	}
}

func TestResolveChannelTextUpstreamFallsBackToAbilities(t *testing.T) {
	meta := &meta.Meta{
		Mode: relaymode.ChatCompletions,
		ChannelAbilities: []adminmodel.ChannelAbility{{
			Type:     adminmodel.ProviderModelTypeText,
			Endpoint: adminmodel.ChannelModelEndpointResponses,
		}},
	}

	mode, path := resolveChannelTextUpstream(meta, "unknown", "unknown")
	if mode != relaymode.Responses || path != adminmodel.ChannelModelEndpointResponses {
		t.Fatalf("resolveChannelTextUpstream ability fallback = (%d, %q), want (%d, %q)", mode, path, relaymode.Responses, adminmodel.ChannelModelEndpointResponses)
	}
}

func TestConvertTextRequestForUpstreamToResponses(t *testing.T) {
	req := &relaymodel.GeneralOpenAIRequest{
		Model: "gpt-4.1",
		Messages: []relaymodel.Message{{
			Role:    "user",
			Content: "hello",
		}},
		MaxTokens: 128,
	}

	converted, err := convertTextRequestForUpstream(req, relaymode.ChatCompletions, relaymode.Responses)
	if err != nil {
		t.Fatalf("convertTextRequestForUpstream returned error: %v", err)
	}
	if len(converted.Messages) != 0 {
		t.Fatalf("converted.Messages = %#v, want empty", converted.Messages)
	}
	if converted.Input == nil {
		t.Fatalf("converted.Input = nil, want messages copied into input")
	}
	if converted.MaxOutputTokens == nil || *converted.MaxOutputTokens != 128 {
		t.Fatalf("converted.MaxOutputTokens = %#v, want 128", converted.MaxOutputTokens)
	}
}

func TestConvertTextRequestForUpstreamToChat(t *testing.T) {
	req := &relaymodel.GeneralOpenAIRequest{
		Model:           "gpt-4.1",
		Input:           "hello",
		MaxOutputTokens: func() *int { value := 256; return &value }(),
	}

	converted, err := convertTextRequestForUpstream(req, relaymode.Responses, relaymode.ChatCompletions)
	if err != nil {
		t.Fatalf("convertTextRequestForUpstream returned error: %v", err)
	}
	if len(converted.Messages) != 1 || converted.Messages[0].StringContent() != "hello" {
		t.Fatalf("converted.Messages = %#v, want single user message", converted.Messages)
	}
	if converted.Input != nil {
		t.Fatalf("converted.Input = %#v, want nil", converted.Input)
	}
	if converted.MaxTokens != 256 {
		t.Fatalf("converted.MaxTokens = %d, want 256", converted.MaxTokens)
	}
}
