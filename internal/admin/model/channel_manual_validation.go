package model

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

type providerModelValidationRow struct {
	Provider           string `gorm:"column:provider"`
	Model              string `gorm:"column:model"`
	Tags               string `gorm:"column:tags"`
	Status             string `gorm:"column:status"`
	SupportedEndpoints string `gorm:"column:supported_endpoints"`
}

func ValidateManualChannelModelsWithDB(db *gorm.DB, channelID string, rows []ChannelModel) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	normalizedRows := NormalizeChannelModelsPreserveOrder(rows)
	if normalizedChannelID == "" || len(normalizedRows) == 0 {
		return nil
	}
	for _, row := range normalizedRows {
		if !row.Selected {
			continue
		}
		reason, err := ExplainManualChannelModelEnableBlockWithDB(db, normalizedChannelID, row)
		if err != nil {
			return err
		}
		if strings.TrimSpace(reason) != "" {
			return fmt.Errorf("%s", reason)
		}
	}
	return nil
}

func ValidateManualChannelModelChangesWithDB(db *gorm.DB, channelID string, currentRows []ChannelModel, nextRows []ChannelModel) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	normalizedRows := NormalizeChannelModelsPreserveOrder(nextRows)
	if normalizedChannelID == "" || len(normalizedRows) == 0 {
		return nil
	}
	currentByModel := make(map[string]ChannelModel)
	for _, row := range NormalizeChannelModelsPreserveOrder(currentRows) {
		modelName := strings.TrimSpace(row.Model)
		if modelName == "" {
			continue
		}
		currentByModel[modelName] = row
	}
	for _, row := range normalizedRows {
		if !shouldValidateManualChannelModelChange(currentByModel[row.Model], row) {
			continue
		}
		if isRuntimeDisabledChannelModel(currentByModel[row.Model]) {
			ok, err := HasSuccessfulChannelModelTestResultWithDB(db, normalizedChannelID, row.Model)
			if err != nil {
				return err
			}
			if !ok {
				return fmt.Errorf("模型 %s 恢复前需要先测试通过", displayChannelModelName(row))
			}
		}
		reason, err := ExplainManualChannelModelEnableBlockWithDB(db, normalizedChannelID, row)
		if err != nil {
			return err
		}
		if strings.TrimSpace(reason) != "" {
			return fmt.Errorf("%s", reason)
		}
	}
	return nil
}

func shouldValidateManualChannelModelChange(current ChannelModel, next ChannelModel) bool {
	if !next.Selected {
		return false
	}
	if strings.TrimSpace(current.Model) == "" {
		return true
	}
	if !current.Selected {
		return true
	}
	if strings.TrimSpace(current.UpstreamModel) != strings.TrimSpace(next.UpstreamModel) {
		return true
	}
	if strings.TrimSpace(strings.ToLower(current.Provider)) != strings.TrimSpace(strings.ToLower(next.Provider)) {
		return true
	}
	if normalizeExplicitChannelModelType(current.Type) != normalizeExplicitChannelModelType(next.Type) {
		return true
	}
	return false
}

func isRuntimeDisabledChannelModel(row ChannelModel) bool {
	return strings.TrimSpace(row.DisabledBy) == "runtime" ||
		row.DisabledAt > 0 ||
		strings.TrimSpace(row.DisabledReason) != ""
}

func ValidateManualChannelEndpointEnableWithDB(db *gorm.DB, channelID string, row ChannelModel, endpoint string) error {
	reason, err := ExplainManualChannelEndpointEnableBlockWithDB(db, channelID, row, endpoint)
	if err != nil {
		return err
	}
	if strings.TrimSpace(reason) != "" {
		return fmt.Errorf("%s", reason)
	}
	return nil
}

func ExplainManualChannelEndpointEnableBlockWithDB(db *gorm.DB, channelID string, row ChannelModel, endpoint string) (string, error) {
	if db == nil {
		return "", fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	normalizedEndpoint := NormalizeRequestedChannelModelEndpoint(endpoint)
	if normalizedChannelID == "" || normalizedEndpoint == "" {
		return "", nil
	}
	official, err := loadProviderModelValidationRowWithDB(db, row.Provider, row.UpstreamModel, row.Model)
	if err != nil {
		return "", err
	}
	if official == nil {
		return fmt.Sprintf("模型 %s 缺少供应商官方信息，不能启用端点 %s", displayChannelModelName(row), normalizedEndpoint), nil
	}
	if normalizeManualValidationProviderModelStatus(official.Status) != ProviderModelStatusActive {
		return fmt.Sprintf("模型 %s 当前官方状态不是 active，不能启用端点 %s", displayOfficialModelName(row, official.Model), normalizedEndpoint), nil
	}
	officialType := ProviderModelTypeFromTags(splitProviderModelTags(official.Tags))
	if officialType == "" {
		return fmt.Sprintf("模型 %s 缺少供应商官方 tags，不能启用端点 %s", displayOfficialModelName(row, official.Model), normalizedEndpoint), nil
	}
	if ProviderModelTagsContain(splitProviderModelTags(official.Tags), ProviderModelTagNativeAdapterRequired) {
		return fmt.Sprintf("模型 %s 需要 Router 原生渠道适配，当前不能启用端点 %s", displayOfficialModelName(row, official.Model), normalizedEndpoint), nil
	}
	officialEndpoints := NormalizeProviderModelSupportedEndpoints(
		officialType,
		splitProviderModelSupportedEndpoints(official.SupportedEndpoints),
	)
	if len(officialEndpoints) == 0 {
		officialEndpoints = DefaultProviderModelSupportedEndpoints(
			official.Provider,
			officialType,
			official.Model,
		)
	}
	if !containsNormalizedEndpoint(officialEndpoints, normalizedEndpoint) {
		return fmt.Sprintf("模型 %s 的供应商官方端点范围不包含 %s", official.Model, normalizedEndpoint), nil
	}
	channelRow := Channel{}
	if err := db.Select("id", "protocol").Where("id = ?", normalizedChannelID).First(&channelRow).Error; err != nil {
		return "", err
	}
	if !IsChannelModelEndpointRouteSupported(channelRow.GetChannelProtocol(), officialType, normalizedEndpoint) {
		return fmt.Sprintf("Router 当前不支持将协议 %s 的模型端点 %s 路由到该渠道", channelRow.GetProtocol(), normalizedEndpoint), nil
	}
	return "", nil
}

func ExplainManualChannelModelEnableBlockWithDB(db *gorm.DB, channelID string, row ChannelModel) (string, error) {
	official, err := loadProviderModelValidationRowWithDB(db, row.Provider, row.UpstreamModel, row.Model)
	if err != nil {
		return "", err
	}
	if official == nil {
		return fmt.Sprintf("模型 %s 缺少供应商官方信息，不能启用", displayChannelModelName(row)), nil
	}
	if normalizeManualValidationProviderModelStatus(official.Status) != ProviderModelStatusActive {
		return fmt.Sprintf("模型 %s 当前官方状态不是 active，不能启用", displayOfficialModelName(row, official.Model)), nil
	}
	if ProviderModelTagsContain(splitProviderModelTags(official.Tags), ProviderModelTagNativeAdapterRequired) {
		return fmt.Sprintf("模型 %s 需要 Router 原生渠道适配，当前不能启用", displayOfficialModelName(row, official.Model)), nil
	}
	ok, err := HasReturnedChannelModelSyncResultWithDB(db, channelID, row.Model, row.UpstreamModel)
	if err != nil {
		return "", err
	}
	if !ok {
		return fmt.Sprintf("模型 %s 最近一次上游返回未包含，不能启用", displayChannelModelName(row)), nil
	}
	return "", nil
}

// ExplainManualChannelModelEnableBlocksForRows resolves enable-block reasons for a
// page of channel models in bulk: one provider_models lookup for the whole page plus
// the already-loaded sync rows, replacing the 2 queries-per-row that
// ExplainManualChannelModelEnableBlockWithDB issues. Result is keyed by trimmed model.
func ExplainManualChannelModelEnableBlocksForRows(db *gorm.DB, channelID string, rows []ChannelModel, syncRows []ChannelModelSyncResult) (map[string]string, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	result := make(map[string]string, len(rows))
	if len(rows) == 0 {
		return result, nil
	}
	candidateSet := make(map[string]struct{})
	for _, row := range rows {
		for _, candidate := range NormalizeProviderLookupCandidates(row.UpstreamModel, row.Model) {
			candidateSet[candidate] = struct{}{}
		}
	}
	byModel := make(map[string][]providerModelValidationRow)
	if len(candidateSet) > 0 {
		candidates := make([]string, 0, len(candidateSet))
		for candidate := range candidateSet {
			candidates = append(candidates, candidate)
		}
		loaded := make([]providerModelValidationRow, 0)
		if err := db.Model(&ProviderModel{}).
			Select("provider", "model", "tags", "status", "supported_endpoints").
			Where("is_deleted = ?", false).
			Where("model IN ?", candidates).
			Find(&loaded).Error; err != nil {
			return nil, err
		}
		for _, loadedRow := range loaded {
			key := strings.TrimSpace(loadedRow.Model)
			byModel[key] = append(byModel[key], loadedRow)
		}
	}
	for _, row := range rows {
		result[strings.TrimSpace(row.Model)] = explainManualChannelModelEnableBlockFromIndex(row, byModel, syncRows)
	}
	return result, nil
}

func explainManualChannelModelEnableBlockFromIndex(row ChannelModel, byModel map[string][]providerModelValidationRow, syncRows []ChannelModelSyncResult) string {
	official := resolveProviderModelValidationRowFromIndex(row.Provider, byModel, row.UpstreamModel, row.Model)
	if official == nil {
		return fmt.Sprintf("模型 %s 缺少供应商官方信息，不能启用", displayChannelModelName(row))
	}
	if normalizeManualValidationProviderModelStatus(official.Status) != ProviderModelStatusActive {
		return fmt.Sprintf("模型 %s 当前官方状态不是 active，不能启用", displayOfficialModelName(row, official.Model))
	}
	if ProviderModelTagsContain(splitProviderModelTags(official.Tags), ProviderModelTagNativeAdapterRequired) {
		return fmt.Sprintf("模型 %s 需要 Router 原生渠道适配，当前不能启用", displayOfficialModelName(row, official.Model))
	}
	if !ChannelModelSyncReturnedFromRows(syncRows, row.Model, row.UpstreamModel) {
		return fmt.Sprintf("模型 %s 最近一次上游返回未包含，不能启用", displayChannelModelName(row))
	}
	return ""
}

// resolveProviderModelValidationRowFromIndex mirrors loadProviderModelValidationRowWithDB
// against a pre-loaded model→rows index so a page resolves with one query.
func resolveProviderModelValidationRowFromIndex(provider string, byModel map[string][]providerModelValidationRow, candidates ...string) *providerModelValidationRow {
	modelCandidates := NormalizeProviderLookupCandidates(candidates...)
	if len(modelCandidates) == 0 {
		return nil
	}
	if normalizedProvider := NormalizeGroupModelProviderValue(provider); normalizedProvider != "" {
		for _, candidate := range modelCandidates {
			for _, row := range byModel[candidate] {
				if row.Provider == normalizedProvider {
					item := row
					return &item
				}
			}
		}
		return nil
	}
	for _, candidate := range modelCandidates {
		matches := byModel[candidate]
		if len(matches) == 1 {
			item := matches[0]
			return &item
		}
		if len(matches) > 1 {
			return nil
		}
	}
	return nil
}

func loadProviderModelValidationRowWithDB(db *gorm.DB, provider string, candidates ...string) (*providerModelValidationRow, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	modelCandidates := NormalizeProviderLookupCandidates(candidates...)
	if len(modelCandidates) == 0 {
		return nil, nil
	}
	query := db.Model(&ProviderModel{}).
		Select("provider", "model", "tags", "status", "supported_endpoints").
		Where("is_deleted = ?", false)
	if normalizedProvider := NormalizeGroupModelProviderValue(provider); normalizedProvider != "" {
		query = query.Where("provider = ?", normalizedProvider)
	}
	rows := make([]providerModelValidationRow, 0)
	if err := query.Where("model IN ?", modelCandidates).Find(&rows).Error; err != nil {
		return nil, err
	}
	if NormalizeGroupModelProviderValue(provider) == "" {
		for _, candidate := range modelCandidates {
			matchCount := 0
			var matched providerModelValidationRow
			for _, row := range rows {
				if strings.TrimSpace(row.Model) != candidate {
					continue
				}
				matchCount++
				matched = row
			}
			if matchCount == 1 {
				item := matched
				return &item, nil
			}
			if matchCount > 1 {
				return nil, nil
			}
		}
		return nil, nil
	}
	for _, candidate := range modelCandidates {
		for _, row := range rows {
			if strings.TrimSpace(row.Model) == candidate {
				item := row
				return &item, nil
			}
		}
	}
	return nil, nil
}

func normalizeManualValidationProviderModelStatus(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case ProviderModelStatusDeprecated:
		return ProviderModelStatusDeprecated
	default:
		return ProviderModelStatusActive
	}
}

func containsNormalizedEndpoint(values []string, endpoint string) bool {
	normalizedEndpoint := NormalizeRequestedChannelModelEndpoint(endpoint)
	if normalizedEndpoint == "" {
		return false
	}
	for _, item := range values {
		if NormalizeRequestedChannelModelEndpoint(item) == normalizedEndpoint {
			return true
		}
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func displayChannelModelName(row ChannelModel) string {
	return firstNonEmpty(row.UpstreamModel, row.Model)
}

func displayOfficialModelName(row ChannelModel, officialModel string) string {
	return firstNonEmpty(row.UpstreamModel, officialModel, row.Model)
}
