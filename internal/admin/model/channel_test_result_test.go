package model

import "testing"

func TestNormalizeChannelModelEndpoint(t *testing.T) {
	t.Run("text defaults to responses", func(t *testing.T) {
		if got := NormalizeChannelModelEndpoint(ProviderModelTypeText, ""); got != ChannelModelEndpointResponses {
			t.Fatalf("NormalizeChannelModelEndpoint(text, empty) = %q, want %q", got, ChannelModelEndpointResponses)
		}
		if got := NormalizeChannelModelEndpoint(ProviderModelTypeText, "/V1/CHAT/COMPLETIONS"); got != ChannelModelEndpointChat {
			t.Fatalf("NormalizeChannelModelEndpoint(text, chat) = %q, want %q", got, ChannelModelEndpointChat)
		}
	})

	t.Run("non-text endpoints are fixed by type", func(t *testing.T) {
		if got := NormalizeChannelModelEndpoint(ProviderModelTypeImage, ChannelModelEndpointChat); got != ChannelModelEndpointImages {
			t.Fatalf("NormalizeChannelModelEndpoint(image, chat) = %q, want %q", got, ChannelModelEndpointImages)
		}
		if got := NormalizeChannelModelEndpoint(ProviderModelTypeAudio, ""); got != ChannelModelEndpointAudio {
			t.Fatalf("NormalizeChannelModelEndpoint(audio, empty) = %q, want %q", got, ChannelModelEndpointAudio)
		}
		if got := NormalizeChannelModelEndpoint(ProviderModelTypeVideo, ""); got != ChannelModelEndpointVideos {
			t.Fatalf("NormalizeChannelModelEndpoint(video, empty) = %q, want %q", got, ChannelModelEndpointVideos)
		}
	})
}

func TestNormalizeChannelTestRowsKeepsLatestByModelAndEndpoint(t *testing.T) {
	rows := NormalizeChannelTestRows([]ChannelTest{
		{
			ChannelId: "channel-1",
			Model:     "gpt-4.1",
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointResponses,
			Status:    ChannelTestStatusUnsupported,
			Supported: false,
			TestedAt:  10,
		},
		{
			ChannelId: " channel-1 ",
			Model:     " gpt-4.1 ",
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointResponses,
			Status:    ChannelTestStatusSupported,
			Supported: true,
			TestedAt:  20,
		},
		{
			ChannelId: "channel-1",
			Model:     "gpt-4.1",
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointChat,
			Status:    ChannelTestStatusSupported,
			Supported: true,
			TestedAt:  15,
		},
	})

	if len(rows) != 2 {
		t.Fatalf("NormalizeChannelTestRows returned %d rows, want 2", len(rows))
	}
	if rows[0].Endpoint != ChannelModelEndpointResponses || rows[0].Status != ChannelTestStatusSupported || !rows[0].Supported || rows[0].TestedAt != 20 {
		t.Fatalf("unexpected normalized row[0]: %#v", rows[0])
	}
	if rows[1].Endpoint != ChannelModelEndpointChat {
		t.Fatalf("unexpected normalized row[1] endpoint: %#v", rows[1])
	}
}

func TestNormalizeChannelTestRowsKeepsDistinctRounds(t *testing.T) {
	rows := NormalizeChannelTestRows([]ChannelTest{
		{
			ChannelId: "channel-1",
			Model:     "gpt-4.1",
			Round:     1,
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointResponses,
			Status:    ChannelTestStatusSupported,
			Supported: true,
			TestedAt:  10,
		},
		{
			ChannelId: "channel-1",
			Model:     "gpt-4.1",
			Round:     2,
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointChat,
			Status:    ChannelTestStatusUnsupported,
			Supported: false,
			TestedAt:  20,
		},
	})

	if len(rows) != 2 {
		t.Fatalf("NormalizeChannelTestRows returned %d rows, want 2", len(rows))
	}
	if rows[0].Round != 1 || rows[1].Round != 2 {
		t.Fatalf("unexpected rounds after normalization: %#v", rows)
	}
}

func TestBuildChannelAbilitiesFromTestsUsesOnlySupportedRows(t *testing.T) {
	tests := []ChannelTest{
		{
			ChannelId: "channel-1",
			Model:     "gpt-4.1",
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointResponses,
			Status:    ChannelTestStatusSupported,
			Supported: true,
			LatencyMs: 220,
			TestedAt:  100,
		},
		{
			ChannelId: "channel-1",
			Model:     "gpt-4.1",
			Type:      ProviderModelTypeText,
			Endpoint:  ChannelModelEndpointChat,
			Status:    ChannelTestStatusUnsupported,
			Supported: false,
			TestedAt:  101,
		},
		{
			ChannelId: "channel-1",
			Model:     "gpt-image-1",
			Type:      ProviderModelTypeImage,
			Endpoint:  ChannelModelEndpointImages,
			Status:    ChannelTestStatusSupported,
			Supported: true,
			LatencyMs: 500,
			TestedAt:  102,
		},
	}

	abilities := BuildChannelAbilitiesFromTests("channel-1", tests)
	if len(abilities) != 2 {
		t.Fatalf("BuildChannelAbilitiesFromTests returned %d rows, want 2", len(abilities))
	}
	if abilities[0].Model != "gpt-4.1" || abilities[0].Endpoint != ChannelModelEndpointResponses || abilities[0].Type != ProviderModelTypeText {
		t.Fatalf("unexpected text ability: %#v", abilities[0])
	}
	if abilities[1].Model != "gpt-image-1" || abilities[1].Endpoint != ChannelModelEndpointImages || abilities[1].Type != ProviderModelTypeImage {
		t.Fatalf("unexpected image ability: %#v", abilities[1])
	}
}

func TestBuildChannelAbilitiesFromModelConfigsUsesSelectedRows(t *testing.T) {
	abilities := BuildChannelAbilitiesFromModelConfigs("channel-1", []ChannelModel{
		{
			Model:      "gpt-4.1",
			Type:       ProviderModelTypeText,
			Endpoint:   ChannelModelEndpointResponses,
			Selected:   true,
			LatencyMs:  120,
			TestedAt:   100,
			TestStatus: ChannelTestStatusSupported,
		},
		{
			Model:      "gpt-image-1",
			Type:       ProviderModelTypeImage,
			Endpoint:   ChannelModelEndpointImages,
			Selected:   false,
			LatencyMs:  300,
			TestedAt:   200,
			TestStatus: ChannelTestStatusSupported,
		},
	})

	if len(abilities) != 1 {
		t.Fatalf("BuildChannelAbilitiesFromModelConfigs returned %d rows, want 1", len(abilities))
	}
	if abilities[0].Model != "gpt-4.1" || abilities[0].LatencyMs != 120 || abilities[0].UpdatedAt != 100 {
		t.Fatalf("unexpected ability derived from model config: %#v", abilities[0])
	}
}
