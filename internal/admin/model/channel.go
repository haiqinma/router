package model

import (
	"encoding/json"
	"strings"

	relaychannel "github.com/yeying-community/router/internal/relay/channel"
)

const (
	ChannelStatusUnknown          = 0
	ChannelStatusEnabled          = 1 // don't use 0, 0 is the default value!
	ChannelStatusManuallyDisabled = 2 // also don't use 0
	ChannelStatusAutoDisabled     = 3
	ChannelStatusCreating         = 4
)

type Channel struct {
	Id                     string                    `json:"id" gorm:"type:char(36);primaryKey"`
	Protocol               string                    `json:"protocol" gorm:"type:varchar(64);default:'openai';index"`
	Key                    string                    `json:"key" gorm:"type:text"`
	Status                 int                       `json:"status" gorm:"default:1"`
	Name                   string                    `json:"name" gorm:"index"`
	Weight                 *uint                     `json:"weight" gorm:"default:0"`
	CreatedTime            int64                     `json:"created_time" gorm:"bigint"`
	TestTime               int64                     `json:"test_time" gorm:"bigint"`
	ResponseTime           int                       `json:"response_time"`
	BaseURL                *string                   `json:"base_url" gorm:"column:base_url;default:''"`
	Other                  *string                   `json:"other"`
	Balance                float64                   `json:"balance"`
	BalanceUpdatedTime     int64                     `json:"balance_updated_time" gorm:"bigint"`
	Models                 string                    `json:"models" gorm:"-"`
	AvailableModels        []string                  `json:"available_models,omitempty" gorm:"-"`
	ModelConfigs           []ChannelModel            `json:"model_configs,omitempty" gorm:"-"`
	UsedQuota              int64                     `json:"used_quota" gorm:"bigint;default:0"`
	Priority               *int64                    `json:"priority" gorm:"bigint;default:0"`
	Config                 string                    `json:"config"`
	SystemPrompt           *string                   `json:"system_prompt" gorm:"type:text"`
	TestModel              string                    `json:"test_model" gorm:"type:varchar(255);default:''"`
	CapabilityResults      []ChannelCapabilityResult `json:"capability_results,omitempty" gorm:"-"`
	CapabilityLastTestedAt int64                     `json:"capability_last_tested_at,omitempty" gorm:"-"`
	KeySet                 bool                      `json:"key_set" gorm:"-"`
	ModelsProvided         bool                      `json:"-" gorm:"-"`
	ModelConfigsProvided   bool                      `json:"-" gorm:"-"`
	CapabilityResultsStale bool                      `json:"-" gorm:"-"`
}

type ChannelConfig struct {
	Region            string `json:"region,omitempty"`
	SK                string `json:"sk,omitempty"`
	AK                string `json:"ak,omitempty"`
	UserID            string `json:"user_id,omitempty"`
	APIVersion        string `json:"api_version,omitempty"`
	LibraryID         string `json:"library_id,omitempty"`
	Plugin            string `json:"plugin,omitempty"`
	VertexAIProjectID string `json:"vertex_ai_project_id,omitempty"`
	VertexAIADC       string `json:"vertex_ai_adc,omitempty"`
}

func (channel *Channel) NormalizeProtocol() {
	if channel == nil {
		return
	}
	protocol := relaychannel.NormalizeProtocolName(channel.Protocol)
	if protocol == "" {
		protocol = "openai"
	}
	channel.Protocol = protocol
}

func (channel *Channel) GetProtocol() string {
	if channel == nil {
		return "openai"
	}
	protocol := relaychannel.NormalizeProtocolName(channel.Protocol)
	if protocol != "" {
		return protocol
	}
	return "openai"
}

func (channel *Channel) GetChannelProtocol() int {
	if channel == nil {
		return relaychannel.OpenAI
	}
	return relaychannel.TypeByProtocol(channel.GetProtocol())
}

func GetAllChannels(startIdx int, num int, scope string) ([]*Channel, error) {
	return mustChannelRepo().GetAllChannels(startIdx, num, scope)
}

func SearchChannels(keyword string) ([]*Channel, error) {
	return mustChannelRepo().SearchChannels(keyword)
}

func GetChannelById(id string, selectAll bool) (*Channel, error) {
	return mustChannelRepo().GetChannelById(id, selectAll)
}

func BatchInsertChannels(channels []Channel) error {
	return mustChannelRepo().BatchInsertChannels(channels)
}

func (channel *Channel) GetPriority() int64 {
	if channel.Priority == nil {
		return 0
	}
	return *channel.Priority
}

func (channel *Channel) GetBaseURL() string {
	if channel.BaseURL == nil {
		return ""
	}
	return strings.TrimSpace(*channel.BaseURL)
}

func (channel *Channel) GetModelMapping() map[string]string {
	selected := channel.selectedModelConfigs()
	if len(selected) == 0 {
		return nil
	}
	modelMapping := make(map[string]string, len(selected))
	for _, row := range selected {
		if row.Model == "" || row.UpstreamModel == "" || row.UpstreamModel == row.Model {
			continue
		}
		modelMapping[row.Model] = row.UpstreamModel
	}
	if len(modelMapping) == 0 {
		return nil
	}
	return modelMapping
}

func (channel *Channel) GetModelConfigs() []ChannelModel {
	if channel == nil {
		return nil
	}
	if len(channel.ModelConfigs) > 0 {
		rows := NormalizeChannelModelConfigsPreserveOrder(channel.ModelConfigs)
		for i := range rows {
			completeChannelModelRowDefaults(&rows[i], channel.GetChannelProtocol())
		}
		return rows
	}
	selected := ParseChannelModelCSV(channel.Models)
	if len(selected) == 0 {
		return []ChannelModel{}
	}
	return BuildDefaultChannelModelConfigsWithProtocol(selected, channel.GetChannelProtocol())
}

func (channel *Channel) SelectedModelIDs() []string {
	if channel == nil {
		return nil
	}
	if len(channel.ModelConfigs) > 0 {
		modelIDs := make([]string, 0, len(channel.ModelConfigs))
		for _, row := range channel.GetModelConfigs() {
			if !row.Selected {
				continue
			}
			modelIDs = append(modelIDs, row.Model)
		}
		return NormalizeChannelModelIDsPreserveOrder(modelIDs)
	}
	return ParseChannelModelCSV(channel.Models)
}

func (channel *Channel) SetSelectedModelIDs(modelIDs []string) {
	if channel == nil {
		return
	}
	normalized := NormalizeChannelModelIDsPreserveOrder(modelIDs)
	channel.Models = JoinChannelModelCSV(normalized)
	if len(channel.ModelConfigs) == 0 {
		return
	}

	selectedSet := buildChannelModelSelectionSet(normalized)
	existing := NormalizeChannelModelConfigsPreserveOrder(channel.ModelConfigs)
	next := make([]ChannelModel, 0, len(existing)+len(normalized))
	seen := make(map[string]struct{}, len(existing)+len(normalized))
	for _, row := range existing {
		if row.Model == "" {
			continue
		}
		row.Selected = false
		if _, ok := selectedSet[row.Model]; ok {
			row.Selected = true
		}
		completeChannelModelRowDefaults(&row, channel.GetChannelProtocol())
		next = append(next, row)
		seen[row.Model] = struct{}{}
	}
	for _, modelID := range normalized {
		if _, ok := seen[modelID]; ok {
			continue
		}
		rows := BuildDefaultChannelModelConfigsWithProtocol([]string{modelID}, channel.GetChannelProtocol())
		if len(rows) == 0 {
			continue
		}
		next = append(next, rows[0])
	}
	channel.SetModelConfigs(next)
}

func (channel *Channel) SetAvailableModelIDs(modelIDs []string) {
	if channel == nil {
		return
	}
	channel.AvailableModels = NormalizeChannelModelIDsPreserveOrder(modelIDs)
}

func (channel *Channel) SetModelConfigs(configs []ChannelModel) {
	if channel == nil {
		return
	}
	normalized := NormalizeChannelModelConfigsPreserveOrder(configs)
	for i := range normalized {
		completeChannelModelRowDefaults(&normalized[i], channel.GetChannelProtocol())
	}
	channel.ModelConfigs = normalized

	available := make([]string, 0, len(normalized))
	selected := make([]string, 0, len(normalized))
	for _, row := range normalized {
		available = append(available, row.Model)
		if !row.Selected {
			continue
		}
		selected = append(selected, row.Model)
	}
	channel.SetAvailableModelIDs(available)
	channel.Models = JoinChannelModelCSV(selected)
}

func (channel *Channel) NormalizeModelConfigState() {
	if channel == nil {
		return
	}
	if channel.ModelConfigsProvided {
		channel.SetModelConfigs(channel.ModelConfigs)
		return
	}
	if len(channel.ModelConfigs) > 0 {
		channel.SetModelConfigs(channel.ModelConfigs)
		return
	}
	if channel.ModelsProvided {
		channel.Models = JoinChannelModelCSV(ParseChannelModelCSV(channel.Models))
	}
}

func (channel *Channel) SetCapabilityResults(results []ChannelCapabilityResult) {
	if channel == nil {
		return
	}
	channel.CapabilityResults = NormalizeChannelCapabilityResultRows(results)
	channel.CapabilityLastTestedAt = calcChannelCapabilityLastTestedAt(channel.CapabilityResults)
}

func (channel *Channel) Insert() error {
	return mustChannelRepo().Insert(channel)
}

func (channel *Channel) Update() error {
	return mustChannelRepo().Update(channel)
}

func (channel *Channel) UpdateResponseTime(responseTime int64) {
	mustChannelRepo().UpdateResponseTime(channel, responseTime)
}

func (channel *Channel) UpdateBalance(balance float64) {
	mustChannelRepo().UpdateBalance(channel, balance)
}

func (channel *Channel) Delete() error {
	return mustChannelRepo().Delete(channel)
}

func (channel *Channel) LoadConfig() (ChannelConfig, error) {
	var cfg ChannelConfig
	if channel.Config == "" {
		return cfg, nil
	}
	err := json.Unmarshal([]byte(channel.Config), &cfg)
	if err != nil {
		return cfg, err
	}
	return cfg, nil
}

func UpdateChannelStatusById(id string, status int) {
	mustChannelRepo().UpdateChannelStatusById(id, status)
}

func UpdateChannelUsedQuota(id string, quota int64) {
	mustChannelRepo().UpdateChannelUsedQuota(id, quota)
}

func updateChannelUsedQuota(id string, quota int64) {
	mustChannelRepo().UpdateChannelUsedQuotaDirect(id, quota)
}

func DeleteChannelByStatus(status int64) (int64, error) {
	return mustChannelRepo().DeleteChannelByStatus(status)
}

func DeleteDisabledChannel() (int64, error) {
	return mustChannelRepo().DeleteDisabledChannel()
}

func UpdateChannelTestModel(id string, testModel string) error {
	return mustChannelRepo().UpdateChannelTestModelByID(id, testModel)
}

func (channel *Channel) selectedModelConfigs() []ChannelModel {
	configs := channel.GetModelConfigs()
	if len(configs) == 0 {
		return nil
	}
	selected := make([]ChannelModel, 0, len(configs))
	for _, row := range configs {
		if !row.Selected {
			continue
		}
		selected = append(selected, row)
	}
	if len(selected) == 0 {
		return nil
	}
	return selected
}

func (channel *Channel) GetSelectedModelConfigs() []ChannelModel {
	if channel == nil {
		return nil
	}
	return channel.selectedModelConfigs()
}
