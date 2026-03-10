package model

import (
	"sort"
	"strings"

	"gorm.io/gorm"
)

type ChannelAbility struct {
	ChannelId string `json:"channel_id,omitempty"`
	Type      string `json:"type"`
	Endpoint  string `json:"endpoint"`
	Model     string `json:"model,omitempty"`
	LatencyMs int64  `json:"latency_ms,omitempty"`
	SortOrder int64  `json:"sort_order,omitempty"`
	UpdatedAt int64  `json:"updated_at,omitempty"`
}

func NormalizeChannelAbilityRows(rows []ChannelAbility) []ChannelAbility {
	if len(rows) == 0 {
		return []ChannelAbility{}
	}
	result := make([]ChannelAbility, 0, len(rows))
	indexByKey := make(map[string]int, len(rows))
	for idx, row := range rows {
		normalized := ChannelAbility{
			ChannelId: strings.TrimSpace(row.ChannelId),
			Type:      normalizeModelType(row.Type, row.Model),
			Endpoint:  NormalizeChannelModelEndpoint(row.Type, row.Endpoint),
			Model:     strings.TrimSpace(row.Model),
			LatencyMs: row.LatencyMs,
			SortOrder: row.SortOrder,
			UpdatedAt: row.UpdatedAt,
		}
		if normalized.ChannelId == "" || normalized.Type == "" || normalized.Endpoint == "" {
			continue
		}
		if normalized.SortOrder == 0 {
			normalized.SortOrder = int64(idx + 1)
		}
		key := normalized.ChannelId + "::" + normalized.Type + "::" + normalized.Endpoint
		if existingIdx, ok := indexByKey[key]; ok {
			existing := result[existingIdx]
			if existing.LatencyMs == 0 || (normalized.LatencyMs > 0 && normalized.LatencyMs < existing.LatencyMs) {
				result[existingIdx] = normalized
			}
			continue
		}
		indexByKey[key] = len(result)
		result = append(result, normalized)
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].SortOrder != result[j].SortOrder {
			return result[i].SortOrder < result[j].SortOrder
		}
		if result[i].Type != result[j].Type {
			return result[i].Type < result[j].Type
		}
		return result[i].Endpoint < result[j].Endpoint
	})
	return result
}

func BuildChannelAbilitiesFromModelConfigs(channelID string, rows []ChannelModel) []ChannelAbility {
	normalizedChannelID := strings.TrimSpace(channelID)
	if normalizedChannelID == "" {
		return []ChannelAbility{}
	}
	normalizedRows := NormalizeChannelModelConfigsPreserveOrder(rows)
	if len(normalizedRows) == 0 {
		return []ChannelAbility{}
	}
	abilities := make([]ChannelAbility, 0, len(normalizedRows))
	sortOrder := int64(1)
	for _, row := range normalizedRows {
		if !row.Selected {
			continue
		}
		modelID := strings.TrimSpace(row.Model)
		if modelID == "" {
			continue
		}
		abilities = append(abilities, ChannelAbility{
			ChannelId: normalizedChannelID,
			Type:      normalizeModelType(row.Type, modelID),
			Endpoint:  NormalizeChannelModelEndpoint(row.Type, row.Endpoint),
			Model:     modelID,
			LatencyMs: row.LatencyMs,
			SortOrder: sortOrder,
			UpdatedAt: row.TestedAt,
		})
		sortOrder++
	}
	return NormalizeChannelAbilityRows(abilities)
}

func HydrateChannelWithAbilities(_ *gorm.DB, channel *Channel) error {
	if channel == nil {
		return nil
	}
	channel.SetChannelAbilities(BuildChannelAbilitiesFromModelConfigs(channel.Id, channel.GetModelConfigs()))
	return nil
}

func HydrateChannelsWithAbilities(_ *gorm.DB, channels []*Channel) error {
	for _, channel := range channels {
		if channel == nil {
			continue
		}
		channel.SetChannelAbilities(BuildChannelAbilitiesFromModelConfigs(channel.Id, channel.GetModelConfigs()))
	}
	return nil
}
