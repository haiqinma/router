package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRunVersionedMigrationsRunsOnlyOnce(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}

	executionCount := 0
	migrations := []versionedMigration{
		{
			Version:     "202603030001_test_once",
			Description: "test migration should only run once",
			Up: func(tx *gorm.DB) error {
				executionCount++
				return nil
			},
		},
	}

	if err := runVersionedMigrations(db, "test", migrations); err != nil {
		t.Fatalf("first runVersionedMigrations failed: %v", err)
	}
	if err := runVersionedMigrations(db, "test", migrations); err != nil {
		t.Fatalf("second runVersionedMigrations failed: %v", err)
	}

	if executionCount != 1 {
		t.Fatalf("expected migration to run once, got %d", executionCount)
	}

	var count int64
	if err := db.Model(&SchemaMigration{}).
		Where("scope = ? AND version = ?", "test", "202603030001_test_once").
		Count(&count).Error; err != nil {
		t.Fatalf("query schema_migrations failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 migration record, got %d", count)
	}
}
