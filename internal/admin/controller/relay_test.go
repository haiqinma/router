package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
	relaymodel "github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/routeobs"
)

func TestRelayNotFoundDisablesCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/group/channel-options", nil)
	c.Request = req

	RelayNotFound(c)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unexpected status code: got %d want %d", recorder.Code, http.StatusNotFound)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store, no-cache, must-revalidate" {
		t.Fatalf("unexpected Cache-Control header: got %q", got)
	}
	if got := recorder.Header().Get("Pragma"); got != "no-cache" {
		t.Fatalf("unexpected Pragma header: got %q", got)
	}
	if got := recorder.Header().Get("Expires"); got != "0" {
		t.Fatalf("unexpected Expires header: got %q", got)
	}
}

func TestShouldRetrySkipsStatefulResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request = req
	c.Set(ctxkey.ResponsesStatefulRequest, true)

	err := &relaymodel.ErrorWithStatusCode{
		StatusCode: http.StatusTooManyRequests,
	}
	if shouldRetry(c, err) {
		t.Fatal("shouldRetry returned true for stateful responses request, want false")
	}
}

func TestBuildRelayFailureLogCapturesRouteFields(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(ctxkey.Id, "user-1")
	c.Set(ctxkey.Group, "default")
	c.Set(ctxkey.ChannelId, "channel-1")
	c.Set(ctxkey.ChannelName, "primary")
	c.Set(ctxkey.OriginalModel, "gpt-5")
	c.Set(ctxkey.TokenName, "prod-token")
	c.Set(ctxkey.RelayFallbackAttempts, `[{"attempt":1,"channel_id":"channel-1"}]`)
	routeobs.SetRouteDecision(c, routeobs.RouteDecision{
		Source:              "automatic",
		GroupID:             "default",
		Model:               "gpt-5",
		Endpoint:            "/v1/chat/completions",
		CandidateChannelIDs: []string{"channel-1", "channel-2"},
		SelectedPriority:    10,
		SelectionMode:       "priority_random",
		InitialChannelID:    "channel-1",
	})

	got := buildRelayFailureLog(c, &relaymodel.ErrorWithStatusCode{
		StatusCode: http.StatusServiceUnavailable,
		Error: relaymodel.Error{
			Message: "upstream unavailable",
			Type:    "one_api_error",
			Code:    "upstream_unavailable",
		},
	}, 2)

	if got == nil {
		t.Fatalf("relay failure log was not built")
	}
	if got.UserId != "user-1" || got.GroupId != "default" || got.ChannelId != "channel-1" {
		t.Fatalf("unexpected identity fields: %+v", got)
	}
	if got.ModelName != "gpt-5" || got.RequestModelName != "gpt-5" || got.ActualModelName != "gpt-5" {
		t.Fatalf("unexpected model fields: %+v", got)
	}
	if got.UpstreamEndpoint != "/v1/chat/completions" {
		t.Fatalf("UpstreamEndpoint=%q, want /v1/chat/completions", got.UpstreamEndpoint)
	}
	if got.FallbackCount != 2 {
		t.Fatalf("FallbackCount=%d, want 2", got.FallbackCount)
	}
	if got.FallbackAttempts == "" {
		t.Fatalf("FallbackAttempts empty")
	}
	var decision routeobs.RouteDecision
	if err := json.Unmarshal([]byte(got.RouteDecision), &decision); err != nil {
		t.Fatalf("unmarshal RouteDecision: %v", err)
	}
	if decision.InitialChannelID != "channel-1" || decision.FinalChannelID != "channel-1" || decision.CandidateCount != 2 {
		t.Fatalf("unexpected RouteDecision: %+v", decision)
	}
	if got.RelayErrorCode != "upstream_unavailable" || got.RelayErrorMessage != "upstream unavailable" {
		t.Fatalf("unexpected relay error fields: %+v", got)
	}
}
