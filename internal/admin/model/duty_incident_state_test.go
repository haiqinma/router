package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func openDutyIncidentStateTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&DutyIncidentState{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	return db
}

func TestNormalizeDutyIncidentStatus(t *testing.T) {
	if got := NormalizeDutyIncidentStatus(" Investigating "); got != DutyIncidentStatusInvestigating {
		t.Fatalf("NormalizeDutyIncidentStatus() = %q, want %q", got, DutyIncidentStatusInvestigating)
	}
	if got := NormalizeDutyIncidentStatus("closed"); got != "" {
		t.Fatalf("NormalizeDutyIncidentStatus(closed) = %q, want empty", got)
	}
}

func TestUpsertDutyIncidentStateWithDBPersistsLifecycle(t *testing.T) {
	db := openDutyIncidentStateTestDB(t)
	acknowledged, err := UpsertDutyIncidentStateWithDB(db, "channel:one", DutyIncidentStatusAcknowledged, "user-1", "operator", "checking")
	if err != nil {
		t.Fatalf("acknowledge incident: %v", err)
	}
	if acknowledged.AcknowledgedAt <= 0 || acknowledged.AssigneeUserId != "user-1" || acknowledged.LastNote != "checking" {
		t.Fatalf("unexpected acknowledged state: %+v", acknowledged)
	}

	resolved, err := UpsertDutyIncidentStateWithDB(db, "channel:one", DutyIncidentStatusResolved, "user-1", "operator", "recovered")
	if err != nil {
		t.Fatalf("resolve incident: %v", err)
	}
	if resolved.ResolvedAt <= 0 || resolved.AcknowledgedAt != acknowledged.AcknowledgedAt || resolved.LastNote != "recovered" {
		t.Fatalf("unexpected resolved state: %+v", resolved)
	}

	states, err := ListDutyIncidentStatesByKeysWithDB(db, []string{"channel:one", "channel:one", ""})
	if err != nil {
		t.Fatalf("list incident states: %v", err)
	}
	if len(states) != 1 || states["channel:one"].Status != DutyIncidentStatusResolved {
		t.Fatalf("unexpected incident states: %+v", states)
	}

	reopened, err := UpsertDutyIncidentStateWithDB(db, "channel:one", DutyIncidentStatusActive, "", "", "")
	if err != nil {
		t.Fatalf("reopen incident: %v", err)
	}
	if reopened.ResolvedAt != 0 || reopened.LastNote != "recovered" {
		t.Fatalf("unexpected reopened state: %+v", reopened)
	}
}
