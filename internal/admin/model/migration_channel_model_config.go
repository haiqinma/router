package model

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

type legacyChannelModelConfigColumns struct {
	Id              string `gorm:"column:id"`
	Protocol        string `gorm:"column:protocol"`
	ModelMapping    string `gorm:"column:model_mapping"`
	ModelRatio      string `gorm:"column:model_ratio"`
	CompletionRatio string `gorm:"column:completion_ratio"`
}

func (legacyChannelModelConfigColumns) TableName() string {
	return "channels"
}

func migrateChannelModelConfigsWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := tx.AutoMigrate(&ChannelModel{}); err != nil {
		return err
	}
	return syncChannelTestModelsWithDB(tx)
}

func finalizeChannelModelConfigsWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := tx.AutoMigrate(&ChannelModel{}); err != nil {
		return err
	}

	if hasLegacyChannelModelConfigColumns(tx) {
		if err := migrateLegacyChannelModelConfigColumnsWithDB(tx); err != nil {
			return err
		}
	} else {
		if err := normalizeChannelModelRowsWithDB(tx); err != nil {
			return err
		}
	}

	if err := dropLegacyChannelModelConfigColumnsWithDB(tx); err != nil {
		return err
	}
	return syncChannelTestModelsWithDB(tx)
}

func hasLegacyChannelModelConfigColumns(tx *gorm.DB) bool {
	if tx == nil {
		return false
	}
	return tx.Migrator().HasColumn(&legacyChannelModelConfigColumns{}, "model_mapping") ||
		tx.Migrator().HasColumn(&legacyChannelModelConfigColumns{}, "model_ratio") ||
		tx.Migrator().HasColumn(&legacyChannelModelConfigColumns{}, "completion_ratio")
}

func migrateLegacyChannelModelConfigColumnsWithDB(tx *gorm.DB) error {
	legacyRows := make([]legacyChannelModelConfigColumns, 0)
	if err := tx.Model(&legacyChannelModelConfigColumns{}).
		Select("id", "protocol", "model_mapping", "model_ratio", "completion_ratio").
		Find(&legacyRows).Error; err != nil {
		return err
	}

	now := helper.GetTimestamp()
	for _, legacyRow := range legacyRows {
		channelID := strings.TrimSpace(legacyRow.Id)
		if channelID == "" {
			continue
		}
		currentRows, err := listChannelModelRowsByChannelIDWithDB(tx, channelID)
		if err != nil {
			return err
		}
		if len(currentRows) == 0 {
			continue
		}

		legacyChannel := Channel{Protocol: legacyRow.Protocol}
		channelProtocol := legacyChannel.GetChannelProtocol()
		modelMapping := parseChannelStringMapJSON(legacyRow.ModelMapping)
		modelRatio := parseChannelFloatMapJSON(legacyRow.ModelRatio)
		completionRatio := parseChannelFloatMapJSON(legacyRow.CompletionRatio)

		nextRows := make([]ChannelModel, 0, len(currentRows))
		for idx, row := range currentRows {
			normalizeChannelModelRow(&row)
			if row.Model == "" {
				continue
			}
			upstreamModel := row.UpstreamModel
			if mapped := strings.TrimSpace(modelMapping[row.Model]); mapped != "" {
				upstreamModel = mapped
			}
			if upstreamModel == "" {
				upstreamModel = row.Model
			}
			row.UpstreamModel = upstreamModel
			row.InputPrice = resolveLegacyChannelInputPrice(modelRatio, row.Model, upstreamModel, channelProtocol)
			row.OutputPrice = resolveLegacyChannelOutputPrice(completionRatio, row.InputPrice, row.Model, upstreamModel, channelProtocol)
			row.PriceUnit = defaultPriceUnitByType("", upstreamModel)
			row.Currency = ModelProviderPriceCurrencyUSD
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

func normalizeChannelModelRowsWithDB(tx *gorm.DB) error {
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
			normalizeChannelModelRow(&row)
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

func dropLegacyChannelModelConfigColumnsWithDB(tx *gorm.DB) error {
	if tx == nil || !tx.Migrator().HasTable(&legacyChannelModelConfigColumns{}) {
		return nil
	}
	for _, column := range []string{"model_mapping", "model_ratio", "completion_ratio"} {
		if !tx.Migrator().HasColumn(&legacyChannelModelConfigColumns{}, column) {
			continue
		}
		if err := tx.Migrator().DropColumn(&legacyChannelModelConfigColumns{}, column); err != nil {
			return err
		}
	}
	return nil
}

func parseChannelStringMapJSON(raw string) map[string]string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "{}" {
		return nil
	}
	values := make(map[string]string)
	if err := json.Unmarshal([]byte(trimmed), &values); err != nil {
		return nil
	}
	return values
}

func parseChannelFloatMapJSON(raw string) map[string]float64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "{}" {
		return nil
	}
	values := make(map[string]float64)
	if err := json.Unmarshal([]byte(trimmed), &values); err != nil {
		return nil
	}
	return values
}

func resolveLegacyChannelRatioValue(values map[string]float64, modelID string, upstreamModel string, channelProtocol int, completion bool) float64 {
	keys := []string{
		fmt.Sprintf("%s(%d)", strings.TrimSpace(modelID), channelProtocol),
		strings.TrimSpace(modelID),
		fmt.Sprintf("%s(%d)", strings.TrimSpace(upstreamModel), channelProtocol),
		strings.TrimSpace(upstreamModel),
	}
	for _, key := range keys {
		if key == "" {
			continue
		}
		if value, ok := values[key]; ok && value > 0 {
			return value
		}
	}
	if completion {
		return legacyGetCompletionRatio(upstreamModel, channelProtocol)
	}
	return legacyGetModelRatio(upstreamModel, channelProtocol)
}

func resolveLegacyChannelInputPrice(values map[string]float64, modelID string, upstreamModel string, channelProtocol int) *float64 {
	ratio := resolveLegacyChannelRatioValue(values, modelID, upstreamModel, channelProtocol, false)
	modelType := normalizeModelType("", upstreamModel)
	priceUnit := defaultPriceUnitByType(modelType, upstreamModel)
	price := legacyRatioToOriginalPrice(modelType, priceUnit, ratio)
	return cloneNormalizedChannelModelPrice(&price)
}

func resolveLegacyChannelOutputPrice(values map[string]float64, inputPrice *float64, modelID string, upstreamModel string, channelProtocol int) *float64 {
	if inputPrice == nil {
		return nil
	}
	if normalizeModelType("", upstreamModel) != ModelProviderModelTypeText {
		return nil
	}
	completionRatio := resolveLegacyChannelRatioValue(values, modelID, upstreamModel, channelProtocol, true)
	price := *inputPrice * completionRatio
	return cloneNormalizedChannelModelPrice(&price)
}
