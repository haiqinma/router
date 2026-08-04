package routeobs

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
)

// RouteDecision is the stable explanation of the initial channel selection.
// The final channel is filled when the request is logged, after any retries.
type RouteDecision struct {
	Source              string              `json:"source"`
	GroupID             string              `json:"group_id"`
	Model               string              `json:"model"`
	Endpoint            string              `json:"endpoint"`
	CandidateChannelIDs []string            `json:"candidate_channel_ids"`
	CandidateCount      int                 `json:"candidate_count"`
	FilteredCandidates  []FilteredCandidate `json:"filtered_candidates,omitempty"`
	SelectedPriority    int64               `json:"selected_priority"`
	SelectionMode       string              `json:"selection_mode"`
	InitialChannelID    string              `json:"initial_channel_id"`
	InitialChannelName  string              `json:"initial_channel_name,omitempty"`
	FinalChannelID      string              `json:"final_channel_id,omitempty"`
	FinalChannelName    string              `json:"final_channel_name,omitempty"`
}

type FilteredCandidate struct {
	ChannelID string `json:"channel_id"`
	Reason    string `json:"reason"`
}

func SetRouteDecision(c *gin.Context, decision RouteDecision) {
	if c == nil {
		return
	}
	decision.Source = strings.TrimSpace(decision.Source)
	decision.GroupID = strings.TrimSpace(decision.GroupID)
	decision.Model = strings.TrimSpace(decision.Model)
	decision.Endpoint = strings.TrimSpace(decision.Endpoint)
	decision.SelectionMode = strings.TrimSpace(decision.SelectionMode)
	decision.InitialChannelID = strings.TrimSpace(decision.InitialChannelID)
	decision.InitialChannelName = strings.TrimSpace(decision.InitialChannelName)
	decision.CandidateChannelIDs = normalizeChannelIDs(decision.CandidateChannelIDs)
	decision.CandidateCount = len(decision.CandidateChannelIDs)
	decision.FilteredCandidates = normalizeFilteredCandidates(decision.FilteredCandidates)
	if decision.InitialChannelID == "" {
		return
	}
	payload, err := json.Marshal(decision)
	if err == nil {
		c.Set(ctxkey.RelayRouteDecision, string(payload))
	}
}

func normalizeFilteredCandidates(values []FilteredCandidate) []FilteredCandidate {
	result := make([]FilteredCandidate, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value.ChannelID = strings.TrimSpace(value.ChannelID)
		value.Reason = strings.TrimSpace(value.Reason)
		if value.ChannelID == "" || value.Reason == "" {
			continue
		}
		key := value.ChannelID + "\x00" + value.Reason
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, value)
	}
	return result
}

func FinalizedRouteDecisionJSON(c *gin.Context) string {
	if c == nil {
		return ""
	}
	raw := strings.TrimSpace(c.GetString(ctxkey.RelayRouteDecision))
	if raw == "" {
		return ""
	}
	var decision RouteDecision
	if err := json.Unmarshal([]byte(raw), &decision); err != nil {
		return ""
	}
	decision.FinalChannelID = strings.TrimSpace(c.GetString(ctxkey.ChannelId))
	decision.FinalChannelName = strings.TrimSpace(c.GetString(ctxkey.ChannelName))
	payload, err := json.Marshal(decision)
	if err != nil {
		return ""
	}
	return string(payload)
}

func normalizeChannelIDs(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
