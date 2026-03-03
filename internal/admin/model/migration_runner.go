package model

import (
	"fmt"
	"sort"
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
			Version:     "202603030001_model_provider_catalog",
			Description: "normalize and migrate model provider catalog",
			Up: func(tx *gorm.DB) error {
				return runModelProviderMigrationsWithDB(tx)
			},
		},
		{
			Version:     "202603030002_redemptions_postgres_sequence",
			Description: "ensure redemptions id sequence for PostgreSQL",
			Up:          ensureRedemptionsPostgresSequence,
		},
	}
	return runVersionedMigrations(db, migrationScopeMain, migrations)
}

func runLogVersionedMigrations(db *gorm.DB) error {
	migrations := []versionedMigration{
		{
			Version:     "202603030001_logs_postgres_sequence",
			Description: "ensure logs id sequence for PostgreSQL",
			Up:          ensureLogsPostgresSequence,
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
	if err := db.AutoMigrate(&SchemaMigration{}); err != nil {
		return err
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	applied := make([]SchemaMigration, 0)
	if err := db.Where("scope = ?", scope).Find(&applied).Error; err != nil {
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
		err := db.Transaction(func(tx *gorm.DB) error {
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

func ensureRedemptionsPostgresSequence(tx *gorm.DB) error {
	if tx.Dialector.Name() != "postgres" {
		return nil
	}
	statements := []string{
		"CREATE SEQUENCE IF NOT EXISTS redemptions_id_seq OWNED BY redemptions.id",
		"SELECT setval('redemptions_id_seq', COALESCE((SELECT MAX(id)+1 FROM redemptions),1), false)",
		"ALTER TABLE redemptions ALTER COLUMN id SET DEFAULT nextval('redemptions_id_seq')",
	}
	for _, stmt := range statements {
		if err := tx.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

func ensureLogsPostgresSequence(tx *gorm.DB) error {
	if tx.Dialector.Name() != "postgres" {
		return nil
	}
	statements := []string{
		"CREATE SEQUENCE IF NOT EXISTS logs_id_seq OWNED BY logs.id",
		"SELECT setval('logs_id_seq', COALESCE((SELECT MAX(id)+1 FROM logs),1), false)",
		"ALTER TABLE logs ALTER COLUMN id SET DEFAULT nextval('logs_id_seq')",
	}
	for _, stmt := range statements {
		if err := tx.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}
