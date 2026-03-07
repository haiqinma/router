package model

import (
	"fmt"
	"strings"

	relaychannel "github.com/yeying-community/router/internal/relay/channel"
	"gorm.io/gorm"
)

func runMainBaselineMigrationWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}

	if err := tx.AutoMigrate(
		&User{},
		&Channel{},
		&ChannelModel{},
		&ChannelCapabilityResult{},
		&Token{},
		&Redemption{},
		&Ability{},
		&Option{},
		&ModelProvider{},
		&ModelProviderModel{},
		&ChannelProtocolCatalog{},
		&GroupCatalog{},
	); err != nil {
		return err
	}
	if err := ensureLogTraceIDColumnWithDB(tx); err != nil {
		return err
	}
	if err := tx.AutoMigrate(&Log{}); err != nil {
		return err
	}

	if err := cleanupMainSchemaWithDB(tx); err != nil {
		return err
	}

	if err := syncChannelProtocolsWithDB(tx); err != nil {
		return err
	}
	if err := syncChannelProtocolCatalogWithDB(tx); err != nil {
		return err
	}
	if err := syncModelProviderCatalogWithDB(tx); err != nil {
		return err
	}
	return syncChannelTestModelsWithDB(tx)
}

type legacyModelProviderSchema struct{}

func (legacyModelProviderSchema) TableName() string {
	return "providers"
}

type legacyChannelCapabilityResult struct{}

func (legacyChannelCapabilityResult) TableName() string {
	return ChannelCapabilityResultsTableName
}

func cleanupMainSchemaWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := dropLegacyMainTablesWithDB(tx); err != nil {
		return err
	}
	if err := dropLegacyProviderColumnsWithDB(tx); err != nil {
		return err
	}
	return reconcileChannelCapabilityResultsWithDB(tx)
}

func dropLegacyMainTablesWithDB(tx *gorm.DB) error {
	for _, tableName := range []string{
		"channel_capability_profiles",
		"client_profiles",
	} {
		if tx.Migrator().HasTable(tableName) {
			if err := tx.Migrator().DropTable(tableName); err != nil {
				return err
			}
		}
	}
	return nil
}

func dropLegacyProviderColumnsWithDB(tx *gorm.DB) error {
	if !tx.Migrator().HasTable("providers") {
		return nil
	}
	if tx.Migrator().HasColumn(&legacyModelProviderSchema{}, "api_key") {
		if err := tx.Migrator().DropColumn(&legacyModelProviderSchema{}, "api_key"); err != nil {
			return err
		}
	}
	return nil
}

func reconcileChannelCapabilityResultsWithDB(tx *gorm.DB) error {
	if !tx.Migrator().HasTable(ChannelCapabilityResultsTableName) {
		return nil
	}
	needsRebuild := tx.Migrator().HasColumn(&legacyChannelCapabilityResult{}, "client_profile") ||
		tx.Migrator().HasColumn(&legacyChannelCapabilityResult{}, "user_agent")
	if !needsRebuild {
		var count int64
		if err := tx.Table(ChannelCapabilityResultsTableName).
			Where("LOWER(BTRIM(capability)) LIKE ?", "responses:%").
			Count(&count).Error; err != nil {
			return err
		}
		needsRebuild = count > 0
	}
	if !needsRebuild {
		return nil
	}

	const tempTable = "channel_capability_results_v2"
	if err := tx.Exec(`DROP TABLE IF EXISTS ` + tempTable).Error; err != nil {
		return err
	}
	if err := tx.Exec(`
CREATE TABLE channel_capability_results_v2 (
	channel_id char(36) NOT NULL,
	capability varchar(128) NOT NULL,
	label varchar(255),
	endpoint varchar(255),
	model varchar(255),
	status varchar(32),
	supported boolean NOT NULL DEFAULT false,
	message text,
	latency_ms bigint,
	sort_order bigint DEFAULT 0,
	tested_at bigint,
	PRIMARY KEY (channel_id, capability)
)`).Error; err != nil {
		return err
	}

	if err := tx.Exec(`
INSERT INTO channel_capability_results_v2 (
	channel_id,
	capability,
	label,
	endpoint,
	model,
	status,
	supported,
	message,
	latency_ms,
	sort_order,
	tested_at
)
SELECT DISTINCT ON (channel_id, capability)
	channel_id,
	capability,
	label,
	endpoint,
	model,
	status,
	supported,
	message,
	latency_ms,
	sort_order,
	tested_at
FROM (
	SELECT
		BTRIM(channel_id) AS channel_id,
		CASE
			WHEN POSITION('responses:' IN LOWER(BTRIM(capability))) = 1 THEN 'responses'
			ELSE LOWER(BTRIM(capability))
		END AS capability,
		CASE
			WHEN POSITION('responses:' IN LOWER(BTRIM(capability))) = 1 THEN 'Responses'
			ELSE BTRIM(label)
		END AS label,
		CASE
			WHEN POSITION('responses:' IN LOWER(BTRIM(capability))) = 1 THEN '/v1/responses'
			ELSE BTRIM(endpoint)
		END AS endpoint,
		BTRIM(model) AS model,
		CASE
			WHEN LOWER(BTRIM(status)) = 'supported' THEN 'supported'
			WHEN LOWER(BTRIM(status)) = 'skipped' THEN 'skipped'
			ELSE 'unsupported'
		END AS status,
		(COALESCE(supported, false) OR LOWER(BTRIM(status)) = 'supported') AS supported,
		BTRIM(message) AS message,
		latency_ms,
		COALESCE(sort_order, 0) AS sort_order,
		COALESCE(tested_at, 0) AS tested_at,
		CASE
			WHEN COALESCE(supported, false) OR LOWER(BTRIM(status)) = 'supported' THEN 0
			WHEN LOWER(BTRIM(status)) = 'skipped' THEN 1
			ELSE 2
		END AS priority
	FROM channel_capability_results
	WHERE BTRIM(channel_id) <> '' AND BTRIM(capability) <> ''
) AS normalized
ORDER BY
	channel_id,
	capability,
	priority ASC,
	tested_at DESC,
	sort_order ASC`).Error; err != nil {
		return err
	}

	if err := tx.Exec(`DROP TABLE ` + ChannelCapabilityResultsTableName).Error; err != nil {
		return err
	}
	if err := tx.Exec(`ALTER TABLE ` + tempTable + ` RENAME TO ` + ChannelCapabilityResultsTableName).Error; err != nil {
		return err
	}
	if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_channel_capability_results_channel_id ON ` + ChannelCapabilityResultsTableName + ` (channel_id)`).Error; err != nil {
		return err
	}
	if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_channel_capability_results_status ON ` + ChannelCapabilityResultsTableName + ` (status)`).Error; err != nil {
		return err
	}
	return tx.Exec(`CREATE INDEX IF NOT EXISTS idx_channel_capability_results_tested_at ON ` + ChannelCapabilityResultsTableName + ` (tested_at)`).Error
}

func runLogBaselineMigrationWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := ensureLogTraceIDColumnWithDB(tx); err != nil {
		return err
	}
	return tx.AutoMigrate(&Log{})
}

type legacyLogRequestIDColumn struct {
	RequestID string `gorm:"column:request_id"`
}

func (legacyLogRequestIDColumn) TableName() string {
	return "logs"
}

func ensureLogTraceIDColumnWithDB(tx *gorm.DB) error {
	if tx == nil || !tx.Migrator().HasTable(&Log{}) {
		return nil
	}

	hasRequestID := tx.Migrator().HasColumn(&legacyLogRequestIDColumn{}, "RequestID")
	hasTraceID := tx.Migrator().HasColumn(&Log{}, "TraceID")
	if hasRequestID && !hasTraceID {
		if err := tx.Exec(`ALTER TABLE logs RENAME COLUMN request_id TO trace_id`).Error; err != nil {
			return err
		}
	}
	return nil
}

func syncChannelProtocolsWithDB(tx *gorm.DB) error {
	rows := make([]Channel, 0)
	if err := tx.Select("id", "protocol").Find(&rows).Error; err != nil {
		return err
	}

	for _, row := range rows {
		normalized := relaychannel.NormalizeProtocolName(row.Protocol)
		if normalized == "" {
			normalized = "openai"
		}
		current := strings.TrimSpace(strings.ToLower(row.Protocol))
		if current == normalized {
			continue
		}
		if err := tx.Model(&Channel{}).
			Where("id = ?", row.Id).
			Update("protocol", normalized).Error; err != nil {
			return err
		}
	}
	return nil
}

func syncChannelTestModelsWithDB(db *gorm.DB) error {
	channels := make([]Channel, 0)
	if err := db.Select("id").Find(&channels).Error; err != nil {
		return err
	}

	for _, channel := range channels {
		if err := EnsureChannelTestModelWithDB(db, channel.Id); err != nil {
			return err
		}
	}
	return nil
}
