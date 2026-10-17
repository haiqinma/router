package billing

import (
	"testing"

	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestLoadProcurementReportUnconfiguredModelChannelsAvoidsAmbiguousChannelID(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	statements := []string{
		`CREATE TABLE event_logs (
			id INTEGER PRIMARY KEY,
			type INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			group_id TEXT,
			provider TEXT,
			actual_model_name TEXT,
			model_name TEXT,
			request_model_name TEXT,
			channel_id TEXT
		)`,
		`CREATE TABLE procurement_attributions (
			request_log_id INTEGER,
			channel_id TEXT,
			status TEXT
		)`,
		`CREATE TABLE channels (id TEXT PRIMARY KEY, name TEXT)`,
		`INSERT INTO event_logs (
			id, type, created_at, actual_model_name, channel_id
		) VALUES (1, 2, 150, 'model-a', 'channel-a')`,
		`INSERT INTO channels (id, name) VALUES ('channel-a', 'Channel A')`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("exec %q: %v", statement, err)
		}
	}

	previousDB := model.DB
	previousLogDB := model.LOG_DB
	model.DB = db
	model.LOG_DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
	})

	result := loadProcurementReportUnconfiguredModelChannels(model.ProcurementReportSummary{
		GroupBy: model.ProcurementReportGroupByModel,
		StartAt: 100,
		EndAt:   200,
	})
	channels := result["model-a"]
	if len(channels) != 1 {
		t.Fatalf("channels = %#v, want one result", channels)
	}
	if channels[0].ID != "channel-a" || channels[0].Name != "channel a" || channels[0].RequestCount != 1 {
		t.Fatalf("channel = %#v, want normalized channel-a/channel a with one request", channels[0])
	}
}
