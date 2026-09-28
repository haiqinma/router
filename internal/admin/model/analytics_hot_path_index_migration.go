package model

import (
	"fmt"

	"gorm.io/gorm"
)

// ensureEventLogAnalyticsIndexesWithDB adds composite and expression indexes on
// event_logs that back the admin dashboards / billing reports / log lists. These
// endpoints filter a time window together with channel / type / user / model and
// then group or sort by created_at; without matching indexes Postgres falls back
// to sequential scans that contend with the relay write path on the shared pool.
//
// All statements use CREATE INDEX IF NOT EXISTS so they are idempotent. On a very
// large event_logs table a plain CREATE INDEX holds a write lock for the duration
// of the build; an operator can instead pre-create the same indexes with
// CREATE INDEX CONCURRENTLY before upgrading, after which these calls no-op.
func ensureEventLogAnalyticsIndexesWithDB(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !db.Migrator().HasTable(&Log{}) {
		if err := db.AutoMigrate(&Log{}); err != nil {
			return err
		}
	}
	statements := []string{
		`CREATE INDEX IF NOT EXISTS idx_event_logs_channel_created_at
		 ON event_logs (channel_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_event_logs_type_created_at
		 ON event_logs (type, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_event_logs_user_created_at
		 ON event_logs (user_id, created_at)`,
		// Expression index matching adminVisibleModelNameExpr used by log/billing
		// filters and groupings, paired with created_at for windowed aggregation.
		`CREATE INDEX IF NOT EXISTS idx_event_logs_model_created_at
		 ON event_logs ((COALESCE(NULLIF(TRIM(request_model_name), ''), NULLIF(TRIM(model_name), ''))), created_at)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureTokenSortIndexesWithDB adds btree indexes on the token list sort columns
// so the admin/personal token listings order by created_time / updated_time
// without a full-table sort.
func ensureTokenSortIndexesWithDB(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !db.Migrator().HasTable(&Token{}) {
		if err := db.AutoMigrate(&Token{}); err != nil {
			return err
		}
	}
	statements := []string{
		`CREATE INDEX IF NOT EXISTS idx_api_tokens_created_time
		 ON api_tokens (created_time)`,
		`CREATE INDEX IF NOT EXISTS idx_api_tokens_updated_time
		 ON api_tokens (updated_time)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}
