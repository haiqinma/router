package log

import (
	"context"
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/common/random"
	"github.com/yeying-community/router/internal/admin/model"
)

const userVisibleModelNameExpr = "NULLIF(TRIM(request_model_name), '')"
const adminVisibleModelNameExpr = "COALESCE(NULLIF(TRIM(request_model_name), ''), NULLIF(TRIM(model_name), ''))"

func hydrateLogsWithChannelNames(logs []*model.Log) error {
	if len(logs) == 0 {
		return nil
	}
	channelIDs := make([]string, 0, len(logs))
	seen := make(map[string]struct{}, len(logs))
	for _, log := range logs {
		if log == nil {
			continue
		}
		channelID := strings.TrimSpace(log.ChannelId)
		if channelID == "" {
			continue
		}
		if _, ok := seen[channelID]; ok {
			continue
		}
		seen[channelID] = struct{}{}
		channelIDs = append(channelIDs, channelID)
	}
	if len(channelIDs) > 0 {
		var channels []*model.Channel
		if err := model.DB.Select("id", "name").Where("id IN ?", channelIDs).Find(&channels).Error; err != nil {
			return err
		}
		channelNameByID := make(map[string]string, len(channels))
		for _, channel := range channels {
			if channel == nil {
				continue
			}
			channelNameByID[channel.Id] = channel.DisplayName()
		}
		for _, log := range logs {
			if log == nil {
				continue
			}
			log.ChannelName = channelNameByID[log.ChannelId]
			if strings.TrimSpace(log.ChannelName) == "" && strings.TrimSpace(log.PersonalProviderName) != "" {
				log.ChannelName = strings.TrimSpace(log.PersonalProviderName)
			}
		}
	}
	groupIDs := make([]string, 0, len(logs))
	seenGroups := make(map[string]struct{}, len(logs))
	for _, log := range logs {
		if log == nil {
			continue
		}
		groupID := strings.TrimSpace(log.GroupId)
		if groupID == "" {
			continue
		}
		if _, ok := seenGroups[groupID]; ok {
			continue
		}
		seenGroups[groupID] = struct{}{}
		groupIDs = append(groupIDs, groupID)
	}
	if len(groupIDs) == 0 {
		return nil
	}
	var groups []model.GroupCatalog
	if err := model.DB.Select("id", "name").Where("id IN ?", groupIDs).Find(&groups).Error; err != nil {
		return err
	}
	groupNameByID := make(map[string]string, len(groups))
	for _, group := range groups {
		groupID := strings.TrimSpace(group.Id)
		if groupID == "" {
			continue
		}
		groupNameByID[groupID] = strings.TrimSpace(group.Name)
	}
	for _, log := range logs {
		if log == nil {
			continue
		}
		log.GroupName = groupNameByID[log.GroupId]
	}
	return nil
}

func hydrateLogsWithFinanceRecords(logs []*model.Log) error {
	if len(logs) == 0 || model.LOG_DB == nil || !model.LOG_DB.Migrator().HasTable(&model.BillingSettlement{}) {
		return nil
	}
	ids := make([]string, 0, len(logs))
	byID := make(map[string]*model.Log, len(logs))
	for _, row := range logs {
		if row == nil || strings.TrimSpace(row.Id) == "" {
			continue
		}
		id := strings.TrimSpace(row.Id)
		ids = append(ids, id)
		byID[id] = row
	}
	if len(ids) == 0 {
		return nil
	}
	settlements := make([]model.BillingSettlement, 0, len(ids))
	if err := model.LOG_DB.Where("request_log_id IN ?", ids).Find(&settlements).Error; err != nil {
		return err
	}
	for _, settlement := range settlements {
		row := byID[settlement.RequestLogID]
		if row == nil {
			continue
		}
		row.BillingPriceUnit = settlement.PriceUnit
		row.BillingCurrency = settlement.Currency
		row.BillingPricingSource = settlement.PricingSource
		row.BillingUsageSource = settlement.UsageSource
		row.BillingEstimateSource = settlement.EstimateSource
		row.BillingEstimateEstimator = settlement.EstimateEstimator
		row.BillingEstimatePrecision = settlement.EstimatePrecision
		row.BillingSettlementMode = settlement.SettlementMode
		row.BillingSettlementTruthMode = settlement.SettlementTruthMode
		row.BillingEffectiveRatio = settlement.EffectiveRatio
		row.BillingGroupChannelRatio = settlement.GroupChannelRatio
		row.BillingModelChannelRatio = settlement.ModelChannelRatio
		row.BillingChargeRate = settlement.ChargeRate
		row.BillingInputQuantity = settlement.InputQuantity
		row.BillingOutputQuantity = settlement.OutputQuantity
		row.BillingCacheReadQuantity = settlement.CacheReadQuantity
		row.BillingCacheWriteQuantity = settlement.CacheWriteQuantity
		row.BillingInputAmount = settlement.InputAmount
		row.BillingOutputAmount = settlement.OutputAmount
		row.BillingCacheReadAmount = settlement.CacheReadAmount
		row.BillingCacheWriteAmount = settlement.CacheWriteAmount
		row.BillingAmount = settlement.Amount
		row.BillingChargeAmount = settlement.ChargeAmount
		row.BillingOfficialAnchorAmount = settlement.OfficialAnchorAmount
		row.BillingOfficialAnchorCurrency = settlement.OfficialAnchorCurrency
		row.BillingOfficialAnchorBaseAmount = settlement.OfficialAnchorBaseAmount
		row.BillingSellBaseAmount = settlement.SellBaseAmount
		row.BillingCostFloorBaseAmount = settlement.CostFloorBaseAmount
		row.BillingSelectedSellBaseAmount = settlement.SelectedSellBaseAmount
		row.BillingPricingDecisionReason = settlement.PricingDecisionReason
		row.BillingCostFloorTriggered = settlement.CostFloorTriggered
		row.BillingPricingRuleVersion = settlement.PricingRuleVersion
		row.BillingDecision = settlement.Decision
		row.EstimatedPromptTokens = settlement.EstimatedPromptTokens
		row.EstimatedOutputTokens = settlement.EstimatedOutputTokens
		row.EstimatedChargeAmount = settlement.EstimatedChargeAmount
		row.PromptTokens = settlement.PromptTokens
		row.CompletionTokens = settlement.CompletionTokens
		row.BillingPromptTokenDelta = settlement.PromptTokenDelta
		row.BillingOutputTokenDelta = settlement.OutputTokenDelta
		row.BillingChargeDeltaAmount = settlement.ChargeDeltaAmount
	}
	attributions := make([]model.ProcurementAttribution, 0, len(ids))
	if err := model.LOG_DB.Where("request_log_id IN ?", ids).Find(&attributions).Error; err != nil {
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
	return nil
}

func init() {
	model.BindLogRepository(model.LogRepository{
		RecordLog:                             RecordLog,
		RecordTopupLog:                        RecordTopupLog,
		RecordConsumeLog:                      RecordConsumeLog,
		RecordRelayFailureLog:                 RecordRelayFailureLog,
		RecordTestLog:                         RecordTestLog,
		GetAllLogs:                            GetAll,
		GetUserLogs:                           GetUser,
		GetLogByID:                            GetByID,
		GetUserLogByID:                        GetUserByID,
		SearchAllLogs:                         SearchAll,
		SearchUserLogs:                        SearchUser,
		SumUsedQuota:                          SumUsedQuota,
		SumUsedQuotaByUserIdWithModels:        SumUsedQuotaByUserIdWithModels,
		SumUsedQuotaByUserIdWithModelAndToken: SumUsedQuotaByUserIdWithModelAndToken,
		SumUsedToken:                          SumUsedToken,
		DeleteOldLog:                          DeleteOld,
		SearchLogsByPeriodAndModel:            SearchLogsByPeriodAndModel,
		SearchLogModelsByPeriod:               SearchLogModelsByPeriod,
	})
}

func recordLogHelper(ctx context.Context, log *model.Log) {
	if strings.TrimSpace(log.Id) == "" {
		log.Id = random.GetUUID()
	}
	normalizeLogRouteModelNames(log)
	traceID := helper.GetTraceID(ctx)
	log.TraceID = traceID
	err := model.CreateLogWithFinanceRecords(model.LOG_DB, log)
	if err != nil {
		logger.Error(ctx, "failed to record log: "+err.Error())
		return
	}
	logger.Infof(ctx, "record log: %+v", log)
}

func normalizeLogRouteModelNames(log *model.Log) {
	if log == nil {
		return
	}
	modelName := strings.TrimSpace(log.ModelName)
	if modelName == "" {
		return
	}
	if strings.TrimSpace(log.RequestModelName) == "" {
		log.RequestModelName = modelName
	}
	if strings.TrimSpace(log.ActualModelName) == "" {
		log.ActualModelName = modelName
	}
}

func RecordLog(ctx context.Context, userId string, logType int, content string) {
	if logType == model.LogTypeConsume && !config.LogConsumeEnabled {
		return
	}
	log := &model.Log{
		UserId:    userId,
		Username:  model.GetUsernameById(userId),
		CreatedAt: helper.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	recordLogHelper(ctx, log)
}

func RecordTopupLog(ctx context.Context, userId string, content string, quota int64) {
	log := &model.Log{
		UserId:    userId,
		Username:  model.GetUsernameById(userId),
		CreatedAt: helper.GetTimestamp(),
		Type:      model.LogTypeTopup,
		Content:   content,
		Quota:     quota,
	}
	recordLogHelper(ctx, log)
}

func RecordConsumeLog(ctx context.Context, log *model.Log) {
	// 消费日志行是财务/采购/毛利的锚:billing_settlements、procurement_attributions
	// 均以 event_logs.id 为外键(request_finance_records.go),毛利报表也直接 FROM event_logs。
	// 若这里被 LogConsumeEnabled 吞掉,财务记录与采购归因会连带静默失效(log.Id 不赋值,
	// RecordProcurementConsumptionObservation 因空 Id 直接返回)。故消费日志无条件落库,
	// 与「记录消费日志」开关解耦;该开关仅约束失败日志/通用日志等不承载财务的路径。
	log.Username = model.GetUsernameById(log.UserId)
	log.CreatedAt = helper.GetTimestamp()
	log.Type = model.LogTypeConsume
	recordLogHelper(ctx, log)
}

func RecordRelayFailureLog(ctx context.Context, log *model.Log) {
	if !config.LogConsumeEnabled {
		return
	}
	log.Username = model.GetUsernameById(log.UserId)
	log.CreatedAt = helper.GetTimestamp()
	log.Type = model.LogTypeRelayFailure
	recordLogHelper(ctx, log)
}

func RecordTestLog(ctx context.Context, log *model.Log) {
	log.CreatedAt = helper.GetTimestamp()
	log.Type = model.LogTypeTest
	recordLogHelper(ctx, log)
}

// logSortColumns 是日志列表的排序白名单：order_by 值 -> 安全 SQL 列名。
// 列名均为代码常量,绝不来自请求原文。默认列为 created_at。
var logSortColumns = map[string]string{
	"created_at":        "created_at",
	"quota":             "quota",
	"prompt_tokens":     "prompt_tokens",
	"completion_tokens": "completion_tokens",
	"elapsed_time":      "elapsed_time",
}

const logDefaultSortColumn = "created_at"

// buildLogOrder 根据白名单把 order_by/order 转换为安全的 gorm Order 字符串。
func buildLogOrder(orderBy string, order string) string {
	direction := "desc"
	if strings.EqualFold(strings.TrimSpace(order), "asc") {
		direction = "asc"
	}
	column, ok := logSortColumns[strings.TrimSpace(orderBy)]
	if !ok {
		column = logDefaultSortColumn
	}
	return column + " " + direction
}

func GetAll(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, groupID string, startIdx int, num int, channel string, orderBy string, order string) ([]*model.Log, error) {
	var tx = model.LOG_DB
	if logType != model.LogTypeAll {
		tx = tx.Where("type = ?", logType)
	}
	if modelName != "" {
		tx = tx.Where(adminVisibleModelNameExpr+" = ?", modelName)
	}
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if strings.TrimSpace(groupID) != "" {
		tx = tx.Where("group_id = ?", strings.TrimSpace(groupID))
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if strings.TrimSpace(channel) != "" {
		tx = tx.Where("channel_id = ?", channel)
	}
	var logs []*model.Log
	err := tx.Order(buildLogOrder(orderBy, order)).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, err
	}
	if err := hydrateLogsWithChannelNames(logs); err != nil {
		return nil, err
	}
	if err := hydrateLogsWithFinanceRecords(logs); err != nil {
		return nil, err
	}
	return logs, err
}

func GetUser(userId string, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, orderBy string, order string) ([]*model.Log, error) {
	var tx = model.LOG_DB
	if logType == model.LogTypeAll {
		tx = tx.Where("user_id = ?", userId)
	} else {
		tx = tx.Where("user_id = ? and type = ?", userId, logType)
	}
	if modelName != "" {
		tx = tx.Where(userVisibleModelNameExpr+" = ?", modelName)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	var logs []*model.Log
	err := tx.Order(buildLogOrder(orderBy, order)).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, err
	}
	if err := hydrateLogsWithChannelNames(logs); err != nil {
		return nil, err
	}
	if err := hydrateLogsWithFinanceRecords(logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func GetByID(logID string) (*model.Log, error) {
	logID = strings.TrimSpace(logID)
	if logID == "" {
		return nil, fmt.Errorf("日志不存在")
	}
	row := &model.Log{}
	if err := model.LOG_DB.Where("id = ?", logID).First(row).Error; err != nil {
		return nil, err
	}
	if err := hydrateLogsWithChannelNames([]*model.Log{row}); err != nil {
		return nil, err
	}
	if err := hydrateLogsWithFinanceRecords([]*model.Log{row}); err != nil {
		return nil, err
	}
	return row, nil
}

func GetUserByID(userId string, logID string) (*model.Log, error) {
	userId = strings.TrimSpace(userId)
	logID = strings.TrimSpace(logID)
	if userId == "" || logID == "" {
		return nil, fmt.Errorf("日志不存在")
	}
	row := &model.Log{}
	if err := model.LOG_DB.Where("id = ? AND user_id = ?", logID, userId).First(row).Error; err != nil {
		return nil, err
	}
	if err := hydrateLogsWithChannelNames([]*model.Log{row}); err != nil {
		return nil, err
	}
	if err := hydrateLogsWithFinanceRecords([]*model.Log{row}); err != nil {
		return nil, err
	}
	return row, nil
}

func SearchAll(keyword string) ([]*model.Log, error) {
	var logs []*model.Log
	err := model.LOG_DB.Where("type = ? or content LIKE ?", keyword, keyword+"%").Order("created_at desc").Limit(config.MaxRecentItems).Find(&logs).Error
	if err != nil {
		return nil, err
	}
	if err := hydrateLogsWithChannelNames(logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func SearchUser(userId string, keyword string) ([]*model.Log, error) {
	var logs []*model.Log
	err := model.LOG_DB.Where("user_id = ? and type = ?", userId, keyword).Order("created_at desc").Limit(config.MaxRecentItems).Find(&logs).Error
	if err != nil {
		return nil, err
	}
	if err := hydrateLogsWithChannelNames(logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel string) int64 {
	tx := model.LOG_DB.Table(model.EventLogsTableName).Select("COALESCE(sum(quota),0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where(adminVisibleModelNameExpr+" = ?", modelName)
	}
	if strings.TrimSpace(channel) != "" {
		tx = tx.Where("channel_id = ?", channel)
	}
	var quota int64
	tx.Where("type = ?", logType).Scan(&quota)
	return quota
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) int {
	tx := model.LOG_DB.Table(model.EventLogsTableName).Select("COALESCE(sum(prompt_tokens),0) + COALESCE(sum(completion_tokens),0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where(adminVisibleModelNameExpr+" = ?", modelName)
	}
	var token int
	tx.Where("type = ?", logType).Scan(&token)
	return token
}

func SumUsedQuotaByUserId(logType int, userId string, startTimestamp int64, endTimestamp int64) (int64, error) {
	tx := model.LOG_DB.Table(model.EventLogsTableName).Select("COALESCE(sum(quota),0)")
	tx = tx.Where("user_id = ?", userId)
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	var quota int64
	err := tx.Where("type = ?", logType).Scan(&quota).Error
	return quota, err
}

func SumUsedQuotaByUserIdWithModels(logType int, userId string, startTimestamp int64, endTimestamp int64, models []string) (int64, error) {
	tx := model.LOG_DB.Table(model.EventLogsTableName).Select("COALESCE(sum(quota),0)")
	tx = tx.Where("user_id = ?", userId)
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if len(models) > 0 {
		tx = tx.Where(userVisibleModelNameExpr+" IN ?", models)
	}
	var quota int64
	err := tx.Where("type = ?", logType).Scan(&quota).Error
	return quota, err
}

func SumUsedQuotaByUserIdWithModelAndToken(logType int, userId string, startTimestamp int64, endTimestamp int64, modelName string, tokenName string) (int64, error) {
	tx := model.LOG_DB.Table(model.EventLogsTableName).Select("COALESCE(sum(quota),0)").
		Where("user_id = ?", userId)
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if strings.TrimSpace(modelName) != "" {
		tx = tx.Where(userVisibleModelNameExpr+" = ?", strings.TrimSpace(modelName))
	}
	if strings.TrimSpace(tokenName) != "" {
		tx = tx.Where("token_name = ?", strings.TrimSpace(tokenName))
	}
	var quota int64
	err := tx.Where("type = ?", logType).Scan(&quota).Error
	return quota, err
}

func MinLogTimestampByUserId(userId string, logTypes []int) (int64, error) {
	tx := model.LOG_DB.Table(model.EventLogsTableName).Select("COALESCE(min(created_at),0)").
		Where("user_id = ?", userId)
	if len(logTypes) > 0 {
		tx = tx.Where("type IN ?", logTypes)
	}
	var timestamp int64
	err := tx.Scan(&timestamp).Error
	return timestamp, err
}

func DeleteOld(targetTimestamp int64) (int64, error) {
	result := model.LOG_DB.Where("created_at < ?", targetTimestamp).Delete(&model.Log{})
	return result.RowsAffected, result.Error
}

func selectGroupByGranularity(granularity string) string {
	switch granularity {
	case "hour":
		return "TO_CHAR(date_trunc('hour', to_timestamp(created_at)), 'YYYY-MM-DD HH24') as day"
	case "week":
		return "TO_CHAR(date_trunc('week', to_timestamp(created_at)), 'IYYY-\"W\"IW') as day"
	case "month":
		return "TO_CHAR(date_trunc('month', to_timestamp(created_at)), 'YYYY-MM') as day"
	case "year":
		return "TO_CHAR(date_trunc('year', to_timestamp(created_at)), 'YYYY') as day"
	default:
		return "TO_CHAR(date_trunc('day', to_timestamp(created_at)), 'YYYY-MM-DD') as day"
	}
}

func SearchLogsByPeriodAndModel(userId string, start, end int, granularity string, models []string) ([]*model.LogStatistic, error) {
	groupSelect := selectGroupByGranularity(granularity)
	query := fmt.Sprintf(`
		SELECT `+groupSelect+`,
		%s AS model_name, count(1) as request_count,
		sum(quota) as quota,
		sum(prompt_tokens) as prompt_tokens,
		sum(completion_tokens) as completion_tokens
		FROM %s
		WHERE type=2
		AND user_id= ?
		AND created_at BETWEEN ? AND ?
	`, userVisibleModelNameExpr, model.EventLogsTableName)
	args := []interface{}{userId, start, end}
	if len(models) > 0 {
		query += " AND " + userVisibleModelNameExpr + " IN ?"
		args = append(args, models)
	}
	query += `
		GROUP BY day, ` + userVisibleModelNameExpr + `
		ORDER BY day, model_name
	`
	var stats []*model.LogStatistic
	err := model.LOG_DB.Raw(query, args...).Scan(&stats).Error
	return stats, err
}

func SearchLogModelsByPeriod(userId string, start, end int) ([]string, error) {
	type modelNameRow struct {
		ModelName string `gorm:"column:model_name"`
	}
	var rows []modelNameRow
	query := fmt.Sprintf(`
		SELECT DISTINCT %s AS model_name
		FROM %s
		WHERE type = ?
		AND user_id = ?
		AND created_at BETWEEN ? AND ?
		AND COALESCE(%s, '') <> ''
		ORDER BY model_name
	`, userVisibleModelNameExpr, model.EventLogsTableName, userVisibleModelNameExpr)
	if err := model.LOG_DB.Raw(query, model.LogTypeConsume, userId, start, end).Scan(&rows).Error; err != nil {
		return nil, err
	}
	models := make([]string, 0, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.ModelName)
		if name == "" {
			continue
		}
		models = append(models, name)
	}
	return models, nil
}
