package channel

import (
	"testing"
	"time"

	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newChannelHealthProbeTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.ChannelModel{}, &model.ChannelModelEndpoint{}, &model.ProviderModel{}, &model.ChannelTest{}, &model.Log{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func addHealthProbeEndpointFixture(t *testing.T, db *gorm.DB, channelID string, modelID string, provider string, endpoint string) {
	t.Helper()
	if err := db.Create(&model.ProviderModel{
		Provider:           provider,
		Model:              modelID,
		Tags:               model.ProviderModelTagText,
		SupportedEndpoints: endpoint,
	}).Error; err != nil {
		t.Fatalf("create provider model: %v", err)
	}
	if err := db.Create(&model.ChannelModelEndpoint{
		ChannelId: channelID,
		Model:     modelID,
		Endpoint:  endpoint,
		Enabled:   true,
	}).Error; err != nil {
		t.Fatalf("create channel model endpoint: %v", err)
	}
}

func TestEnqueueDueChannelHealthProbesUsesTrafficAndSilence(t *testing.T) {
	db := newChannelHealthProbeTestDB(t)
	now := int64(1_800_000_000)
	rows := []model.ChannelModel{
		{ChannelId: "recent", Model: "gpt-recent", Type: model.ProviderModelTypeText, Selected: true, PublishEnabled: true, PublishedAt: now - int64(24*time.Hour/time.Second)},
		{ChannelId: "stale", Model: "gpt-stale", Type: model.ProviderModelTypeText, Selected: true, PublishEnabled: true, PublishedAt: now - int64(24*time.Hour/time.Second)},
		{ChannelId: "new", Model: "gpt-new", Type: model.ProviderModelTypeText, Selected: true, PublishEnabled: true, PublishedAt: now - int64(time.Hour/time.Second)},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("create channel models: %v", err)
	}
	addHealthProbeEndpointFixture(t, db, "stale", "gpt-stale", "openai", model.ChannelModelEndpointChat)
	if err := db.Create(&model.Log{Id: "recent-log", Type: model.LogTypeConsume, ChannelId: "recent", RequestModelName: "gpt-recent", CreatedAt: now - 60}).Error; err != nil {
		t.Fatalf("create recent log: %v", err)
	}
	createdTargets := make([]string, 0)
	created, err := enqueueDueChannelHealthProbes(db, db, now, 10, func(channelID string, modelID string, endpoint string) (bool, error) {
		createdTargets = append(createdTargets, channelID+":"+modelID+":"+endpoint)
		return true, nil
	})
	if err != nil {
		t.Fatalf("enqueue probes: %v", err)
	}
	if created != 1 || len(createdTargets) != 1 || createdTargets[0] != "stale:gpt-stale:/v1/chat/completions" {
		t.Fatalf("created=%d targets=%v, want stale target", created, createdTargets)
	}
}

func TestEnqueueDueChannelHealthProbesRetriesFailureAfterBackoff(t *testing.T) {
	db := newChannelHealthProbeTestDB(t)
	now := int64(1_800_000_000)
	row := model.ChannelModel{ChannelId: "failed", Model: "gpt-failed", Type: model.ProviderModelTypeText, Selected: true, PublishEnabled: true, PublishedAt: now - int64(24*time.Hour/time.Second)}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create channel model: %v", err)
	}
	addHealthProbeEndpointFixture(t, db, "failed", "gpt-failed", "openai", model.ChannelModelEndpointChat)
	if err := db.Create(&model.Log{Id: "failed-log", Type: model.LogTypeRelayFailure, ChannelId: "failed", RequestModelName: "gpt-failed", RelayErrorCode: "upstream_unavailable", CreatedAt: now - int64(20*time.Minute/time.Second)}).Error; err != nil {
		t.Fatalf("create failure log: %v", err)
	}
	created, err := enqueueDueChannelHealthProbes(db, db, now, 10, func(channelID string, modelID string, endpoint string) (bool, error) {
		if endpoint != model.ChannelModelEndpointChat {
			t.Fatalf("endpoint=%q, want %q", endpoint, model.ChannelModelEndpointChat)
		}
		return true, nil
	})
	if err != nil {
		t.Fatalf("enqueue probes: %v", err)
	}
	if created != 1 {
		t.Fatalf("created=%d, want 1", created)
	}
}

func TestSelectChannelHealthProbeEndpointUsesEnabledOfficialEndpoint(t *testing.T) {
	db := newChannelHealthProbeTestDB(t)
	row := model.ChannelModel{
		ChannelId:     "qwen-channel",
		Model:         "qwen3.8-omni-flash",
		UpstreamModel: "qwen3.8-omni-flash",
		Provider:      "qwen",
		Type:          model.ProviderModelTypeText,
		Endpoint:      model.ChannelModelEndpointResponses,
	}
	if err := db.Create(&model.ProviderModel{
		Provider:           "qwen",
		Model:              row.Model,
		Tags:               model.ProviderModelTagText,
		SupportedEndpoints: model.ChannelModelEndpointChat,
	}).Error; err != nil {
		t.Fatalf("create provider model: %v", err)
	}
	if err := db.Create(&model.ChannelModelEndpoint{
		ChannelId: "qwen-channel",
		Model:     row.Model,
		Endpoint:  model.ChannelModelEndpointChat,
		Enabled:   true,
	}).Error; err != nil {
		t.Fatalf("create enabled endpoint: %v", err)
	}

	endpoint, err := selectChannelHealthProbeEndpoint(db, row)
	if err != nil {
		t.Fatalf("select endpoint: %v", err)
	}
	if endpoint != model.ChannelModelEndpointChat {
		t.Fatalf("endpoint=%q, want %q", endpoint, model.ChannelModelEndpointChat)
	}
}

func TestSelectChannelHealthProbeEndpointRequiresOfficialIntersection(t *testing.T) {
	db := newChannelHealthProbeTestDB(t)
	row := model.ChannelModel{
		ChannelId:     "qwen-channel",
		Model:         "qwen3.8-omni-flash",
		UpstreamModel: "qwen3.8-omni-flash",
		Provider:      "qwen",
		Type:          model.ProviderModelTypeText,
		Endpoint:      model.ChannelModelEndpointResponses,
	}
	if err := db.Create(&model.ProviderModel{
		Provider:           "qwen",
		Model:              row.Model,
		Tags:               model.ProviderModelTagText,
		SupportedEndpoints: model.ChannelModelEndpointChat,
	}).Error; err != nil {
		t.Fatalf("create provider model: %v", err)
	}
	if err := db.Create(&model.ChannelModelEndpoint{
		ChannelId: "qwen-channel",
		Model:     row.Model,
		Endpoint:  model.ChannelModelEndpointResponses,
		Enabled:   true,
	}).Error; err != nil {
		t.Fatalf("create enabled endpoint: %v", err)
	}

	endpoint, err := selectChannelHealthProbeEndpoint(db, row)
	if err != nil {
		t.Fatalf("select endpoint: %v", err)
	}
	if endpoint != "" {
		t.Fatalf("endpoint=%q, want empty for no official intersection", endpoint)
	}
}

func TestPersistAutomaticProbeDoesNotUpdateEndpointConfiguration(t *testing.T) {
	db := newChannelHealthProbeTestDB(t)
	if err := db.AutoMigrate(&model.Channel{}, &model.ChannelModelPriceComponent{}, &model.ChannelModelEndpointTestResult{}); err != nil {
		t.Fatalf("migrate endpoint test results: %v", err)
	}
	if err := db.Create(&model.Channel{Id: "image-channel", Name: "image-channel"}).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	result := model.ChannelTest{
		ChannelId: "image-channel",
		Model:     "gpt-5.5",
		Endpoint:  model.ChannelModelEndpointResponses,
		Source:    "automatic_probe",
		Status:    model.ChannelTestStatusUnsupported,
		Supported: false,
		TestedAt:  1_800_000_000,
		Message:   "upstream model unavailable",
	}
	if err := persistChannelModelTests("image-channel", "probe-task", []model.ChannelTest{result}); err != nil {
		t.Fatalf("persist automatic probe: %v", err)
	}
	var endpointResult model.ChannelModelEndpointTestResult
	if err := db.First(&endpointResult).Error; err == nil {
		t.Fatal("automatic probe must not create endpoint configuration test result")
	}
	var signal model.ChannelTest
	if err := db.First(&signal, "channel_id = ? AND model = ?", "image-channel", "gpt-5.5").Error; err != nil {
		t.Fatalf("load health signal: %v", err)
	}
	if signal.Source != "automatic_probe" {
		t.Fatalf("signal source=%q, want automatic_probe", signal.Source)
	}
}
