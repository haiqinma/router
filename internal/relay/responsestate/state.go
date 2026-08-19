package responsestate

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/logger"
)

const (
	defaultResponseRouteTTL = 6 * time.Hour
	responseRouteKeyPrefix  = "responses_route:"
)

type routeEntry struct {
	ChannelID string
	ExpireAt  time.Time
}

var (
	routeMu       sync.Mutex
	routeStore    = make(map[string]routeEntry)
	routeTTL      = defaultResponseRouteTTL
	routeNow      = time.Now
	lastPrunedAt  time.Time
	pruneInterval = 10 * time.Minute

	redisRouteEnabledFunc = func() bool {
		return common.RedisEnabled && common.RDB != nil
	}
	redisSetRouteFunc = common.RedisSet
	redisGetRouteFunc = common.RedisGet
)

type RequestState struct {
	PreviousResponseID string
	HasToolOutput      bool
	ItemIDs            []string
}

func AnalyzeRequestBody(raw []byte) RequestState {
	state := RequestState{}
	if len(raw) == 0 {
		return state
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return state
	}
	if root, ok := payload.(map[string]any); ok {
		state.PreviousResponseID = strings.TrimSpace(asString(root["previous_response_id"]))
	}
	state.ItemIDs = extractInputItemIDs(payload)
	state.HasToolOutput = containsFunctionCallOutput(payload)
	return state
}

func IsStatefulRequestBody(raw []byte) bool {
	state := AnalyzeRequestBody(raw)
	return state.PreviousResponseID != "" || state.HasToolOutput
}

func ExtractResponseID(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	payload := map[string]any{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(asString(payload["id"]))
}

func ExtractResponseItemIDs(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil
	}
	return extractResponseItemIDs(payload)
}

func extractInputItemIDs(value any) []string {
	return extractIDsFromInput(value)
}

func extractIDsFromInput(value any) []string {
	result := make([]string, 0)
	var walk func(any)
	walk = func(current any) {
		switch typed := current.(type) {
		case map[string]any:
			if id := strings.TrimSpace(asString(typed["id"])); id != "" {
				if itemType := strings.TrimSpace(asString(typed["type"])); itemType != "" && itemType != "response" {
					result = appendUnique(result, id)
				}
			}
			for key, child := range typed {
				if key != "id" {
					walk(child)
				}
			}
		case []any:
			for _, child := range typed {
				walk(child)
			}
		}
	}
	walk(value)
	return result
}

func extractResponseItemIDs(value any) []string {
	result := make([]string, 0)
	var walk func(any)
	walk = func(current any) {
		switch typed := current.(type) {
		case map[string]any:
			if id := strings.TrimSpace(asString(typed["id"])); id != "" {
				if itemType := strings.TrimSpace(asString(typed["type"])); itemType != "" && itemType != "response" {
					result = appendUnique(result, id)
				}
			}
			for key, child := range typed {
				if key != "id" {
					walk(child)
				}
			}
		case []any:
			for _, child := range typed {
				walk(child)
			}
		}
	}
	walk(value)
	return result
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func StoreRoute(responseID string, channelID string) {
	normalizedResponseID := strings.TrimSpace(responseID)
	normalizedChannelID := strings.TrimSpace(channelID)
	if normalizedResponseID == "" || normalizedChannelID == "" {
		return
	}
	if redisRouteEnabledFunc() {
		if err := redisSetRouteFunc(responseRouteKey(normalizedResponseID), normalizedChannelID, routeTTL); err != nil {
			logger.SysError("Redis set responses route error: " + err.Error())
		}
		return
	}
	now := routeNow()
	routeMu.Lock()
	defer routeMu.Unlock()
	if now.Sub(lastPrunedAt) >= pruneInterval {
		pruneExpiredLocked(now)
		lastPrunedAt = now
	}
	routeStore[normalizedResponseID] = routeEntry{
		ChannelID: normalizedChannelID,
		ExpireAt:  now.Add(routeTTL),
	}
}

func StoreRoutes(responseIDs []string, channelID string) {
	for _, responseID := range responseIDs {
		StoreRoute(responseID, channelID)
	}
}

func LookupRoute(responseID string) (string, bool) {
	normalizedResponseID := strings.TrimSpace(responseID)
	if normalizedResponseID == "" {
		return "", false
	}
	if redisRouteEnabledFunc() {
		channelID, err := redisGetRouteFunc(responseRouteKey(normalizedResponseID))
		if err != nil {
			if err != redis.Nil {
				logger.SysError("Redis get responses route error: " + err.Error())
			}
			return "", false
		}
		channelID = strings.TrimSpace(channelID)
		if channelID == "" {
			return "", false
		}
		return channelID, true
	}
	return lookupMemoryRoute(normalizedResponseID)
}

func LookupRoutes(responseIDs []string) (string, bool, bool) {
	selected := ""
	for _, responseID := range responseIDs {
		channelID, ok := LookupRoute(responseID)
		if !ok {
			continue
		}
		if selected != "" && selected != channelID {
			return "", false, true
		}
		selected = channelID
	}
	return selected, selected != "", false
}

func lookupMemoryRoute(responseID string) (string, bool) {
	now := routeNow()
	routeMu.Lock()
	defer routeMu.Unlock()
	entry, ok := routeStore[responseID]
	if !ok {
		return "", false
	}
	if !entry.ExpireAt.IsZero() && now.After(entry.ExpireAt) {
		delete(routeStore, responseID)
		return "", false
	}
	return entry.ChannelID, true
}

func pruneExpiredLocked(now time.Time) {
	for responseID, entry := range routeStore {
		if !entry.ExpireAt.IsZero() && now.After(entry.ExpireAt) {
			delete(routeStore, responseID)
		}
	}
}

func ResetForTest() {
	routeMu.Lock()
	defer routeMu.Unlock()
	routeStore = make(map[string]routeEntry)
	routeTTL = defaultResponseRouteTTL
	routeNow = time.Now
	lastPrunedAt = time.Time{}
	redisRouteEnabledFunc = func() bool {
		return common.RedisEnabled && common.RDB != nil
	}
	redisSetRouteFunc = common.RedisSet
	redisGetRouteFunc = common.RedisGet
}

func responseRouteKey(responseID string) string {
	return responseRouteKeyPrefix + responseID
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func containsFunctionCallOutput(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		if strings.EqualFold(strings.TrimSpace(asString(typed["type"])), "function_call_output") {
			return true
		}
		for _, child := range typed {
			if containsFunctionCallOutput(child) {
				return true
			}
		}
	case []any:
		for _, child := range typed {
			if containsFunctionCallOutput(child) {
				return true
			}
		}
	}
	return false
}
