package log

import (
	"context"
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/common/random"
	"github.com/yeying-community/router/internal/admin/model"
)

func init() {
	model.BindLogRepository(model.LogRepository{
		RecordLog:                  RecordLog,
		RecordTopupLog:             RecordTopupLog,
		RecordConsumeLog:           RecordConsumeLog,
		RecordTestLog:              RecordTestLog,
		GetAllLogs:                 GetAll,
		GetUserLogs:                GetUser,
		SearchAllLogs:              SearchAll,
		SearchUserLogs:             SearchUser,
		SumUsedQuota:               SumUsedQuota,
		SumUsedToken:               SumUsedToken,
		DeleteOldLog:               DeleteOld,
		SearchLogsByPeriodAndModel: SearchLogsByPeriodAndModel,
		SearchLogModelsByPeriod:    SearchLogModelsByPeriod,
	})
}

func recordLogHelper(ctx context.Context, log *model.Log) {
	if strings.TrimSpace(log.Id) == "" {
		log.Id = random.GetUUID()
	}
	traceID := helper.GetTraceID(ctx)
	log.TraceID = traceID
	err := model.LOG_DB.Create(log).Error
	if err != nil {
		logger.Error(ctx, "failed to record log: "+err.Error())
		return
	}
	logger.Infof(ctx, "record log: %+v", log)
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

func RecordTopupLog(ctx context.Context, userId string, content string, quota int) {
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
	if !config.LogConsumeEnabled {
		return
	}
	log.Username = model.GetUsernameById(log.UserId)
	log.CreatedAt = helper.GetTimestamp()
	log.Type = model.LogTypeConsume
	recordLogHelper(ctx, log)
}

func RecordTestLog(ctx context.Context, log *model.Log) {
	log.CreatedAt = helper.GetTimestamp()
	log.Type = model.LogTypeTest
	recordLogHelper(ctx, log)
}

func GetAll(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, startIdx int, num int, channel string) ([]*model.Log, error) {
	var tx = model.LOG_DB
	if logType != model.LogTypeAll {
		tx = tx.Where("type = ?", logType)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
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
	if strings.TrimSpace(channel) != "" {
		tx = tx.Where("channel_id = ?", channel)
	}
	var logs []*model.Log
	err := tx.Order("created_at desc").Limit(num).Offset(startIdx).Find(&logs).Error
	return logs, err
}

func GetUser(userId string, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int) ([]*model.Log, error) {
	var tx = model.LOG_DB
	if logType == model.LogTypeAll {
		tx = tx.Where("user_id = ?", userId)
	} else {
		tx = tx.Where("user_id = ? and type = ?", userId, logType)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
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
	err := tx.Order("created_at desc").Limit(num).Offset(startIdx).Omit("id").Find(&logs).Error
	return logs, err
}

func SearchAll(keyword string) ([]*model.Log, error) {
	var logs []*model.Log
	err := model.LOG_DB.Where("type = ? or content LIKE ?", keyword, keyword+"%").Order("created_at desc").Limit(config.MaxRecentItems).Find(&logs).Error
	return logs, err
}

func SearchUser(userId string, keyword string) ([]*model.Log, error) {
	var logs []*model.Log
	err := model.LOG_DB.Where("user_id = ? and type = ?", userId, keyword).Order("created_at desc").Limit(config.MaxRecentItems).Omit("id").Find(&logs).Error
	return logs, err
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel string) int64 {
	tx := model.LOG_DB.Table("logs").Select("COALESCE(sum(quota),0)")
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
		tx = tx.Where("model_name = ?", modelName)
	}
	if strings.TrimSpace(channel) != "" {
		tx = tx.Where("channel_id = ?", channel)
	}
	var quota int64
	tx.Where("type = ?", logType).Scan(&quota)
	return quota
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) int {
	tx := model.LOG_DB.Table("logs").Select("COALESCE(sum(prompt_tokens),0) + COALESCE(sum(completion_tokens),0)")
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
		tx = tx.Where("model_name = ?", modelName)
	}
	var token int
	tx.Where("type = ?", logType).Scan(&token)
	return token
}

func SumUsedQuotaByUserId(logType int, userId string, startTimestamp int64, endTimestamp int64) (int64, error) {
	tx := model.LOG_DB.Table("logs").Select("COALESCE(sum(quota),0)")
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

func MinLogTimestampByUserId(userId string, logTypes []int) (int64, error) {
	tx := model.LOG_DB.Table("logs").Select("COALESCE(min(created_at),0)").
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
	query := `
		SELECT ` + groupSelect + `,
		model_name, count(1) as request_count,
		sum(quota) as quota,
		sum(prompt_tokens) as prompt_tokens,
		sum(completion_tokens) as completion_tokens
		FROM logs
		WHERE type=2
		AND user_id= ?
		AND created_at BETWEEN ? AND ?
	`
	args := []interface{}{userId, start, end}
	if len(models) > 0 {
		query += " AND model_name IN ?"
		args = append(args, models)
	}
	query += `
		GROUP BY day, model_name
		ORDER BY day, model_name
	`
	var stats []*model.LogStatistic
	err := model.LOG_DB.Raw(query, args...).Scan(&stats).Error
	return stats, err
}

func SearchLogModelsByPeriod(userId string, start, end int) ([]string, error) {
	var models []string
	err := model.LOG_DB.Table("logs").
		Where("type = ? AND user_id = ? AND created_at BETWEEN ? AND ?", model.LogTypeConsume, userId, start, end).
		Distinct("model_name").
		Order("model_name").
		Pluck("model_name", &models).Error
	return models, err
}
