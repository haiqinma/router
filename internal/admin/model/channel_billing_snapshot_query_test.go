package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newChannelBillingSnapshotQueryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ChannelBillingSnapshot{}); err != nil {
		t.Fatalf("auto migrate snapshot: %v", err)
	}
	return db
}

func TestGetLatestChannelBillingSnapshotCreatedAtByStatusWithDB(t *testing.T) {
	db := newChannelBillingSnapshotQueryTestDB(t)
	rows := []ChannelBillingSnapshot{
		{Id: "1", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "failed", CreatedAt: 100},
		{Id: "2", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 200},
		{Id: "3", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 300},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed snapshots: %v", err)
	}
	got, err := GetLatestChannelBillingSnapshotCreatedAtByStatusWithDB(db, "channel-1", ChannelBillingSnapshotSourceAPI, "ok")
	if err != nil {
		t.Fatalf("GetLatestChannelBillingSnapshotCreatedAtByStatusWithDB returned error: %v", err)
	}
	if got != 300 {
		t.Fatalf("latest created_at = %d, want 300", got)
	}
}

func TestGetEarliestChannelBillingSnapshotCreatedAtByStatusAfterWithDB(t *testing.T) {
	db := newChannelBillingSnapshotQueryTestDB(t)
	rows := []ChannelBillingSnapshot{
		{Id: "1", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "failed", CreatedAt: 100},
		{Id: "2", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "failed", CreatedAt: 200},
		{Id: "3", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "failed", CreatedAt: 300},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed snapshots: %v", err)
	}
	got, err := GetEarliestChannelBillingSnapshotCreatedAtByStatusAfterWithDB(db, "channel-1", ChannelBillingSnapshotSourceAPI, "failed", 150)
	if err != nil {
		t.Fatalf("GetEarliestChannelBillingSnapshotCreatedAtByStatusAfterWithDB returned error: %v", err)
	}
	if got != 200 {
		t.Fatalf("earliest created_at after threshold = %d, want 200", got)
	}
}

func TestListLatestChannelBillingSnapshotsByChannelIDsWithDB(t *testing.T) {
	db := newChannelBillingSnapshotQueryTestDB(t)
	rows := []ChannelBillingSnapshot{
		{Id: "a1", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 100},
		{Id: "a2", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 300},
		{Id: "a3", ChannelId: "channel-1", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 200},
		// 同 created_at 时以 id 降序取最新。
		{Id: "b1", ChannelId: "channel-2", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 500},
		{Id: "b2", ChannelId: "channel-2", SourceType: ChannelBillingSnapshotSourceAPI, RawStatus: "ok", CreatedAt: 500},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed snapshots: %v", err)
	}
	latest, err := ListLatestChannelBillingSnapshotsByChannelIDsWithDB(db, []string{"channel-1", "channel-2", "channel-missing"})
	if err != nil {
		t.Fatalf("ListLatestChannelBillingSnapshotsByChannelIDsWithDB returned error: %v", err)
	}
	byChannel := make(map[string]ChannelBillingSnapshot, len(latest))
	for _, row := range latest {
		byChannel[row.ChannelId] = row
	}
	if len(latest) != 2 {
		t.Fatalf("latest rows = %d, want 2 (%+v)", len(latest), latest)
	}
	if got := byChannel["channel-1"].Id; got != "a2" {
		t.Fatalf("channel-1 latest id = %q, want a2", got)
	}
	if got := byChannel["channel-2"].Id; got != "b2" {
		t.Fatalf("channel-2 latest id = %q, want b2 (id desc tiebreak)", got)
	}
}
