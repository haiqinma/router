package channel

import (
	"testing"

	"github.com/yeying-community/router/internal/admin/model"
)

func TestApplyUpgradeParentRulesPreservesValidityAndOldBatches(t *testing.T) {
	parent := model.ChannelBillingSnapshot{
		PurchaseAt: 1_700_000_000,
		ValidUntil: 1_702_592_000,
		Items: []model.ChannelBillingSnapshotItem{
			{
				ResourceType: model.ChannelBillingResourceTypeQuota,
				QuotaType:    "daily",
			},
		},
	}
	req := normalizedManualBillingSnapshotRequest{
		EventType:           "upgrade",
		OldBatchDisposition: "disable",
		ValidFrom:           1,
		ValidUntil:          2,
		Items: []model.ChannelBillingSnapshotItem{
			{
				ResourceType: model.ChannelBillingResourceTypeQuota,
				QuotaType:    "daily",
				LimitAmount:  50,
				ExpiresAt:    2,
			},
		},
	}

	got, err := applyUpgradeParentRules(req, parent)
	if err != nil {
		t.Fatalf("applyUpgradeParentRules returned error: %v", err)
	}
	if got.ValidFrom != parent.PurchaseAt || got.ValidUntil != parent.ValidUntil {
		t.Fatalf("validity = %d..%d, want %d..%d", got.ValidFrom, got.ValidUntil, parent.PurchaseAt, parent.ValidUntil)
	}
	if got.OldBatchDisposition != "keep" {
		t.Fatalf("OldBatchDisposition=%q, want keep", got.OldBatchDisposition)
	}
	if len(got.Items) != 1 || got.Items[0].ExpiresAt != parent.ValidUntil {
		t.Fatalf("item expiry=%v, want %d", got.Items, parent.ValidUntil)
	}
}

func TestApplyUpgradeParentRulesRejectsRechargeParent(t *testing.T) {
	parent := model.ChannelBillingSnapshot{
		Items: []model.ChannelBillingSnapshotItem{
			{
				ResourceType: model.ChannelBillingResourceTypeQuota,
				QuotaType:    "total",
			},
		},
	}
	_, err := applyUpgradeParentRules(
		normalizedManualBillingSnapshotRequest{EventType: "upgrade"},
		parent,
	)
	if err == nil {
		t.Fatal("applyUpgradeParentRules error=nil, want recharge parent rejection")
	}
}

func TestApplyUpgradeParentRulesLeavesOtherEventsUnchanged(t *testing.T) {
	req := normalizedManualBillingSnapshotRequest{
		EventType:           "renewal",
		OldBatchDisposition: "disable",
		ValidFrom:           10,
		ValidUntil:          20,
	}
	got, err := applyUpgradeParentRules(req, model.ChannelBillingSnapshot{})
	if err != nil {
		t.Fatalf("applyUpgradeParentRules returned error: %v", err)
	}
	if got.ValidFrom != req.ValidFrom || got.ValidUntil != req.ValidUntil || got.OldBatchDisposition != req.OldBatchDisposition {
		t.Fatalf("non-upgrade request changed: got=%+v want=%+v", got, req)
	}
}

func TestNormalizeUpgradeRequestDefersValidityToParent(t *testing.T) {
	req, err := normalizeManualBillingSnapshotRequest(channelBillingManualSnapshotRequest{
		PurchaseCurrency:    "CNY",
		PurchaseAmount:      100,
		PurchaseFXRate:      1,
		PurchaseCostAmount:  100,
		EntitlementName:     "subscription upgrade",
		EventType:           "upgrade",
		ParentSnapshotID:    "parent-1",
		OldBatchDisposition: "disable",
		ValidFrom:           20,
		ValidUntil:          10,
		Items: []channelBillingManualQuotaItemRequest{
			{
				ResourceType: model.ChannelBillingResourceTypeQuota,
				QuotaType:    "daily",
				LimitAmount:  50,
				Currency:     "USD",
			},
		},
	}, 1_700_000_000)
	if err != nil {
		t.Fatalf("normalizeManualBillingSnapshotRequest returned error: %v", err)
	}
	if req.ValidFrom != 20 || req.ValidUntil != 10 {
		t.Fatalf("normalized validity = %d..%d, want deferred raw values 20..10", req.ValidFrom, req.ValidUntil)
	}
}
