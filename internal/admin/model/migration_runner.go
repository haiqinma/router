package model

import (
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"gorm.io/gorm"
)

const (
	migrationScopeMain = "main"
	migrationScopeLog  = "log"
)

// SchemaMigration records Flyway-style versioned migrations.
type SchemaMigration struct {
	Scope       string `gorm:"primaryKey;type:varchar(32)"`
	Version     string `gorm:"primaryKey;type:varchar(128)"`
	Description string `gorm:"type:varchar(255);default:''"`
	AppliedAt   int64  `gorm:"index"`
}

func (SchemaMigration) TableName() string {
	return "schema_migrations"
}

type versionedMigration struct {
	Version     string
	Description string
	Up          func(tx *gorm.DB) error
}

func runMainVersionedMigrations(db *gorm.DB) error {
	migrations := []versionedMigration{
		{
			Version:     "202603071000_main_baseline_v3",
			Description: "baseline: create current main schema, normalize log trace_id, drop legacy objects, and seed current catalogs",
			Up: func(tx *gorm.DB) error {
				return runMainBaselineMigrationWithDB(tx)
			},
		},
		{
			Version:     "202603071130_channel_model_configs_v1",
			Description: "expand channel_models with upstream model aliases and per-model ratios",
			Up: func(tx *gorm.DB) error {
				return migrateChannelModelConfigsWithDB(tx)
			},
		},
		{
			Version:     "202603071210_channel_model_configs_finalize_v1",
			Description: "finalize channel_models as the single source of channel model mapping and ratios",
			Up: func(tx *gorm.DB) error {
				return finalizeChannelModelConfigsWithDB(tx)
			},
		},
		{
			Version:     "202603071530_group_billing_ratio_v1",
			Description: "add billing_ratio to groups and backfill from legacy GroupRatio option",
			Up: func(tx *gorm.DB) error {
				return migrateGroupBillingRatioWithDB(tx)
			},
		},
		{
			Version:     "202603071700_channel_model_price_overrides_v1",
			Description: "convert channel model ratios to explicit price override fields",
			Up: func(tx *gorm.DB) error {
				return migrateChannelModelPriceOverridesWithDB(tx)
			},
		},
		{
			Version:     "202603071830_drop_legacy_pricing_options_v1",
			Description: "drop deprecated ModelRatio, CompletionRatio and GroupRatio options",
			Up: func(tx *gorm.DB) error {
				return dropLegacyPricingOptionsWithDB(tx)
			},
		},
	}
	return runVersionedMigrations(db, migrationScopeMain, migrations)
}

func runLogVersionedMigrations(db *gorm.DB) error {
	migrations := []versionedMigration{
		{
			Version:     "202603071001_log_baseline_v2",
			Description: "baseline: create current log schema and normalize trace_id",
			Up: func(tx *gorm.DB) error {
				return runLogBaselineMigrationWithDB(tx)
			},
		},
	}
	return runVersionedMigrations(db, migrationScopeLog, migrations)
}

func runVersionedMigrations(db *gorm.DB, scope string, migrations []versionedMigration) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if strings.TrimSpace(scope) == "" {
		return fmt.Errorf("migration scope cannot be empty")
	}
	// Run migrations without prepared statements. Schema changes can invalidate
	// cached plans for queries such as SELECT *, especially when columns are dropped.
	migrationDB := db.Session(&gorm.Session{
		NewDB:       true,
		PrepareStmt: false,
	})
	if err := migrationDB.AutoMigrate(&SchemaMigration{}); err != nil {
		return err
	}

	applied := make([]SchemaMigration, 0)
	if err := migrationDB.Where("scope = ?", scope).Find(&applied).Error; err != nil {
		return err
	}
	appliedSet := make(map[string]struct{}, len(applied))
	for _, item := range applied {
		appliedSet[item.Version] = struct{}{}
	}

	for _, migration := range migrations {
		if migration.Up == nil {
			return fmt.Errorf("migration %s has nil up function", migration.Version)
		}
		if _, ok := appliedSet[migration.Version]; ok {
			continue
		}

		logger.SysLogf("migration[%s] applying %s (%s)", scope, migration.Version, migration.Description)
		err := migrationDB.Transaction(func(tx *gorm.DB) error {
			if err := migration.Up(tx); err != nil {
				return err
			}
			record := SchemaMigration{
				Scope:       scope,
				Version:     migration.Version,
				Description: migration.Description,
				AppliedAt:   helper.GetTimestamp(),
			}
			return tx.Create(&record).Error
		})
		if err != nil {
			return fmt.Errorf("migration[%s] failed at %s: %w", scope, migration.Version, err)
		}
		logger.SysLogf("migration[%s] applied %s", scope, migration.Version)
	}
	return nil
}
