package model

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/random"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ChannelModelEndpointPoliciesTableName = "channel_model_endpoint_policies"

	ChannelEndpointPolicyTemplateCustomRequestPolicy     = "CUSTOM_REQUEST_POLICY"
	ChannelEndpointPolicyTemplateOverrideEndpointBaseURL = "OVERRIDE_ENDPOINT_BASE_URL"
	ChannelEndpointPolicyTemplateImageURLToBase64        = "IMAGE_URL_TO_BASE64"
	ChannelEndpointPolicyActionImageURLToBase64          = "image_url_to_base64"

	// ChannelEndpointPolicySourceAutoDefault 标记新建渠道时自动种下的默认端点策略,
	// 便于与手工配置区分。用户删除后不会被重新种上(仅在渠道创建时种一次)。
	ChannelEndpointPolicySourceAutoDefault = "auto-default"

	channelEndpointPolicyDefaultMediaMaxBytes int64 = 5 * 1024 * 1024
	channelEndpointPolicyDefaultTimeoutMs     int   = 10 * 1000
)

type ChannelModelEndpointPolicy struct {
	ID             string `json:"id" gorm:"primaryKey;type:varchar(64)"`
	ChannelId      string `json:"channel_id" gorm:"type:varchar(64);index"`
	Model          string `json:"model" gorm:"type:varchar(255);index"`
	Endpoint       string `json:"endpoint" gorm:"type:varchar(255);index"`
	Enabled        bool   `json:"enabled" gorm:"not null;index"`
	TemplateKey    string `json:"template_key,omitempty" gorm:"type:varchar(128);default:'';index"`
	Capabilities   string `json:"capabilities,omitempty" gorm:"type:text;default:''"`
	RequestPolicy  string `json:"request_policy,omitempty" gorm:"type:text;default:''"`
	ResponsePolicy string `json:"response_policy,omitempty" gorm:"type:text;default:''"`
	Reason         string `json:"reason,omitempty" gorm:"type:text;default:''"`
	Source         string `json:"source,omitempty" gorm:"type:varchar(32);default:'manual'"`
	LastVerifiedAt int64  `json:"last_verified_at,omitempty" gorm:"bigint"`
	UpdatedAt      int64  `json:"updated_at" gorm:"bigint"`
}

func (ChannelModelEndpointPolicy) TableName() string {
	return ChannelModelEndpointPoliciesTableName
}

type ChannelModelEndpointCapabilities struct {
	InputText        bool `json:"input_text,omitempty"`
	InputImageURL    bool `json:"input_image_url,omitempty"`
	InputImageBase64 bool `json:"input_image_base64,omitempty"`
	InputPDFURL      bool `json:"input_pdf_url,omitempty"`
	InputPDFFile     bool `json:"input_pdf_file,omitempty"`
	Tools            bool `json:"tools,omitempty"`
	Stream           bool `json:"stream,omitempty"`
	NonStream        bool `json:"non_stream,omitempty"`
}

type ChannelModelEndpointRequestPolicy struct {
	Actions []ChannelModelEndpointPolicyAction `json:"actions,omitempty"`
}

type ChannelModelEndpointAccessPolicy struct {
	BaseURL string `json:"base_url,omitempty"`
}

type ChannelModelEndpointPolicyAction struct {
	Type       string                                 `json:"type"`
	InputTypes []string                               `json:"input_types,omitempty"`
	Limits     *ChannelModelEndpointPolicyActionLimit `json:"limits,omitempty"`
	Reason     string                                 `json:"reason,omitempty"`
}

type ChannelModelEndpointPolicyActionLimit struct {
	MaxBytes            int64    `json:"max_bytes,omitempty"`
	TimeoutMs           int      `json:"timeout_ms,omitempty"`
	AllowedContentTypes []string `json:"allowed_content_types,omitempty"`
}

func NormalizeChannelModelEndpointPolicyRow(row *ChannelModelEndpointPolicy) {
	if row == nil {
		return
	}
	row.ID = strings.TrimSpace(row.ID)
	row.ChannelId = strings.TrimSpace(row.ChannelId)
	row.Model = strings.TrimSpace(row.Model)
	row.Endpoint = NormalizeRequestedChannelModelEndpoint(row.Endpoint)
	row.TemplateKey = NormalizeChannelEndpointPolicyTemplateKey(row.TemplateKey)
	row.Capabilities = strings.TrimSpace(row.Capabilities)
	row.RequestPolicy = strings.TrimSpace(row.RequestPolicy)
	row.ResponsePolicy = strings.TrimSpace(row.ResponsePolicy)
	row.Reason = strings.TrimSpace(row.Reason)
	row.Source = strings.TrimSpace(row.Source)
}

func NormalizeChannelEndpointPolicyTemplateKey(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	var builder strings.Builder
	lastUnderscore := false
	for _, r := range strings.ToUpper(trimmed) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if !lastUnderscore {
			builder.WriteRune('_')
			lastUnderscore = true
		}
	}
	normalized := strings.Trim(builder.String(), "_")
	if normalized == "" {
		return ""
	}
	switch normalized {
	case "ANTHROPIC_IMAGE_URL_TO_BASE64":
		return "IMAGE_URL_TO_BASE64"
	case "MANUAL", "CUSTOM", "CUSTOM_POLICY":
		return ChannelEndpointPolicyTemplateCustomRequestPolicy
	}
	return normalized
}

func (row ChannelModelEndpointPolicy) ParseRequestPolicy() (ChannelModelEndpointRequestPolicy, error) {
	policy := ChannelModelEndpointRequestPolicy{}
	if strings.TrimSpace(row.RequestPolicy) == "" {
		return policy, nil
	}
	if err := json.Unmarshal([]byte(row.RequestPolicy), &policy); err != nil {
		return policy, fmt.Errorf("parse request policy: %w", err)
	}
	for i := range policy.Actions {
		policy.Actions[i].Type = strings.TrimSpace(policy.Actions[i].Type)
		policy.Actions[i].InputTypes = normalizeTrimmedValuesPreserveOrder(policy.Actions[i].InputTypes)
		policy.Actions[i].Reason = strings.TrimSpace(policy.Actions[i].Reason)
		if policy.Actions[i].Limits != nil {
			policy.Actions[i].Limits.AllowedContentTypes = normalizeTrimmedValuesPreserveOrder(policy.Actions[i].Limits.AllowedContentTypes)
		}
	}
	return policy, nil
}

func (row ChannelModelEndpointPolicy) ParseAccessPolicy() (ChannelModelEndpointAccessPolicy, error) {
	policy := ChannelModelEndpointAccessPolicy{}
	if strings.TrimSpace(row.RequestPolicy) == "" {
		return policy, nil
	}
	if err := json.Unmarshal([]byte(row.RequestPolicy), &policy); err != nil {
		return policy, fmt.Errorf("parse access policy: %w", err)
	}
	policy.BaseURL = normalizeConfiguredBaseURL(policy.BaseURL)
	return policy, nil
}

func (row ChannelModelEndpointPolicy) ParseCapabilities() (ChannelModelEndpointCapabilities, error) {
	capabilities := ChannelModelEndpointCapabilities{}
	if strings.TrimSpace(row.Capabilities) == "" {
		return capabilities, nil
	}
	if err := json.Unmarshal([]byte(row.Capabilities), &capabilities); err != nil {
		return capabilities, fmt.Errorf("parse capabilities: %w", err)
	}
	return capabilities, nil
}

func ParseEndpointPolicyJSON(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var payload any
	return json.Unmarshal([]byte(trimmed), &payload)
}

func listChannelModelEndpointPoliciesByChannelIDWithDB(dbHandle *gorm.DB, channelID string) ([]ChannelModelEndpointPolicy, error) {
	if dbHandle == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	if normalizedChannelID == "" {
		return []ChannelModelEndpointPolicy{}, nil
	}
	rows := make([]ChannelModelEndpointPolicy, 0)
	if err := dbHandle.
		Where("channel_id = ?", normalizedChannelID).
		Order("model asc, endpoint asc, template_key asc").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		NormalizeChannelModelEndpointPolicyRow(&rows[i])
	}
	return rows, nil
}

func listChannelModelEndpointPoliciesByCandidatesWithDB(dbHandle *gorm.DB, channelID string, endpoint string, modelCandidates []string) ([]ChannelModelEndpointPolicy, error) {
	if dbHandle == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	normalizedEndpoint := NormalizeRequestedChannelModelEndpoint(endpoint)
	normalizedCandidates := normalizeTrimmedValuesPreserveOrder(modelCandidates)
	if normalizedChannelID == "" || normalizedEndpoint == "" || len(normalizedCandidates) == 0 {
		return []ChannelModelEndpointPolicy{}, nil
	}
	rows := make([]ChannelModelEndpointPolicy, 0)
	if err := dbHandle.
		Where("channel_id = ? AND endpoint = ? AND model IN ?", normalizedChannelID, normalizedEndpoint, normalizedCandidates).
		Order("model asc, template_key asc").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		NormalizeChannelModelEndpointPolicyRow(&rows[i])
	}
	return rows, nil
}

func ListChannelModelEndpointPoliciesByChannelIDWithDB(dbHandle *gorm.DB, channelID string, modelName string, endpoint string) ([]ChannelModelEndpointPolicy, error) {
	rows, err := listChannelModelEndpointPoliciesByChannelIDWithDB(dbHandle, channelID)
	if err != nil {
		return nil, err
	}
	normalizedModelName := strings.TrimSpace(modelName)
	normalizedEndpoint := NormalizeRequestedChannelModelEndpoint(endpoint)
	if normalizedModelName == "" && normalizedEndpoint == "" {
		return rows, nil
	}
	result := make([]ChannelModelEndpointPolicy, 0, len(rows))
	for _, row := range rows {
		if normalizedModelName != "" && normalizedModelName != row.Model {
			continue
		}
		if normalizedEndpoint != "" && normalizedEndpoint != row.Endpoint {
			continue
		}
		result = append(result, row)
	}
	return result, nil
}

func DeleteChannelModelEndpointPolicyWithDB(dbHandle *gorm.DB, channelID string, policyID string) error {
	if dbHandle == nil {
		return fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	normalizedPolicyID := strings.TrimSpace(policyID)
	if normalizedChannelID == "" {
		return fmt.Errorf("channel_id 不能为空")
	}
	if normalizedPolicyID == "" {
		return fmt.Errorf("policy_id 不能为空")
	}
	if err := dbHandle.Transaction(func(tx *gorm.DB) error {
		if err := lockChannelRowForUpdateWithDB(tx, normalizedChannelID); err != nil {
			return err
		}
		result := tx.Where("id = ? AND channel_id = ?", normalizedPolicyID, normalizedChannelID).Delete(&ChannelModelEndpointPolicy{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	}); err != nil {
		return err
	}
	if config.MemoryCacheEnabled {
		InitChannelCache()
	}
	return nil
}

func UpsertChannelModelEndpointPolicyWithDB(dbHandle *gorm.DB, row ChannelModelEndpointPolicy) (ChannelModelEndpointPolicy, error) {
	if dbHandle == nil {
		return ChannelModelEndpointPolicy{}, fmt.Errorf("database handle is nil")
	}
	normalized := row
	NormalizeChannelModelEndpointPolicyRow(&normalized)
	if normalized.ChannelId == "" {
		return ChannelModelEndpointPolicy{}, fmt.Errorf("channel_id 不能为空")
	}
	if normalized.Model == "" {
		return ChannelModelEndpointPolicy{}, fmt.Errorf("model 不能为空")
	}
	if normalized.Endpoint == "" {
		return ChannelModelEndpointPolicy{}, fmt.Errorf("endpoint 无效")
	}
	if normalized.TemplateKey == "" {
		return ChannelModelEndpointPolicy{}, fmt.Errorf("template_key 不能为空")
	}
	if _, err := normalized.ParseCapabilities(); err != nil {
		return ChannelModelEndpointPolicy{}, err
	}
	if normalized.TemplateKey == ChannelEndpointPolicyTemplateOverrideEndpointBaseURL {
		accessPolicy, err := normalized.ParseAccessPolicy()
		if err != nil {
			return ChannelModelEndpointPolicy{}, err
		}
		if accessPolicy.BaseURL == "" {
			return ChannelModelEndpointPolicy{}, fmt.Errorf("base_url 不能为空")
		}
	} else {
		if _, err := normalized.ParseRequestPolicy(); err != nil {
			return ChannelModelEndpointPolicy{}, err
		}
	}
	if err := ParseEndpointPolicyJSON(normalized.ResponsePolicy); err != nil {
		return ChannelModelEndpointPolicy{}, fmt.Errorf("parse response policy: %w", err)
	}
	if normalized.ID == "" {
		normalized.ID = strings.ReplaceAll(random.GetUUID(), "-", "")
	}
	if strings.TrimSpace(normalized.Source) == "" {
		normalized.Source = "manual"
	}
	normalized.UpdatedAt = helper.GetTimestamp()
	if err := dbHandle.Transaction(func(tx *gorm.DB) error {
		if err := lockChannelRowForUpdateWithDB(tx, normalized.ChannelId); err != nil {
			return err
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "channel_id"},
				{Name: "model"},
				{Name: "endpoint"},
				{Name: "template_key"},
			},
			DoUpdates: clause.AssignmentColumns([]string{
				"id",
				"enabled",
				"capabilities",
				"request_policy",
				"response_policy",
				"reason",
				"source",
				"last_verified_at",
				"updated_at",
			}),
		}).Create(&normalized).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		return ChannelModelEndpointPolicy{}, err
	}
	if config.MemoryCacheEnabled {
		InitChannelCache()
	}
	return normalized, nil
}

// BuildDefaultImageURLToBase64Policy 构造一条默认启用的「图片 URL 转 Base64」端点策略,
// 其请求策略与前端 IMAGE_URL_TO_BASE64 模板保持一致,可被 relay 侧直接消费。
func BuildDefaultImageURLToBase64Policy(channelID string, modelName string, endpoint string) (ChannelModelEndpointPolicy, error) {
	capabilities, err := json.Marshal(ChannelModelEndpointCapabilities{InputImageBase64: true})
	if err != nil {
		return ChannelModelEndpointPolicy{}, err
	}
	requestPolicy, err := json.Marshal(ChannelModelEndpointRequestPolicy{
		Actions: []ChannelModelEndpointPolicyAction{
			{
				Type: ChannelEndpointPolicyActionImageURLToBase64,
				InputTypes: []string{
					"anthropic.image_url",
					"openai.image_url",
					"openai.input_image",
				},
				Limits: &ChannelModelEndpointPolicyActionLimit{
					MaxBytes:  channelEndpointPolicyDefaultMediaMaxBytes,
					TimeoutMs: channelEndpointPolicyDefaultTimeoutMs,
					AllowedContentTypes: []string{
						"image/png",
						"image/jpeg",
						"image/webp",
						"image/gif",
					},
				},
				Reason: "convert image url to base64 for upstream compatibility",
			},
		},
	})
	if err != nil {
		return ChannelModelEndpointPolicy{}, err
	}
	return ChannelModelEndpointPolicy{
		ChannelId:     strings.TrimSpace(channelID),
		Model:         strings.TrimSpace(modelName),
		Endpoint:      NormalizeRequestedChannelModelEndpoint(endpoint),
		Enabled:       true,
		TemplateKey:   ChannelEndpointPolicyTemplateImageURLToBase64,
		Capabilities:  string(capabilities),
		RequestPolicy: string(requestPolicy),
		Reason:        "默认转换：上游可能仅稳定支持 base64 图片输入，由 Router 侧统一转换",
		Source:        ChannelEndpointPolicySourceAutoDefault,
	}, nil
}

// SeedChannelDefaultEndpointPoliciesWithDB 在新建渠道时为其所有已声明端点种下默认的
// 「图片 URL 转 Base64」策略。使用 OnConflict DoNothing 保证幂等且绝不覆盖已有策略,
// 因此用户后续删除某条默认策略不会被重新种上。空端点渠道不产生任何行。
func SeedChannelDefaultEndpointPoliciesWithDB(db *gorm.DB, channelID string) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	normalizedChannelID := strings.TrimSpace(channelID)
	if normalizedChannelID == "" {
		return nil
	}
	endpointRows, err := listChannelModelEndpointRowsByChannelIDWithDB(db, normalizedChannelID)
	if err != nil {
		return err
	}
	if len(endpointRows) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(endpointRows))
	payloads := make([]ChannelModelEndpointPolicy, 0, len(endpointRows))
	for _, endpointRow := range endpointRows {
		modelName := strings.TrimSpace(endpointRow.Model)
		endpoint := NormalizeRequestedChannelModelEndpoint(endpointRow.Endpoint)
		if modelName == "" || endpoint == "" {
			continue
		}
		key := modelName + "\x00" + endpoint
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		row, buildErr := BuildDefaultImageURLToBase64Policy(normalizedChannelID, modelName, endpoint)
		if buildErr != nil {
			return buildErr
		}
		NormalizeChannelModelEndpointPolicyRow(&row)
		row.ID = strings.ReplaceAll(random.GetUUID(), "-", "")
		row.UpdatedAt = helper.GetTimestamp()
		payloads = append(payloads, row)
	}
	if len(payloads) == 0 {
		return nil
	}
	if err := db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "channel_id"},
			{Name: "model"},
			{Name: "endpoint"},
			{Name: "template_key"},
		},
		DoNothing: true,
	}).Create(&payloads).Error; err != nil {
		return err
	}
	if config.MemoryCacheEnabled {
		InitChannelCache()
	}
	return nil
}
