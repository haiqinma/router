package openai

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/relay/responsestate"
)

func rememberResponsesRoute(c *gin.Context, responseID string) {
	if c == nil {
		return
	}
	responsestate.StoreRoute(responseID, c.GetString(ctxkey.ChannelId))
}

func rememberResponsesRoutes(c *gin.Context, raw []byte) {
	if c == nil {
		return
	}
	responsestate.StoreRoutes(responsestate.ExtractResponseItemIDs(raw), c.GetString(ctxkey.ChannelId))
	responseID := responsestate.ExtractResponseID(raw)
	if responseID == "" {
		responseID = extractResponsesStreamResponseID(raw)
	}
	rememberResponsesRoute(c, responseID)
}

func rememberResponsesRouteFromBody(c *gin.Context, raw []byte) {
	responsestate.StoreRoutes(responsestate.ExtractResponseItemIDs(raw), c.GetString(ctxkey.ChannelId))
	rememberResponsesRoute(c, responsestate.ExtractResponseID(raw))
}

func extractResponsesStreamResponseID(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	payload := map[string]any{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	if responseID := strings.TrimSpace(asString(payload["id"])); responseID != "" {
		return responseID
	}
	if response, ok := payload["response"].(map[string]any); ok {
		return strings.TrimSpace(asString(response["id"]))
	}
	return ""
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}
