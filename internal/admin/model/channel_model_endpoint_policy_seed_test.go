package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newChannelEndpointPolicySeedTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ChannelModelEndpoint{}, &ChannelModelEndpointPolicy{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	// Mirror the production migration's unique index so OnConflict resolves.
	if err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uniq_channel_model_endpoint_policy
		ON channel_model_endpoint_policies (channel_id, model, endpoint, template_key)
	`).Error; err != nil {
		t.Fatalf("create unique index: %v", err)
	}
	return db
}

func seedTestChannelEndpoints(t *testing.T, db *gorm.DB, rows []ChannelModelEndpoint) {
	t.Helper()
	if len(rows) == 0 {
		return
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("create endpoints: %v", err)
	}
}

func TestSeedChannelDefaultEndpointPoliciesCoversAllDeclaredEndpoints(t *testing.T) {
	db := newChannelEndpointPolicySeedTestDB(t)
	seedTestChannelEndpoints(t, db, []ChannelModelEndpoint{
		{ChannelId: "chan-1", Model: "gpt-4o", Endpoint: ChannelModelEndpointChat, Enabled: true},
		{ChannelId: "chan-1", Model: "gpt-4o", Endpoint: ChannelModelEndpointEmbeddings, Enabled: false},
		{ChannelId: "chan-1", Model: "claude-3", Endpoint: ChannelModelEndpointMessages, Enabled: true},
	})

	if err := SeedChannelDefaultEndpointPoliciesWithDB(db, "chan-1"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	rows, err := ListChannelModelEndpointPoliciesByChannelIDWithDB(db, "chan-1", "", "")
	if err != nil {
		t.Fatalf("list policies: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("expected 3 seeded policies, got %d", len(rows))
	}
	for _, row := range rows {
		if !row.Enabled {
			t.Fatalf("seeded policy %s/%s should be enabled", row.Model, row.Endpoint)
		}
		if row.TemplateKey != ChannelEndpointPolicyTemplateImageURLToBase64 {
			t.Fatalf("unexpected template key %q", row.TemplateKey)
		}
		if row.Source != ChannelEndpointPolicySourceAutoDefault {
			t.Fatalf("unexpected source %q", row.Source)
		}
		requestPolicy, parseErr := row.ParseRequestPolicy()
		if parseErr != nil {
			t.Fatalf("parse request policy: %v", parseErr)
		}
		if len(requestPolicy.Actions) != 1 || requestPolicy.Actions[0].Type != ChannelEndpointPolicyActionImageURLToBase64 {
			t.Fatalf("unexpected request policy actions: %+v", requestPolicy.Actions)
		}
	}
}

func TestSeedChannelDefaultEndpointPoliciesIsIdempotentAndPreservesManualEdits(t *testing.T) {
	db := newChannelEndpointPolicySeedTestDB(t)
	seedTestChannelEndpoints(t, db, []ChannelModelEndpoint{
		{ChannelId: "chan-1", Model: "gpt-4o", Endpoint: ChannelModelEndpointChat, Enabled: true},
	})

	if err := SeedChannelDefaultEndpointPoliciesWithDB(db, "chan-1"); err != nil {
		t.Fatalf("first seed: %v", err)
	}
	// Simulate the operator disabling the auto-seeded policy.
	if err := db.Model(&ChannelModelEndpointPolicy{}).
		Where("channel_id = ? AND model = ? AND endpoint = ?", "chan-1", "gpt-4o", ChannelModelEndpointChat).
		Update("enabled", false).Error; err != nil {
		t.Fatalf("disable policy: %v", err)
	}

	if err := SeedChannelDefaultEndpointPoliciesWithDB(db, "chan-1"); err != nil {
		t.Fatalf("second seed: %v", err)
	}

	rows, err := ListChannelModelEndpointPoliciesByChannelIDWithDB(db, "chan-1", "", "")
	if err != nil {
		t.Fatalf("list policies: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 policy after re-seed, got %d", len(rows))
	}
	if rows[0].Enabled {
		t.Fatalf("re-seed must not resurrect a manually disabled policy")
	}
}

func TestSeedChannelDefaultEndpointPoliciesNoEndpointsNoRows(t *testing.T) {
	db := newChannelEndpointPolicySeedTestDB(t)
	if err := SeedChannelDefaultEndpointPoliciesWithDB(db, "chan-empty"); err != nil {
		t.Fatalf("seed: %v", err)
	}
	rows, err := ListChannelModelEndpointPoliciesByChannelIDWithDB(db, "chan-empty", "", "")
	if err != nil {
		t.Fatalf("list policies: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected 0 policies for endpoint-less channel, got %d", len(rows))
	}
}
