package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newCostTrackingModeTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&Channel{},
		&ChannelModel{},
		&ChannelModelEndpoint{},
		&ChannelModelEndpointTestResult{},
		&ChannelModelPriceComponent{},
		&ProviderModel{},
		&ChannelProcurementBatch{},
		&ChannelBillingProfile{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func TestNormalizeChannelCostTrackingMode(t *testing.T) {
	cases := map[string]string{
		"":                               ChannelCostTrackingModeUntracked,
		"nonsense":                       ChannelCostTrackingModeUntracked,
		ChannelCostTrackingModeUntracked: ChannelCostTrackingModeUntracked,
		ChannelCostTrackingModeFree:      ChannelCostTrackingModeFree,
		ChannelCostTrackingModeActual:    ChannelCostTrackingModeActual,
	}
	for input, want := range cases {
		if got := NormalizeChannelCostTrackingMode(input); got != want {
			t.Fatalf("NormalizeChannelCostTrackingMode(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSaveChannelBillingProfileRoundTripsCostTrackingMode(t *testing.T) {
	db := newCostTrackingModeTestDB(t)
	if err := db.Create(&Channel{Id: "channel-1", Name: "channel-1", Protocol: "openai"}).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}

	saved, err := SaveChannelBillingProfileWithDB(db, ChannelBillingProfile{
		ChannelId:        "channel-1",
		BillingSource:    ChannelBillingSourceManual,
		CostTrackingMode: ChannelCostTrackingModeFree,
	})
	if err != nil {
		t.Fatalf("save profile: %v", err)
	}
	if saved.CostTrackingMode != ChannelCostTrackingModeFree {
		t.Fatalf("saved mode = %q, want %q", saved.CostTrackingMode, ChannelCostTrackingModeFree)
	}

	mode, err := GetChannelCostTrackingModeWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("get mode: %v", err)
	}
	if mode != ChannelCostTrackingModeFree {
		t.Fatalf("read mode = %q, want %q", mode, ChannelCostTrackingModeFree)
	}

	// Empty/invalid mode normalizes to untracked on save.
	saved2, err := SaveChannelBillingProfileWithDB(db, ChannelBillingProfile{
		ChannelId:     "channel-1",
		BillingSource: ChannelBillingSourceManual,
	})
	if err != nil {
		t.Fatalf("save profile 2: %v", err)
	}
	if saved2.CostTrackingMode != ChannelCostTrackingModeUntracked {
		t.Fatalf("saved2 mode = %q, want %q", saved2.CostTrackingMode, ChannelCostTrackingModeUntracked)
	}
}

func TestGetChannelCostTrackingModeDefaultsToUntracked(t *testing.T) {
	db := newCostTrackingModeTestDB(t)
	mode, err := GetChannelCostTrackingModeWithDB(db, "no-profile")
	if err != nil {
		t.Fatalf("get mode: %v", err)
	}
	if mode != ChannelCostTrackingModeUntracked {
		t.Fatalf("mode = %q, want %q", mode, ChannelCostTrackingModeUntracked)
	}
}

func TestBackfillChannelCostTrackingModeDerivesAndIsIdempotent(t *testing.T) {
	db := newCostTrackingModeTestDB(t)

	// channel-actual has a real cost batch → actual.
	if _, err := CreateChannelProcurementBatchWithDB(db, ChannelProcurementBatch{
		ChannelId:         "channel-actual",
		ScopeType:         "model",
		ScopeValue:        "m",
		CapacityUnit:      "token",
		CapacityTotal:     100,
		CapacityEffective: 100,
		CapacityRemaining: 100,
		CostSource:        ProcurementCostSourceActual,
		CostStatus:        ProcurementCostStatusActive,
		CostPerUnitAmount: 1,
	}); err != nil {
		t.Fatalf("create actual batch: %v", err)
	}

	// channel-free has only a legacy per-model zero-cost sentinel batch (no source ref) → free.
	legacy, err := CreateChannelProcurementBatchWithDB(db, ChannelProcurementBatch{
		ChannelId:         "channel-free",
		ScopeType:         "model",
		ScopeValue:        "m",
		CapacityUnit:      "token",
		CapacityTotal:     ProcurementZeroCostCapacitySentinel,
		CapacityEffective: ProcurementZeroCostCapacitySentinel,
		CapacityRemaining: ProcurementZeroCostCapacitySentinel,
		CostSource:        ProcurementCostSourceZeroCost,
		CostStatus:        ProcurementCostStatusActive,
	})
	if err != nil {
		t.Fatalf("create legacy zero batch: %v", err)
	}

	run := func() {
		if err := backfillChannelCostTrackingModeWithDB(db); err != nil {
			t.Fatalf("backfill: %v", err)
		}
	}
	run()
	run() // idempotent

	assertMode := func(channelID, want string) {
		got, err := GetChannelCostTrackingModeWithDB(db, channelID)
		if err != nil {
			t.Fatalf("get mode %s: %v", channelID, err)
		}
		if got != want {
			t.Fatalf("channel %s mode = %q, want %q", channelID, got, want)
		}
	}
	assertMode("channel-actual", ChannelCostTrackingModeActual)
	assertMode("channel-free", ChannelCostTrackingModeFree)

	// Legacy sentinel got re-tagged under auto-free management.
	retagged, err := GetChannelProcurementBatchByIDWithDB(db, legacy.Id)
	if err != nil {
		t.Fatalf("get legacy batch: %v", err)
	}
	if retagged.SourceRef != ProcurementAutoFreeSourceRef {
		t.Fatalf("legacy source ref = %q, want %q", retagged.SourceRef, ProcurementAutoFreeSourceRef)
	}

	// Only one profile row per channel after two runs.
	var freeProfiles int64
	if err := db.Model(&ChannelBillingProfile{}).Where("channel_id = ?", "channel-free").Count(&freeProfiles).Error; err != nil {
		t.Fatalf("count profiles: %v", err)
	}
	if freeProfiles != 1 {
		t.Fatalf("free profiles = %d, want 1 (idempotent)", freeProfiles)
	}
}
