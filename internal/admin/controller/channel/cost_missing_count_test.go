package channel

import (
	"testing"

	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newCostMissingCountTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.Channel{},
		&model.ChannelModel{},
		&model.ChannelModelEndpoint{},
		&model.ChannelModelEndpointTestResult{},
		&model.ChannelModelPriceComponent{},
		&model.ProviderModel{},
		&model.ProviderModelPriceComponent{},
		&model.ChannelProcurementBatch{},
		&model.ChannelBillingProfile{},
	); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	originalDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = originalDB })
	return db
}

func seedPublishedCostModel(t *testing.T, db *gorm.DB, channelID, name string) {
	t.Helper()
	if err := db.Create(&model.ChannelModel{
		ChannelId:      channelID,
		Model:          name,
		UpstreamModel:  name,
		Provider:       "openai",
		Type:           model.ProviderModelTypeText,
		Selected:       true,
		PublishEnabled: true,
		PublishedAt:    1000,
		PriceUnit:      model.ProviderPriceUnitPer1KTokens,
		Currency:       model.ProviderPriceCurrencyUSD,
	}).Error; err != nil {
		t.Fatalf("create channel model %s: %v", name, err)
	}
}

func TestCountChannelCostMissingModels(t *testing.T) {
	db := newCostMissingCountTestDB(t)
	if err := db.Create(&model.Channel{Id: "channel-1", Name: "channel-1", Protocol: "openai"}).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}
	seedPublishedCostModel(t, db, "channel-1", "model-a")
	seedPublishedCostModel(t, db, "channel-1", "model-b")
	// An unpublished model must never be counted, even without covering cost.
	if err := db.Create(&model.ChannelModel{
		ChannelId:     "channel-1",
		Model:         "model-draft",
		UpstreamModel: "model-draft",
		Provider:      "openai",
		Type:          model.ProviderModelTypeText,
		Selected:      false,
		PriceUnit:     model.ProviderPriceUnitPer1KTokens,
		Currency:      model.ProviderPriceCurrencyUSD,
	}).Error; err != nil {
		t.Fatalf("create draft model: %v", err)
	}

	// untracked: cost is never recorded by design -> nothing missing.
	if got, err := countChannelCostMissingModels("channel-1", model.ChannelCostTrackingModeUntracked); err != nil || got != 0 {
		t.Fatalf("untracked count = %d, err = %v, want 0, nil", got, err)
	}

	// actual with no procurement batches: both published models are missing;
	// the unpublished draft is excluded.
	if got, err := countChannelCostMissingModels("channel-1", model.ChannelCostTrackingModeActual); err != nil || got != 2 {
		t.Fatalf("actual (no batch) count = %d, err = %v, want 2, nil", got, err)
	}

	// Add a global batch that covers the USD capacity-unit equivalent with a real
	// active cost -> both published models become ready.
	if err := db.Create(&model.ChannelProcurementBatch{
		Id:                "batch-1",
		ChannelId:         "channel-1",
		ScopeType:         "global",
		CapacityUnit:      "usd_equivalent",
		CapacityRemaining: 1000,
		CostPerUnitAmount: 0.5,
		CostSource:        model.ProcurementCostSourceActual,
		CostStatus:        model.ProcurementCostStatusActive,
	}).Error; err != nil {
		t.Fatalf("create batch: %v", err)
	}
	if got, err := countChannelCostMissingModels("channel-1", model.ChannelCostTrackingModeActual); err != nil || got != 0 {
		t.Fatalf("actual (covered) count = %d, err = %v, want 0, nil", got, err)
	}

	// free resolves to ready via the same batch path; empty channel id is a no-op.
	if got, err := countChannelCostMissingModels("", model.ChannelCostTrackingModeActual); err != nil || got != 0 {
		t.Fatalf("empty channel count = %d, err = %v, want 0, nil", got, err)
	}
}
