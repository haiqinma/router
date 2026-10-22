package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func openChannelAlertStateTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ChannelAlertState{}); err != nil {
		t.Fatalf("migrate channel alert states: %v", err)
	}
	return db
}

func TestReopenChannelAlertStateClearsPreviousResolution(t *testing.T) {
	db := openChannelAlertStateTestDB(t)
	ref := ChannelAlertStateRef{AlertType: ChannelAlertTypeCircuitBreaker, AlertKey: "alert-1"}
	resolved, err := ResolveChannelAlertStateWithDB(db, ref, "channel-1", "operator-1", "recovered")
	if err != nil {
		t.Fatalf("resolve channel alert: %v", err)
	}
	if resolved.ResolvedAt <= 0 {
		t.Fatalf("resolved_at = %d, want a timestamp", resolved.ResolvedAt)
	}

	reopened, err := ReopenChannelAlertStateWithDB(db, ref, "channel-1", "regressed")
	if err != nil {
		t.Fatalf("reopen channel alert: %v", err)
	}
	if reopened.Status != ChannelAlertStatusActive || reopened.ResolvedAt != 0 || reopened.ResolvedBy != "" {
		t.Fatalf("unexpected reopened state: %+v", reopened)
	}
	if reopened.AcknowledgedAt != 0 || reopened.AcknowledgedBy != "" {
		t.Fatalf("reopened alert retained previous acknowledgement: %+v", reopened)
	}
	if reopened.LastOperatorNote != "regressed" {
		t.Fatalf("last operator note = %q, want the reopen note", reopened.LastOperatorNote)
	}
}
