package model

import (
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

type legacyChannelModelRatioColumns struct {
	ChannelId       string   `gorm:"column:channel_id"`
	Model           string   `gorm:"column:model"`
	UpstreamModel   string   `gorm:"column:upstream_model"`
	ModelRatio      *float64 `gorm:"column:model_ratio"`
	CompletionRatio *float64 `gorm:"column:completion_ratio"`
}

func (legacyChannelModelRatioColumns) TableName() string {
	return ChannelModelsTableName
}

func migrateChannelModelPriceOverridesWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := tx.AutoMigrate(&ChannelModel{}); err != nil {
		return err
	}
	if hasLegacyChannelModelRatioColumns(tx) {
		if err := backfillChannelModelPriceOverridesWithDB(tx); err != nil {
			return err
		}
		if err := dropLegacyChannelModelRatioColumnsWithDB(tx); err != nil {
			return err
		}
	}
	return normalizeChannelModelPriceOverridesWithDB(tx)
}

func hasLegacyChannelModelRatioColumns(tx *gorm.DB) bool {
	if tx == nil {
		return false
	}
	return tx.Migrator().HasColumn(&legacyChannelModelRatioColumns{}, "model_ratio") ||
		tx.Migrator().HasColumn(&legacyChannelModelRatioColumns{}, "completion_ratio")
}

func backfillChannelModelPriceOverridesWithDB(tx *gorm.DB) error {
	rows := make([]legacyChannelModelRatioColumns, 0)
	if err := tx.Model(&legacyChannelModelRatioColumns{}).
		Select("channel_id", "model", "upstream_model", "model_ratio", "completion_ratio").
		Find(&rows).Error; err != nil {
		return err
	}

	now := helper.GetTimestamp()
	for _, row := range rows {
		channelID := strings.TrimSpace(row.ChannelId)
		modelName := strings.TrimSpace(row.Model)
		upstreamModel := strings.TrimSpace(row.UpstreamModel)
		if channelID == "" || modelName == "" {
			continue
		}
		referenceModel := upstreamModel
		if referenceModel == "" {
			referenceModel = modelName
		}
		modelType := normalizeModelType("", referenceModel)
		priceUnit := defaultPriceUnitByType(modelType, referenceModel)

		updates := map[string]any{
			"price_unit": priceUnit,
			"currency":   ModelProviderPriceCurrencyUSD,
			"updated_at": now,
		}
		if row.ModelRatio != nil {
			inputPrice := legacyRatioToOriginalPrice(modelType, priceUnit, *row.ModelRatio)
			updates["input_price"] = inputPrice
		}
		if row.CompletionRatio != nil && row.ModelRatio != nil && modelType == ModelProviderModelTypeText {
			inputPrice := legacyRatioToOriginalPrice(modelType, priceUnit, *row.ModelRatio)
			updates["output_price"] = inputPrice * *row.CompletionRatio
		}
		if err := tx.Model(&ChannelModel{}).
			Where("channel_id = ? AND model = ?", channelID, modelName).
			Updates(updates).Error; err != nil {
			return err
		}
	}
	return nil
}

func normalizeChannelModelPriceOverridesWithDB(tx *gorm.DB) error {
	channels := make([]Channel, 0)
	if err := tx.Select("id", "protocol").Find(&channels).Error; err != nil {
		return err
	}
	now := helper.GetTimestamp()
	for _, channel := range channels {
		channelID := strings.TrimSpace(channel.Id)
		if channelID == "" {
			continue
		}
		rows, err := listChannelModelRowsByChannelIDWithDB(tx, channelID)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			continue
		}
		nextRows := make([]ChannelModel, 0, len(rows))
		for idx, row := range rows {
			completeChannelModelRowDefaults(&row, channel.GetChannelProtocol())
			if row.SortOrder <= 0 {
				row.SortOrder = idx + 1
			}
			if row.UpdatedAt <= 0 {
				row.UpdatedAt = now
			}
			nextRows = append(nextRows, row)
		}
		if err := ReplaceChannelModelConfigsWithDB(tx, channelID, nextRows); err != nil {
			return err
		}
	}
	return nil
}

func dropLegacyChannelModelRatioColumnsWithDB(tx *gorm.DB) error {
	for _, column := range []string{"model_ratio", "completion_ratio"} {
		if !tx.Migrator().HasColumn(&legacyChannelModelRatioColumns{}, column) {
			continue
		}
		if err := tx.Migrator().DropColumn(&legacyChannelModelRatioColumns{}, column); err != nil {
			return err
		}
	}
	return nil
}
