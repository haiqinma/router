package model

import (
	"testing"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newChannelModelListBatchTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ChannelProcurementBatch{}, &ProviderModel{}, &ChannelModelSyncResult{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	return db
}

// TestProcurementReadinessBatchMatchesPerRow guarantees the in-memory batch resolver
// returns exactly what the per-row DB resolver returns across mixed batch states.
func TestProcurementReadinessBatchMatchesPerRow(t *testing.T) {
	db := newChannelModelListBatchTestDB(t)
	now := helper.GetTimestamp()
	batches := []ChannelProcurementBatch{
		{Id: "b-ready", ChannelId: "c1", ScopeType: "model", ScopeValue: "m-ready", CapacityUnit: "token", CapacityRemaining: 1000, CostPerUnitAmount: 0.001, CostSource: ProcurementCostSourceActual, CostStatus: ProcurementCostStatusActive},
		{Id: "b-zero", ChannelId: "c1", ScopeType: "global", CapacityUnit: "token", CapacityRemaining: 500, CostSource: ProcurementCostSourceZeroCost, CostStatus: ProcurementCostStatusActive},
		{Id: "b-expired", ChannelId: "c1", ScopeType: "model", ScopeValue: "m-expired", CapacityUnit: "token", CapacityRemaining: 1000, CostPerUnitAmount: 0.001, CostSource: ProcurementCostSourceActual, CostStatus: ProcurementCostStatusActive, ExpireAt: now - 10},
		{Id: "b-estimated", ChannelId: "c1", ScopeType: "model", ScopeValue: "m-estimated", CapacityUnit: "token", CapacityRemaining: 1000, CostPerUnitAmount: 0.001, CostSource: ProcurementCostSourceEstimated, CostStatus: ProcurementCostStatusActive},
		{Id: "b-mismatch", ChannelId: "c1", ScopeType: "model", ScopeValue: "m-mismatch", CapacityUnit: "request", CapacityRemaining: 1000, CostPerUnitAmount: 0.001, CostSource: ProcurementCostSourceActual, CostStatus: ProcurementCostStatusActive},
	}
	for i := range batches {
		if err := db.Create(&batches[i]).Error; err != nil {
			t.Fatalf("create batch: %v", err)
		}
	}
	channelBatches, err := ListAllChannelProcurementBatchesByChannelIDWithDB(db, "c1")
	if err != nil {
		t.Fatalf("list batches: %v", err)
	}
	rows := []ChannelModel{
		{ChannelId: "c1", Model: "m-ready", PriceUnit: ProviderPriceUnitPer1KTokens, Currency: ProviderPriceCurrencyUSD},
		{ChannelId: "c1", Model: "m-zero", PriceUnit: ProviderPriceUnitPer1KTokens, Currency: ProviderPriceCurrencyUSD},
		{ChannelId: "c1", Model: "m-expired", PriceUnit: ProviderPriceUnitPer1KTokens, Currency: ProviderPriceCurrencyUSD},
		{ChannelId: "c1", Model: "m-estimated", PriceUnit: ProviderPriceUnitPer1KTokens, Currency: ProviderPriceCurrencyUSD},
		{ChannelId: "c1", Model: "m-mismatch", PriceUnit: ProviderPriceUnitPer1KTokens, Currency: ProviderPriceCurrencyUSD},
		{ChannelId: "c1", Model: "m-missing", PriceUnit: ProviderPriceUnitPer1KTokens, Currency: ProviderPriceCurrencyUSD},
	}
	for _, row := range rows {
		want, err := ResolveChannelModelProcurementReadinessWithDB(db, row)
		if err != nil {
			t.Fatalf("per-row readiness %s: %v", row.Model, err)
		}
		got := ResolveChannelModelProcurementReadinessFromChannelBatches(row, channelBatches)
		if got.Status != want.Status || got.Reason != want.Reason || got.Action != want.Action || got.MatchingBatches != want.MatchingBatches {
			t.Fatalf("model %s: batch=%+v want=%+v", row.Model, got, want)
		}
	}
}

// TestEnableBlockBatchMatchesPerRow guarantees the bulk enable-block resolver returns
// the same reason as the per-row DB resolver for every row on a page.
func TestEnableBlockBatchMatchesPerRow(t *testing.T) {
	db := newChannelModelListBatchTestDB(t)
	now := helper.GetTimestamp()
	providerModels := []ProviderModel{
		{Provider: "openai", Model: "gpt-ok", Status: ProviderModelStatusActive, Tags: "llm"},
		{Provider: "openai", Model: "gpt-deprecated", Status: ProviderModelStatusDeprecated, Tags: "llm"},
		{Provider: "openai", Model: "gpt-native", Status: ProviderModelStatusActive, Tags: ProviderModelTagNativeAdapterRequired},
		{Provider: "openai", Model: "gpt-notreturned", Status: ProviderModelStatusActive, Tags: "llm"},
	}
	for i := range providerModels {
		if err := db.Create(&providerModels[i]).Error; err != nil {
			t.Fatalf("create provider model: %v", err)
		}
	}
	syncRows := []ChannelModelSyncResult{
		{ChannelId: "c1", Model: "gpt-ok", UpstreamModel: "gpt-ok", Returned: true, LastSyncedAt: now},
		{ChannelId: "c1", Model: "gpt-notreturned", UpstreamModel: "gpt-notreturned", Returned: false, LastSyncedAt: now},
	}
	for i := range syncRows {
		if err := db.Create(&syncRows[i]).Error; err != nil {
			t.Fatalf("create sync row: %v", err)
		}
	}
	loadedSync, err := ListChannelModelSyncResultsByChannelIDWithDB(db, "c1")
	if err != nil {
		t.Fatalf("list sync: %v", err)
	}
	rows := []ChannelModel{
		{ChannelId: "c1", Model: "gpt-ok", UpstreamModel: "gpt-ok", Provider: "openai"},
		{ChannelId: "c1", Model: "gpt-deprecated", UpstreamModel: "gpt-deprecated", Provider: "openai"},
		{ChannelId: "c1", Model: "gpt-native", UpstreamModel: "gpt-native", Provider: "openai"},
		{ChannelId: "c1", Model: "gpt-notreturned", UpstreamModel: "gpt-notreturned", Provider: "openai"},
		{ChannelId: "c1", Model: "gpt-unknown", UpstreamModel: "gpt-unknown", Provider: "openai"},
	}
	bulk, err := ExplainManualChannelModelEnableBlocksForRows(db, "c1", rows, loadedSync)
	if err != nil {
		t.Fatalf("bulk enable block: %v", err)
	}
	for _, row := range rows {
		want, err := ExplainManualChannelModelEnableBlockWithDB(db, "c1", row)
		if err != nil {
			t.Fatalf("per-row enable block %s: %v", row.Model, err)
		}
		if got := bulk[row.Model]; got != want {
			t.Fatalf("model %s: bulk=%q want=%q", row.Model, got, want)
		}
	}
}
