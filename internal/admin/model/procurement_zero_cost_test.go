package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newFreeProcurementTestDB(t *testing.T) *gorm.DB {
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
	if err := db.Create(&Channel{Id: "channel-1", Name: "channel-1", Protocol: "openai"}).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if err := db.Create(&ChannelModel{
		ChannelId:     "channel-1",
		Model:         "model-usd",
		UpstreamModel: "model-usd",
		Provider:      "openai",
		Type:          ProviderModelTypeText,
		Selected:      true,
		PriceUnit:     ProviderPriceUnitPer1KTokens,
		Currency:      ProviderPriceCurrencyUSD,
	}).Error; err != nil {
		t.Fatalf("create channel model usd: %v", err)
	}
	if err := db.Create(&ChannelModel{
		ChannelId:     "channel-1",
		Model:         "model-req",
		UpstreamModel: "model-req",
		Provider:      "openai",
		Type:          ProviderModelTypeText,
		Selected:      true,
		PriceUnit:     ProviderPriceUnitPerRequest,
		Currency:      ProviderPriceCurrencyUSD,
	}).Error; err != nil {
		t.Fatalf("create channel model req: %v", err)
	}
	return db
}

func TestEnsureChannelFreeProcurementBatchesCoversUnionAndIsIdempotent(t *testing.T) {
	db := newFreeProcurementTestDB(t)

	created, err := EnsureChannelFreeProcurementBatchesWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("ensure free batches: %v", err)
	}
	if len(created) == 0 {
		t.Fatalf("created batches = 0, want coverage for the capacity-unit union")
	}
	for _, batch := range created {
		if batch.ScopeType != "global" {
			t.Fatalf("batch scope = %q, want global", batch.ScopeType)
		}
		if batch.SourceRef != ProcurementAutoFreeSourceRef {
			t.Fatalf("batch source ref = %q, want %q", batch.SourceRef, ProcurementAutoFreeSourceRef)
		}
		if batch.CostSource != ProcurementCostSourceZeroCost {
			t.Fatalf("batch cost source = %q, want %q", batch.CostSource, ProcurementCostSourceZeroCost)
		}
		if batch.CostStatus != ProcurementCostStatusActive {
			t.Fatalf("batch cost status = %q, want %q", batch.CostStatus, ProcurementCostStatusActive)
		}
		if batch.CapacityRemaining != ProcurementZeroCostCapacitySentinel {
			t.Fatalf("batch capacity remaining = %v, want sentinel", batch.CapacityRemaining)
		}
	}

	// Every unit needed across both models must be covered so runtime never sees a
	// "missing" candidate for either currency equivalent.
	rows, err := ListChannelModelRowsByChannelIDWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("list model rows: %v", err)
	}
	wantUnits := channelProcurementCapacityUnitUnion(rows)
	existing, err := ListAllChannelProcurementBatchesByChannelIDWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("list batches: %v", err)
	}
	for _, unit := range wantUnits {
		if findAutoFreeGlobalBatchIndex(existing, unit) < 0 {
			t.Fatalf("no auto-free global batch for unit %q", unit)
		}
	}

	again, err := EnsureChannelFreeProcurementBatchesWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("ensure free batches again: %v", err)
	}
	if len(again) != 0 {
		t.Fatalf("second ensure created %d batches, want 0 (idempotent)", len(again))
	}
	var total int64
	if err := db.Model(&ChannelProcurementBatch{}).Where("channel_id = ?", "channel-1").Count(&total).Error; err != nil {
		t.Fatalf("count batches: %v", err)
	}
	if total != int64(len(created)) {
		t.Fatalf("total batches = %d, want %d", total, len(created))
	}
}

func TestCleanupChannelFreeProcurementBatchesLeavesManualBatchesUntouched(t *testing.T) {
	db := newFreeProcurementTestDB(t)

	// A manually-created actual batch and a manual zero-cost batch (no source ref)
	// must survive cleanup.
	manualActual, err := CreateChannelProcurementBatchWithDB(db, ChannelProcurementBatch{
		ChannelId:         "channel-1",
		ScopeType:         "model",
		ScopeValue:        "model-usd",
		CapacityUnit:      "usd_equivalent",
		CapacityTotal:     100,
		CapacityEffective: 100,
		CapacityRemaining: 100,
		CostSource:        ProcurementCostSourceActual,
		CostStatus:        ProcurementCostStatusActive,
		CostPerUnitAmount: 1,
	})
	if err != nil {
		t.Fatalf("create manual actual: %v", err)
	}
	manualZero, err := CreateChannelProcurementBatchWithDB(db, ChannelProcurementBatch{
		ChannelId:         "channel-1",
		ScopeType:         "model",
		ScopeValue:        "model-req",
		CapacityUnit:      "per_request",
		CapacityTotal:     50,
		CapacityEffective: 50,
		CapacityRemaining: 50,
		CostSource:        ProcurementCostSourceZeroCost,
		CostStatus:        ProcurementCostStatusActive,
	})
	if err != nil {
		t.Fatalf("create manual zero: %v", err)
	}

	if _, err := EnsureChannelFreeProcurementBatchesWithDB(db, "channel-1"); err != nil {
		t.Fatalf("ensure free batches: %v", err)
	}
	if err := CleanupChannelFreeProcurementBatchesWithDB(db, "channel-1"); err != nil {
		t.Fatalf("cleanup free batches: %v", err)
	}

	// Auto-free batches disabled.
	var activeAuto int64
	if err := db.Model(&ChannelProcurementBatch{}).
		Where("channel_id = ? AND source_ref = ? AND cost_status = ?", "channel-1", ProcurementAutoFreeSourceRef, ProcurementCostStatusActive).
		Count(&activeAuto).Error; err != nil {
		t.Fatalf("count active auto: %v", err)
	}
	if activeAuto != 0 {
		t.Fatalf("active auto-free batches = %d, want 0 after cleanup", activeAuto)
	}

	// Manual batches untouched.
	for _, id := range []string{manualActual.Id, manualZero.Id} {
		row, err := GetChannelProcurementBatchByIDWithDB(db, id)
		if err != nil {
			t.Fatalf("get manual batch %s: %v", id, err)
		}
		if row.CostStatus != ProcurementCostStatusActive {
			t.Fatalf("manual batch %s status = %q, want active (untouched)", id, row.CostStatus)
		}
	}
}

func TestReconcileChannelCostTrackingModeToggles(t *testing.T) {
	db := newFreeProcurementTestDB(t)

	if err := ReconcileChannelCostTrackingModeWithDB(db, "channel-1", ChannelCostTrackingModeFree); err != nil {
		t.Fatalf("reconcile free: %v", err)
	}
	var active int64
	if err := db.Model(&ChannelProcurementBatch{}).
		Where("channel_id = ? AND source_ref = ? AND cost_status = ?", "channel-1", ProcurementAutoFreeSourceRef, ProcurementCostStatusActive).
		Count(&active).Error; err != nil {
		t.Fatalf("count active: %v", err)
	}
	if active == 0 {
		t.Fatalf("no active auto-free batches after reconcile free")
	}

	if err := ReconcileChannelCostTrackingModeWithDB(db, "channel-1", ChannelCostTrackingModeUntracked); err != nil {
		t.Fatalf("reconcile untracked: %v", err)
	}
	active = 0
	if err := db.Model(&ChannelProcurementBatch{}).
		Where("channel_id = ? AND source_ref = ? AND cost_status = ?", "channel-1", ProcurementAutoFreeSourceRef, ProcurementCostStatusActive).
		Count(&active).Error; err != nil {
		t.Fatalf("count active: %v", err)
	}
	if active != 0 {
		t.Fatalf("active auto-free batches = %d, want 0 after reconcile untracked", active)
	}

	// Re-enabling free reactivates the disabled auto-free batches (no duplicates).
	if err := ReconcileChannelCostTrackingModeWithDB(db, "channel-1", ChannelCostTrackingModeFree); err != nil {
		t.Fatalf("reconcile free again: %v", err)
	}
	var totalAuto int64
	if err := db.Model(&ChannelProcurementBatch{}).
		Where("channel_id = ? AND source_ref = ?", "channel-1", ProcurementAutoFreeSourceRef).
		Count(&totalAuto).Error; err != nil {
		t.Fatalf("count total auto: %v", err)
	}
	active = 0
	if err := db.Model(&ChannelProcurementBatch{}).
		Where("channel_id = ? AND source_ref = ? AND cost_status = ?", "channel-1", ProcurementAutoFreeSourceRef, ProcurementCostStatusActive).
		Count(&active).Error; err != nil {
		t.Fatalf("count active: %v", err)
	}
	if active != totalAuto {
		t.Fatalf("active auto-free = %d, total auto-free = %d; want all reactivated", active, totalAuto)
	}
}

func TestResolveChannelModelProcurementReadinessForModeUntrackedIsSilent(t *testing.T) {
	db := newFreeProcurementTestDB(t)
	rows, err := ListChannelModelRowsByChannelIDWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("list rows: %v", err)
	}
	row := rows[0]

	untracked := ResolveChannelModelProcurementReadinessForMode(row, nil, ChannelCostTrackingModeUntracked)
	if untracked.Status != ProcurementReadinessUntracked {
		t.Fatalf("untracked status = %q, want %q", untracked.Status, ProcurementReadinessUntracked)
	}

	// Free mode with auto-managed coverage resolves to ready.
	if _, err := EnsureChannelFreeProcurementBatchesWithDB(db, "channel-1"); err != nil {
		t.Fatalf("ensure free: %v", err)
	}
	batches, err := ListAllChannelProcurementBatchesByChannelIDWithDB(db, "channel-1")
	if err != nil {
		t.Fatalf("list batches: %v", err)
	}
	free := ResolveChannelModelProcurementReadinessForMode(row, batches, ChannelCostTrackingModeFree)
	if free.Status != ProcurementReadinessReady {
		t.Fatalf("free status = %q, want %q", free.Status, ProcurementReadinessReady)
	}

	// Actual mode with no matching batch stays missing (a real config gap).
	actual := ResolveChannelModelProcurementReadinessForMode(row, nil, ChannelCostTrackingModeActual)
	if actual.Status != ProcurementReadinessMissing {
		t.Fatalf("actual status = %q, want %q", actual.Status, ProcurementReadinessMissing)
	}
}
