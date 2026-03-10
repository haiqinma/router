package model

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

func ensureCurrentChannelTestingSchemaWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := tx.AutoMigrate(&ChannelModel{}, &ChannelTest{}); err != nil {
		return err
	}
	if err := assignChannelTestRoundsWithDB(tx); err != nil {
		return err
	}
	if err := rebuildChannelTestsPrimaryKeyWithDB(tx); err != nil {
		return err
	}
	if err := syncChannelModelLatestTestsWithDB(tx); err != nil {
		return err
	}
	if tx.Migrator().HasTable("channel_capability_results") {
		if err := tx.Migrator().DropTable("channel_capability_results"); err != nil {
			return err
		}
	}
	if tx.Migrator().HasTable("channel_abilities") {
		if err := tx.Migrator().DropTable("channel_abilities"); err != nil {
			return err
		}
	}
	return nil
}

func assignChannelTestRoundsWithDB(tx *gorm.DB) error {
	rows := make([]ChannelTest, 0)
	if err := tx.Order("channel_id asc, model asc, tested_at asc, sort_order asc, endpoint asc").Find(&rows).Error; err != nil {
		return err
	}
	nextRoundByModel := make(map[string]int64, len(rows))
	for _, row := range rows {
		channelID := strings.TrimSpace(row.ChannelId)
		modelID := strings.TrimSpace(row.Model)
		if channelID == "" || modelID == "" {
			continue
		}
		key := channelID + "::" + modelID
		if row.Round > 0 {
			if row.Round > nextRoundByModel[key] {
				nextRoundByModel[key] = row.Round
			}
			continue
		}
		nextRoundByModel[key]++
		if err := tx.Model(&ChannelTest{}).
			Where("channel_id = ? AND model = ? AND endpoint = ?", channelID, modelID, strings.TrimSpace(row.Endpoint)).
			Update("round", nextRoundByModel[key]).Error; err != nil {
			return err
		}
	}
	return nil
}

func rebuildChannelTestsPrimaryKeyWithDB(tx *gorm.DB) error {
	if err := tx.Exec(`ALTER TABLE channel_tests DROP CONSTRAINT IF EXISTS channel_tests_pkey`).Error; err != nil {
		return err
	}
	if err := tx.Exec(`ALTER TABLE channel_tests ADD PRIMARY KEY (channel_id, model, round)`).Error; err != nil {
		return err
	}
	if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_channel_tests_channel_model_round ON channel_tests (channel_id, model, round DESC)`).Error; err != nil {
		return err
	}
	return nil
}

func syncChannelModelLatestTestsWithDB(tx *gorm.DB) error {
	if err := tx.Exec(`UPDATE channel_models SET test_status = '', test_round = 0, tested_at = 0, latency_ms = 0`).Error; err != nil {
		return err
	}

	rows := make([]ChannelTest, 0)
	if err := tx.Order("channel_id asc, model asc, round desc, tested_at desc, sort_order asc").Find(&rows).Error; err != nil {
		return err
	}
	latestByKey := make(map[string]ChannelTest, len(rows))
	for _, row := range NormalizeChannelTestRows(rows) {
		key := strings.TrimSpace(row.ChannelId) + "::" + strings.TrimSpace(row.Model)
		if key == "::" {
			continue
		}
		if existing, ok := latestByKey[key]; ok {
			if existing.Round > row.Round || (existing.Round == row.Round && existing.TestedAt >= row.TestedAt) {
				continue
			}
		}
		latestByKey[key] = row
	}
	for _, row := range latestByKey {
		if err := tx.Model(&ChannelModel{}).
			Where("channel_id = ? AND model = ?", strings.TrimSpace(row.ChannelId), strings.TrimSpace(row.Model)).
			Updates(map[string]any{
				"type":        normalizeModelType(row.Type, row.Model),
				"endpoint":    NormalizeChannelModelEndpoint(row.Type, row.Endpoint),
				"selected":    row.Supported && NormalizeChannelTestStatus(row.Status) == ChannelTestStatusSupported,
				"test_status": NormalizeChannelTestStatus(row.Status),
				"test_round":  row.Round,
				"tested_at":   row.TestedAt,
				"latency_ms":  row.LatencyMs,
			}).Error; err != nil {
			return err
		}
	}
	return nil
}
