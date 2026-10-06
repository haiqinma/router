package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/routing"
)

func TestApplyProviderRoutingPolicy(t *testing.T) {
	channels := []*adminmodel.Channel{
		{Id: "openai-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "openai", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
		{Id: "anthropic-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "anthropic", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
	}
	filtered, policyFiltered := applyProviderRoutingPolicy(channels, "shared", routing.ProviderRoutingPolicy{
		ProviderScope: routing.ProviderScope{Mode: routing.ProviderScopeAllowList, Providers: []string{"anthropic"}},
		ProviderOrder: []string{"anthropic", "openai"},
	})
	if len(filtered) != 1 || filtered[0].Id != "anthropic-1" {
		t.Fatalf("filtered channels = %#v", filtered)
	}
	if len(policyFiltered) != 1 || policyFiltered[0].ChannelID != "openai-1" || policyFiltered[0].Reason != "provider_scope" {
		t.Fatalf("policy filtered = %#v", policyFiltered)
	}
}

// multipart / 表单请求（如 /v1/images/edits）不能被当作 JSON 路由策略解析，
// 否则 multipart 边界 "------WebKitFormBoundary" 会触发
// "invalid character '-' in numeric literal"。
func TestRequestBodyIsForm(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name        string
		contentType string
		want        bool
	}{
		{"multipart", "multipart/form-data; boundary=----WebKitFormBoundaryabc123", true},
		{"multipart uppercase", "Multipart/Form-Data; boundary=x", true},
		{"urlencoded", "application/x-www-form-urlencoded", true},
		{"json", "application/json", false},
		{"json with charset", "application/json; charset=utf-8", false},
		{"empty", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", strings.NewReader("------WebKitFormBoundaryabc123"))
			if tc.contentType != "" {
				c.Request.Header.Set("Content-Type", tc.contentType)
			}
			if got := requestBodyIsForm(c); got != tc.want {
				t.Fatalf("requestBodyIsForm(%q) = %v, want %v", tc.contentType, got, tc.want)
			}
		})
	}
}

func TestApplyProviderRoutingPolicyOrdersProviders(t *testing.T) {
	channels := []*adminmodel.Channel{
		{Id: "openai-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "openai", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
		{Id: "anthropic-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "anthropic", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
	}
	ordered, _ := applyProviderRoutingPolicy(channels, "shared", routing.ProviderRoutingPolicy{
		ProviderScope: routing.ProviderScope{Mode: routing.ProviderScopeAny},
		ProviderOrder: []string{"anthropic", "openai"},
	})
	if len(ordered) != 2 || ordered[0].Id != "anthropic-1" {
		t.Fatalf("ordered channels = %#v", ordered)
	}
}
