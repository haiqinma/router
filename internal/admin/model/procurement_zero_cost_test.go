package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newZeroCostProcurementTestDB(t *testing.T) *gorm.DB {
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
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	if err := db.Create(&Channel{Id: "channel-1", Name: "channel-1", Protocol: "openai"}).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if err := db.Create(&ChannelModel{
		ChannelId:     "channel-1",
		Model:         "model-1",
		UpstreamModel: "model-1",
		Provider:      "openai",
		Type:          ProviderModelTypeText,
		Selected:      true,
		PriceUnit:     ProviderPriceUnitPer1KTokens,
		Currency:      ProviderPriceCurrencyUSD,
	}).Error; err != nil {
		t.Fatalf("create channel model: %v", err)
	}
	return db
}

func TestMarkChannelModelZeroCostProcurementMakesReadyAndIsIdempotent(t *testing.T) {
	db := newZeroCostProcurementTestDB(t)
	modelRow := ChannelModel{
		ChannelId: "channel-1",
		Model:     "model-1",
		PriceUnit: ProviderPriceUnitPer1KTokens,
		Currency:  ProviderPriceCurrencyUSD,
	}

	before, err := ResolveChannelModelProcurementReadinessWithDB(db, modelRow)
	if err != nil {
		t.Fatalf("resolve readiness before: %v", err)
	}
	if before.Status != ProcurementReadinessMissing {
		t.Fatalf("before status = %q, want %q", before.Status, ProcurementReadinessMissing)
	}

	created, err := MarkChannelModelZeroCostProcurementWithDB(db, "channel-1", "model-1")
	if err != nil {
		t.Fatalf("mark zero cost: %v", err)
	}
	if len(created) == 0 {
		t.Fatalf("created batches = 0, want at least 1")
	}
	for _, batch := range created {
		if batch.CostSource != ProcurementCostSourceZeroCost {
			t.Fatalf("batch cost source = %q, want %q", batch.CostSource, ProcurementCostSourceZeroCost)
		}
		if batch.CostStatus != ProcurementCostStatusActive {
			t.Fatalf("batch cost status = %q, want %q", batch.CostStatus, ProcurementCostStatusActive)
		}
		if batch.CapacityRemaining <= 0 {
			t.Fatalf("batch capacity remaining = %v, want > 0", batch.CapacityRemaining)
		}
	}

	after, err := ResolveChannelModelProcurementReadinessWithDB(db, modelRow)
	if err != nil {
		t.Fatalf("resolve readiness after: %v", err)
	}
	if after.Status != ProcurementReadinessReady {
		t.Fatalf("after status = %q, want %q", after.Status, ProcurementReadinessReady)
	}

	again, err := MarkChannelModelZeroCostProcurementWithDB(db, "channel-1", "model-1")
	if err != nil {
		t.Fatalf("mark zero cost again: %v", err)
	}
	if len(again) != 0 {
		t.Fatalf("second mark created %d batches, want 0 (idempotent)", len(again))
	}

	var total int64
	if err := db.Model(&ChannelProcurementBatch{}).Where("channel_id = ?", "channel-1").Count(&total).Error; err != nil {
		t.Fatalf("count batches: %v", err)
	}
	if total != int64(len(created)) {
		t.Fatalf("total batches = %d, want %d", total, len(created))
	}
}

func TestMarkChannelModelZeroCostProcurementRejectsUnknownModel(t *testing.T) {
	db := newZeroCostProcurementTestDB(t)
	if _, err := MarkChannelModelZeroCostProcurementWithDB(db, "channel-1", "missing-model"); err == nil {
		t.Fatalf("expected error for unknown model, got nil")
	}
}
