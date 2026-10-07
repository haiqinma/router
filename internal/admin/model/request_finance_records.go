package model

import (
	"fmt"
	"strings"
	"sync"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type FinanceConsistencySummary struct {
	WindowStartAt        int64 `json:"window_start_at"`
	WindowEndAt          int64 `json:"window_end_at"`
	ConsumeLogs          int64 `json:"consume_logs"`
	MissingSettlements   int64 `json:"missing_settlements"`
	MissingAttributions  int64 `json:"missing_attributions"`
	SettlementMismatches int64 `json:"settlement_mismatches"`
	Consistent           bool  `json:"consistent"`
}

// FinanceConsistencyIssue identifies one request-level discrepancy. A log may
// produce more than one issue when multiple normalized records are absent.
type FinanceConsistencyIssue struct {
	IssueType        string `json:"issue_type"`
	RequestLogID     string `json:"request_log_id"`
	CreatedAt        int64  `json:"created_at"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
}

var financeColumnsPendingRemoval = []string{
	"billing_input_quantity", "billing_output_quantity", "billing_cache_read_quantity", "billing_cache_write_quantity",
	"billing_input_amount", "billing_output_amount", "billing_cache_read_amount", "billing_cache_write_amount",
	"billing_amount", "billing_charge_amount", "billing_official_anchor_amount", "billing_official_anchor_currency",
	"billing_official_anchor_base_amount", "billing_sell_base_amount", "billing_cost_floor_base_amount", "billing_selected_sell_base_amount",
	"billing_pricing_decision_reason", "billing_cost_floor_triggered", "billing_procurement_cost_base_amount", "billing_procurement_cost_source",
	"billing_procurement_cost_confidence", "billing_procurement_cost_status", "billing_gross_profit_base_amount", "billing_gross_margin",
	"billing_cost_rule_version", "billing_procurement_retry_count", "billing_procurement_last_retry_at", "billing_procurement_last_error",
}

// Pre-normalization finance columns no longer represented by Log or runtime
// queries. Keep active image-tool billing columns out of this list.
var obsoleteEventLogFinanceColumns = []string{
	"billing_gross_profit_cny",
	"billing_procurement_cost_cny",
	"billing_sell_amount_cny",
	"billing_official_anchor_amount_cny",
	"billing_image_tool_yyc_amount",
	"billing_yyc_amount",
	"billing_yyc_rate",
}

const (
	BillingSettlementsTableName      = "billing_settlements"
	ProcurementAttributionsTableName = "procurement_attributions"
)

// BillingSettlement owns the immutable pricing and usage snapshot for one
// request. RequestLogID is the stable migration key from event_logs.
type BillingSettlement struct {
	RequestLogID             string  `gorm:"type:char(36);primaryKey"`
	UserID                   string  `gorm:"type:char(36);index"`
	CreatedAt                int64   `gorm:"bigint;index"`
	Source                   string  `gorm:"type:varchar(32);index;default:''"`
	SourceID                 string  `gorm:"type:char(36);index;default:''"`
	SourceName               string  `gorm:"type:varchar(255);default:''"`
	SourceDetail             string  `gorm:"type:varchar(255);default:''"`
	PriceUnit                string  `gorm:"type:varchar(64);default:''"`
	Currency                 string  `gorm:"type:varchar(16);default:''"`
	PricingSource            string  `gorm:"type:varchar(64);default:''"`
	UsageSource              string  `gorm:"type:varchar(64);default:''"`
	EstimateSource           string  `gorm:"type:varchar(64);default:''"`
	EstimateEstimator        string  `gorm:"type:varchar(64);default:''"`
	EstimatePrecision        string  `gorm:"type:varchar(32);default:''"`
	SettlementMode           string  `gorm:"type:varchar(64);default:''"`
	SettlementTruthMode      string  `gorm:"type:varchar(64);default:''"`
	EffectiveRatio           float64 `gorm:"type:double precision;default:0"`
	GroupChannelRatio        float64 `gorm:"type:double precision;default:0"`
	ModelChannelRatio        float64 `gorm:"type:double precision;default:0"`
	ChargeRate               float64 `gorm:"type:double precision;default:0"`
	InputQuantity            float64 `gorm:"type:double precision;default:0"`
	OutputQuantity           float64 `gorm:"type:double precision;default:0"`
	CacheReadQuantity        float64 `gorm:"type:double precision;default:0"`
	CacheWriteQuantity       float64 `gorm:"type:double precision;default:0"`
	InputAmount              float64 `gorm:"type:double precision;default:0"`
	OutputAmount             float64 `gorm:"type:double precision;default:0"`
	CacheReadAmount          float64 `gorm:"type:double precision;default:0"`
	CacheWriteAmount         float64 `gorm:"type:double precision;default:0"`
	Amount                   float64 `gorm:"type:double precision;default:0"`
	ChargeAmount             int64   `gorm:"bigint;default:0"`
	OfficialAnchorAmount     float64 `gorm:"type:double precision;default:0"`
	OfficialAnchorCurrency   string  `gorm:"type:varchar(16);default:''"`
	OfficialAnchorBaseAmount float64 `gorm:"type:double precision;default:0"`
	SellBaseAmount           float64 `gorm:"type:double precision;default:0"`
	CostFloorBaseAmount      float64 `gorm:"type:double precision;default:0"`
	SelectedSellBaseAmount   float64 `gorm:"type:double precision;default:0"`
	PricingDecisionReason    string  `gorm:"type:varchar(64);default:''"`
	CostFloorTriggered       bool    `gorm:"default:false"`
	PricingRuleVersion       string  `gorm:"type:varchar(64);default:''"`
	Decision                 string  `gorm:"type:text"`
	EstimatedPromptTokens    int     `gorm:"default:0"`
	EstimatedOutputTokens    int     `gorm:"default:0"`
	EstimatedChargeAmount    int64   `gorm:"bigint;default:0"`
	PromptTokens             int     `gorm:"default:0"`
	CompletionTokens         int     `gorm:"default:0"`
	PromptTokenDelta         int     `gorm:"default:0"`
	OutputTokenDelta         int     `gorm:"default:0"`
	ChargeDeltaAmount        int64   `gorm:"bigint;default:0"`
}

func (BillingSettlement) TableName() string { return BillingSettlementsTableName }

// ProcurementAttribution owns procurement cost calculation and retry state.
type ProcurementAttribution struct {
	RequestLogID          string  `gorm:"type:char(36);primaryKey"`
	ChannelID             string  `gorm:"type:varchar(64);index"`
	CreatedAt             int64   `gorm:"bigint;index"`
	CostBaseAmount        float64 `gorm:"type:double precision;default:0"`
	CostSource            string  `gorm:"type:varchar(32);default:''"`
	CostConfidence        string  `gorm:"type:varchar(64);default:''"`
	Status                string  `gorm:"type:varchar(32);index;default:''"`
	GrossProfitBaseAmount float64 `gorm:"type:double precision;default:0"`
	GrossMargin           float64 `gorm:"type:double precision;default:0"`
	CostRuleVersion       string  `gorm:"type:varchar(64);default:''"`
	RetryCount            int     `gorm:"default:0"`
	LastRetryAt           int64   `gorm:"bigint;default:0"`
	LastError             string  `gorm:"type:text"`
}

func (ProcurementAttribution) TableName() string { return ProcurementAttributionsTableName }

func billingSettlementFromLog(row *Log) BillingSettlement {
	if row == nil {
		return BillingSettlement{}
	}
	return BillingSettlement{
		RequestLogID: row.Id, UserID: row.UserId, CreatedAt: row.CreatedAt,
		Source: row.BillingSource, SourceID: row.BillingSourceID, SourceName: row.BillingSourceName, SourceDetail: row.BillingSourceDetail,
		PriceUnit: row.BillingPriceUnit, Currency: row.BillingCurrency, PricingSource: row.BillingPricingSource, UsageSource: row.BillingUsageSource,
		EstimateSource: row.BillingEstimateSource, EstimateEstimator: row.BillingEstimateEstimator, EstimatePrecision: row.BillingEstimatePrecision,
		SettlementMode: row.BillingSettlementMode, SettlementTruthMode: row.BillingSettlementTruthMode,
		EffectiveRatio: row.BillingEffectiveRatio, GroupChannelRatio: row.BillingGroupChannelRatio, ModelChannelRatio: row.BillingModelChannelRatio, ChargeRate: row.BillingChargeRate,
		InputQuantity: row.BillingInputQuantity, OutputQuantity: row.BillingOutputQuantity, CacheReadQuantity: row.BillingCacheReadQuantity, CacheWriteQuantity: row.BillingCacheWriteQuantity,
		InputAmount: row.BillingInputAmount, OutputAmount: row.BillingOutputAmount, CacheReadAmount: row.BillingCacheReadAmount, CacheWriteAmount: row.BillingCacheWriteAmount,
		Amount: row.BillingAmount, ChargeAmount: row.BillingChargeAmount,
		OfficialAnchorAmount: row.BillingOfficialAnchorAmount, OfficialAnchorCurrency: row.BillingOfficialAnchorCurrency, OfficialAnchorBaseAmount: row.BillingOfficialAnchorBaseAmount,
		SellBaseAmount: row.BillingSellBaseAmount, CostFloorBaseAmount: row.BillingCostFloorBaseAmount, SelectedSellBaseAmount: row.BillingSelectedSellBaseAmount,
		PricingDecisionReason: row.BillingPricingDecisionReason, CostFloorTriggered: row.BillingCostFloorTriggered, PricingRuleVersion: row.BillingPricingRuleVersion, Decision: row.BillingDecision,
		EstimatedPromptTokens: row.EstimatedPromptTokens, EstimatedOutputTokens: row.EstimatedOutputTokens, EstimatedChargeAmount: row.EstimatedChargeAmount,
		PromptTokens: row.PromptTokens, CompletionTokens: row.CompletionTokens, PromptTokenDelta: row.BillingPromptTokenDelta, OutputTokenDelta: row.BillingOutputTokenDelta, ChargeDeltaAmount: row.BillingChargeDeltaAmount,
	}
}

func procurementAttributionFromLog(row *Log) ProcurementAttribution {
	if row == nil {
		return ProcurementAttribution{}
	}
	return ProcurementAttribution{
		RequestLogID: row.Id, ChannelID: row.ChannelId, CreatedAt: row.CreatedAt,
		CostBaseAmount: row.BillingProcurementCostBaseAmount, CostSource: row.BillingProcurementCostSource,
		CostConfidence: row.BillingProcurementCostConfidence, Status: row.BillingProcurementCostStatus,
		GrossProfitBaseAmount: row.BillingGrossProfitBaseAmount, GrossMargin: row.BillingGrossMargin,
		CostRuleVersion: row.BillingCostRuleVersion, RetryCount: row.BillingProcurementRetryCount,
		LastRetryAt: row.BillingProcurementLastRetryAt, LastError: row.BillingProcurementLastError,
	}
}

// ListProcurementRetryLogs reads retry state from the normalized attribution
// table while returning the request log needed by existing billing code.
func ListProcurementRetryLogs(db *gorm.DB, limit int, maxCreatedAt int64) ([]Log, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	if limit <= 0 {
		limit = 20
	}
	query := db.Table(ProcurementAttributionsTableName+" pa").
		Select("el.*").
		Joins("JOIN "+EventLogsTableName+" el ON el.id = pa.request_log_id").
		Where("el.type = ? AND pa.status = ?", LogTypeConsume, ProcurementCostAttributionStatusRetry)
	if maxCreatedAt > 0 {
		query = query.Where("pa.created_at <= ?", maxCreatedAt)
	}
	rows := make([]Log, 0, limit)
	if err := query.Order("pa.last_retry_at ASC, pa.created_at ASC, pa.request_log_id ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	if err := hydrateProcurementRetryLogs(db, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func hydrateProcurementRetryLogs(db *gorm.DB, rows []Log) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([]string, 0, len(rows))
	byID := make(map[string]*Log, len(rows))
	for index := range rows {
		ids = append(ids, rows[index].Id)
		byID[rows[index].Id] = &rows[index]
	}
	attributions := make([]ProcurementAttribution, 0, len(rows))
	if err := db.Where("request_log_id IN ?", ids).Find(&attributions).Error; err != nil {
		return err
	}
	for _, attribution := range attributions {
		row := byID[attribution.RequestLogID]
		if row == nil {
			continue
		}
		row.BillingProcurementCostBaseAmount = attribution.CostBaseAmount
		row.BillingProcurementCostSource = attribution.CostSource
		row.BillingProcurementCostConfidence = attribution.CostConfidence
		row.BillingProcurementCostStatus = attribution.Status
		row.BillingGrossProfitBaseAmount = attribution.GrossProfitBaseAmount
		row.BillingGrossMargin = attribution.GrossMargin
		row.BillingCostRuleVersion = attribution.CostRuleVersion
		row.BillingProcurementRetryCount = attribution.RetryCount
		row.BillingProcurementLastRetryAt = attribution.LastRetryAt
		row.BillingProcurementLastError = attribution.LastError
	}
	settlements := make([]BillingSettlement, 0, len(rows))
	if err := db.Where("request_log_id IN ?", ids).Find(&settlements).Error; err != nil {
		return err
	}
	for _, settlement := range settlements {
		row := byID[settlement.RequestLogID]
		if row == nil {
			continue
		}
		row.BillingSellBaseAmount = settlement.SellBaseAmount
		row.BillingSettlementTruthMode = settlement.SettlementTruthMode
	}
	return nil
}

func GetProcurementRetryLog(db *gorm.DB, logID string) (*Log, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	id := strings.TrimSpace(logID)
	if id == "" {
		return nil, fmt.Errorf("log id is required")
	}
	row := &Log{}
	err := db.Table(EventLogsTableName+" el").
		Select("el.*").
		Joins("JOIN "+ProcurementAttributionsTableName+" pa ON pa.request_log_id = el.id").
		Where("el.id = ? AND el.type = ? AND pa.status = ?", id, LogTypeConsume, ProcurementCostAttributionStatusRetry).
		First(row).Error
	return row, err
}

func updateProcurementAttribution(db *gorm.DB, logID string, updates map[string]any) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	id := strings.TrimSpace(logID)
	if id == "" || len(updates) == 0 {
		return nil
	}
	if !db.Migrator().HasTable(&ProcurementAttribution{}) {
		return fmt.Errorf("normalized procurement attribution table is missing")
	}
	result := db.Model(&ProcurementAttribution{}).Where("request_log_id = ?", id).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		var count int64
		if err := db.Model(&ProcurementAttribution{}).Where("request_log_id = ?", id).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return fmt.Errorf("normalized procurement attribution %s not found", id)
		}
	}
	return nil
}

func MarkProcurementRetryFailure(logID, message string, retriedAt int64) error {
	return MarkProcurementRetryFailureWithDB(LOG_DB, logID, message, retriedAt)
}

func MarkProcurementRetryFailureWithDB(db *gorm.DB, logID, message string, retriedAt int64) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := updateProcurementAttribution(tx, logID, map[string]any{
			"status": ProcurementCostAttributionStatusRetry, "retry_count": gorm.Expr("retry_count + 1"), "last_retry_at": retriedAt, "last_error": message,
		}); err != nil {
			return err
		}
		return nil
	})
}

func ClearProcurementRetryFailure(logID string) error {
	return ClearProcurementRetryFailureWithDB(LOG_DB, logID)
}

func ClearProcurementRetryFailureWithDB(db *gorm.DB, logID string) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := updateProcurementAttribution(tx, logID, map[string]any{"last_error": ""}); err != nil {
			return err
		}
		return nil
	})
}

// CreateLogWithFinanceRecords atomically creates a request log and its
// normalized finance records. Non-consume logs only require event_logs.
func CreateLogWithFinanceRecords(db *gorm.DB, row *Log) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if row == nil {
		return fmt.Errorf("log is nil")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		return RecordFinanceRecordsForLog(tx, row)
	})
}

// financeRecordTables 缓存一次性建表校验结果。迁移在启动阶段完成后表结构进程内稳定,
// 无需在每个请求的写路径上重复做 HasTable 库表探测(那会给热路径平白增加两次查询)。
var (
	financeRecordTablesOnce sync.Once
	financeRecordTablesErr  error
)

func ensureFinanceRecordTables(db *gorm.DB) error {
	financeRecordTablesOnce.Do(func() {
		if !db.Migrator().HasTable(&BillingSettlement{}) {
			financeRecordTablesErr = fmt.Errorf("normalized billing settlement table is missing")
			return
		}
		if !db.Migrator().HasTable(&ProcurementAttribution{}) {
			financeRecordTablesErr = fmt.Errorf("normalized procurement attribution table is missing")
		}
	})
	return financeRecordTablesErr
}

// RecordFinanceRecordsForLog writes normalized records for an existing
// consume log. Missing tables are fatal because callers rely on atomicity.
func RecordFinanceRecordsForLog(db *gorm.DB, row *Log) error {
	if db == nil || row == nil || strings.TrimSpace(row.Id) == "" || row.Type != LogTypeConsume {
		return nil
	}
	if err := ensureFinanceRecordTables(db); err != nil {
		return err
	}
	settlement := billingSettlementFromLog(row)
	if err := db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&settlement).Error; err != nil {
		return err
	}
	// A community offer produces a publisher payable recorded in the main
	// commercial ledger. It is not Router procurement, so creating a
	// ProcurementAttribution here would falsely represent it as platform cost.
	if strings.TrimSpace(row.UpstreamSource) == "community_offer" {
		return nil
	}
	attribution := procurementAttributionFromLog(row)
	return db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&attribution).Error
}

func CheckFinanceRecordConsistency(db *gorm.DB, logID string) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	id := strings.TrimSpace(logID)
	if id == "" {
		return fmt.Errorf("log id is required")
	}
	var logRow Log
	if err := db.First(&logRow, "id = ?", id).Error; err != nil {
		return err
	}
	var settlement BillingSettlement
	if err := db.First(&settlement, "request_log_id = ?", id).Error; err != nil {
		return err
	}
	if settlement.PromptTokens != logRow.PromptTokens || settlement.CompletionTokens != logRow.CompletionTokens {
		return fmt.Errorf("billing settlement mismatch for log %s", id)
	}
	return nil
}

func InspectFinanceConsistency(db *gorm.DB, startAt, endAt int64) (FinanceConsistencySummary, error) {
	if db == nil {
		return FinanceConsistencySummary{}, fmt.Errorf("database handle is nil")
	}
	result := FinanceConsistencySummary{WindowStartAt: startAt, WindowEndAt: endAt}
	base := db.Table(EventLogsTableName).Where("type = ?", LogTypeConsume)
	if startAt > 0 {
		base = base.Where("created_at >= ?", startAt)
	}
	if endAt > 0 {
		base = base.Where("created_at <= ?", endAt)
	}
	if err := base.Count(&result.ConsumeLogs).Error; err != nil {
		return result, err
	}
	if err := db.Raw("SELECT COUNT(*) FROM event_logs el LEFT JOIN billing_settlements bs ON bs.request_log_id = el.id WHERE el.type = ? AND bs.request_log_id IS NULL AND (? = 0 OR el.created_at >= ?) AND (? = 0 OR el.created_at <= ?)", LogTypeConsume, startAt, startAt, endAt, endAt).Scan(&result.MissingSettlements).Error; err != nil {
		return result, err
	}
	if err := db.Raw("SELECT COUNT(*) FROM event_logs el LEFT JOIN procurement_attributions pa ON pa.request_log_id = el.id WHERE el.type = ? AND pa.request_log_id IS NULL AND (? = 0 OR el.created_at >= ?) AND (? = 0 OR el.created_at <= ?)", LogTypeConsume, startAt, startAt, endAt, endAt).Scan(&result.MissingAttributions).Error; err != nil {
		return result, err
	}
	// Compare only fields that remain durably stored on event_logs. Monetary
	// components live exclusively in billing_settlements after the finance
	// table split, so comparing removed columns here would make the check
	// database-schema dependent and silently fail after cleanup.
	const settlementMismatchPredicate = `
		COALESCE(el.prompt_tokens, 0) <> COALESCE(bs.prompt_tokens, 0) OR
		COALESCE(el.completion_tokens, 0) <> COALESCE(bs.completion_tokens, 0) OR
		COALESCE(el.billing_settlement_mode, '') <> COALESCE(bs.settlement_mode, '') OR
		COALESCE(el.billing_settlement_truth_mode, '') <> COALESCE(bs.settlement_truth_mode, '') OR
		COALESCE(el.estimated_prompt_tokens, 0) <> COALESCE(bs.estimated_prompt_tokens, 0) OR
		COALESCE(el.estimated_output_tokens, 0) <> COALESCE(bs.estimated_output_tokens, 0) OR
		COALESCE(el.estimated_charge_amount, 0) <> COALESCE(bs.estimated_charge_amount, 0) OR
		COALESCE(el.billing_prompt_token_delta, 0) <> COALESCE(bs.prompt_token_delta, 0) OR
		COALESCE(el.billing_output_token_delta, 0) <> COALESCE(bs.output_token_delta, 0) OR
		COALESCE(el.billing_charge_delta_amount, 0) <> COALESCE(bs.charge_delta_amount, 0)`
	query := "SELECT COUNT(*) FROM event_logs el JOIN billing_settlements bs ON bs.request_log_id = el.id WHERE el.type = ? AND (" + settlementMismatchPredicate + ") AND (? = 0 OR el.created_at >= ?) AND (? = 0 OR el.created_at <= ?)"
	if err := db.Raw(query, LogTypeConsume, startAt, startAt, endAt, endAt).Scan(&result.SettlementMismatches).Error; err != nil {
		return result, err
	}
	result.Consistent = result.MissingSettlements == 0 && result.MissingAttributions == 0 && result.SettlementMismatches == 0
	return result, nil
}

// ListFinanceConsistencyIssues returns actionable discrepancies for an admin
// audit window. Results are bounded so an unhealthy historical dataset cannot
// overload the admin API.
func ListFinanceConsistencyIssues(db *gorm.DB, startAt, endAt int64, limit int) ([]FinanceConsistencyIssue, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	const mismatch = `
		COALESCE(el.prompt_tokens, 0) <> COALESCE(bs.prompt_tokens, 0) OR
		COALESCE(el.completion_tokens, 0) <> COALESCE(bs.completion_tokens, 0) OR
		COALESCE(el.billing_settlement_mode, '') <> COALESCE(bs.settlement_mode, '') OR
		COALESCE(el.billing_settlement_truth_mode, '') <> COALESCE(bs.settlement_truth_mode, '') OR
		COALESCE(el.estimated_prompt_tokens, 0) <> COALESCE(bs.estimated_prompt_tokens, 0) OR
		COALESCE(el.estimated_output_tokens, 0) <> COALESCE(bs.estimated_output_tokens, 0) OR
		COALESCE(el.estimated_charge_amount, 0) <> COALESCE(bs.estimated_charge_amount, 0) OR
		COALESCE(el.billing_prompt_token_delta, 0) <> COALESCE(bs.prompt_token_delta, 0) OR
		COALESCE(el.billing_output_token_delta, 0) <> COALESCE(bs.output_token_delta, 0) OR
		COALESCE(el.billing_charge_delta_amount, 0) <> COALESCE(bs.charge_delta_amount, 0)`
	window := " AND (? = 0 OR el.created_at >= ?) AND (? = 0 OR el.created_at <= ?)"
	query := `SELECT issue_type, request_log_id, created_at, prompt_tokens, completion_tokens FROM (
		SELECT 'missing_settlement' AS issue_type, el.id AS request_log_id, el.created_at, el.prompt_tokens, el.completion_tokens
		FROM event_logs el LEFT JOIN billing_settlements bs ON bs.request_log_id = el.id
		WHERE el.type = ? AND bs.request_log_id IS NULL` + window + `
		UNION ALL
		SELECT 'missing_attribution', el.id, el.created_at, el.prompt_tokens, el.completion_tokens
		FROM event_logs el LEFT JOIN procurement_attributions pa ON pa.request_log_id = el.id
		WHERE el.type = ? AND pa.request_log_id IS NULL` + window + `
		UNION ALL
		SELECT 'settlement_mismatch', el.id, el.created_at, el.prompt_tokens, el.completion_tokens
		FROM event_logs el JOIN billing_settlements bs ON bs.request_log_id = el.id
		WHERE el.type = ? AND (` + mismatch + `)` + window + `
	) issues ORDER BY created_at DESC, request_log_id ASC LIMIT ?`
	args := []any{LogTypeConsume, startAt, startAt, endAt, endAt, LogTypeConsume, startAt, startAt, endAt, endAt, LogTypeConsume, startAt, startAt, endAt, endAt, limit}
	rows := make([]FinanceConsistencyIssue, 0, limit)
	if err := db.Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// CanDropFinanceColumns is the explicit gate for the cleanup migration. It
// intentionally fails closed when normalized tables are absent
// or any record in the verification window is missing or divergent.
func CanDropFinanceColumns(db *gorm.DB, startAt, endAt int64) (bool, FinanceConsistencySummary, error) {
	if db == nil {
		return false, FinanceConsistencySummary{}, fmt.Errorf("database handle is nil")
	}
	if !db.Migrator().HasTable(&BillingSettlement{}) || !db.Migrator().HasTable(&ProcurementAttribution{}) {
		return false, FinanceConsistencySummary{WindowStartAt: startAt, WindowEndAt: endAt}, nil
	}
	summary, err := InspectFinanceConsistency(db, startAt, endAt)
	if err != nil {
		return false, summary, err
	}
	return summary.Consistent, summary, nil
}

// DropFinanceColumnsWithDB performs the final destructive operation after all
// old readers and writers have been removed from the binary.
func DropFinanceColumnsWithDB(db *gorm.DB, startAt, endAt int64) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !db.Migrator().HasTable(EventLogsTableName) {
		return fmt.Errorf("event logs table is missing")
	}
	if !db.Migrator().HasTable(&BillingSettlement{}) || !db.Migrator().HasTable(&ProcurementAttribution{}) {
		return fmt.Errorf("normalized finance tables are missing")
	}
	if startAt != 0 || endAt != 0 {
		return fmt.Errorf("destructive finance cleanup requires a full-history consistency check")
	}
	allowed, summary, err := CanDropFinanceColumns(db, startAt, endAt)
	if err != nil {
		return err
	}
	if !allowed {
		return fmt.Errorf("finance consistency gate failed: missing_settlements=%d missing_attributions=%d settlement_mismatches=%d", summary.MissingSettlements, summary.MissingAttributions, summary.SettlementMismatches)
	}
	return db.Transaction(func(tx *gorm.DB) error {
		for _, column := range financeColumnsPendingRemoval {
			if !tx.Migrator().HasColumn(EventLogsTableName, column) {
				continue
			}
			if err := tx.Exec("ALTER TABLE " + EventLogsTableName + " DROP COLUMN " + column).Error; err != nil {
				return fmt.Errorf("drop finance column pending removal %s: %w", column, err)
			}
		}
		return nil
	})
}

// DropObsoleteEventLogFinanceColumnsWithDB removes pre-normalization columns
// that have no runtime readers. The checks make the migration idempotent.
func DropObsoleteEventLogFinanceColumnsWithDB(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !db.Migrator().HasTable(EventLogsTableName) {
		return nil
	}
	for _, column := range obsoleteEventLogFinanceColumns {
		if !db.Migrator().HasColumn(EventLogsTableName, column) {
			continue
		}
		if err := db.Exec("ALTER TABLE " + EventLogsTableName + " DROP COLUMN " + column).Error; err != nil {
			return fmt.Errorf("drop obsolete event log finance column %s: %w", column, err)
		}
	}
	return nil
}
