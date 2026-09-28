package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestEnsureEventLogAnalyticsIndexesWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&Log{}); err != nil {
		t.Fatalf("automigrate log: %v", err)
	}
	// Idempotent: safe to run twice.
	for i := 0; i < 2; i++ {
		if err := ensureEventLogAnalyticsIndexesWithDB(db); err != nil {
			t.Fatalf("ensure event log indexes (run %d): %v", i, err)
		}
	}
	names := listSQLiteIndexNames(t, db, EventLogsTableName)
	for _, want := range []string{
		"idx_event_logs_channel_created_at",
		"idx_event_logs_type_created_at",
		"idx_event_logs_user_created_at",
		"idx_event_logs_model_created_at",
	} {
		if _, ok := names[want]; !ok {
			t.Fatalf("expected index %s to exist, got %v", want, names)
		}
	}
}

func TestEnsureTokenSortIndexesWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&Token{}); err != nil {
		t.Fatalf("automigrate token: %v", err)
	}
	for i := 0; i < 2; i++ {
		if err := ensureTokenSortIndexesWithDB(db); err != nil {
			t.Fatalf("ensure token indexes (run %d): %v", i, err)
		}
	}
	names := listSQLiteIndexNames(t, db, APITokensTableName)
	for _, want := range []string{
		"idx_api_tokens_created_time",
		"idx_api_tokens_updated_time",
	} {
		if _, ok := names[want]; !ok {
			t.Fatalf("expected index %s to exist, got %v", want, names)
		}
	}
}

func listSQLiteIndexNames(t *testing.T, db *gorm.DB, table string) map[string]struct{} {
	t.Helper()
	rows := make([]string, 0)
	if err := db.Raw(
		"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?",
		table,
	).Scan(&rows).Error; err != nil {
		t.Fatalf("list indexes: %v", err)
	}
	out := make(map[string]struct{}, len(rows))
	for _, name := range rows {
		out[name] = struct{}{}
	}
	return out
}
