package meta

import (
	"testing"

	"github.com/yeying-community/router/internal/admin/model"
)

func TestResolveEndpointBaseURL(t *testing.T) {
	config := model.ChannelConfig{
		EndpointBaseURLs: map[string]string{
			"/v1/images/generations": "https://image.aixhan.com/",
		},
	}

	got := config.ResolveEndpointBaseURL("/v1/images/generations")
	if got != "https://image.aixhan.com" {
		t.Fatalf("resolveEndpointBaseURL() = %q, want %q", got, "https://image.aixhan.com")
	}
}

func TestResolveEndpointBaseURLNoMatch(t *testing.T) {
	config := model.ChannelConfig{
		EndpointBaseURLs: map[string]string{
			"/v1/images/generations": "https://image.aixhan.com",
		},
	}

	if got := config.ResolveEndpointBaseURL("/v1/responses"); got != "" {
		t.Fatalf("resolveEndpointBaseURL() = %q, want empty", got)
	}
}

func TestGetAPIBaseURL(t *testing.T) {
	config := model.ChannelConfig{
		APIBaseURL: "https://api.example.com/",
	}

	if got := config.GetAPIBaseURL(); got != "https://api.example.com" {
		t.Fatalf("GetAPIBaseURL() = %q, want %q", got, "https://api.example.com")
	}
}
