import assert from 'node:assert/strict';

const helpers = await import(
  '../src/pages/Channel/components/channelBilling.helpers.js'
);

const {
  applyPurchaseKindToItem,
  availableSubscriptionQuotaTypes,
  buildAutomaticPurchaseRecordName,
  buildManualQuotaItem,
  buildUpgradeQuotaItemsFromSnapshot,
  isSubscriptionPurchaseRecord,
  purchaseKindItemDefaults,
  resolvePurchaseRecordValidFrom,
} = helpers;

const translatePurchaseName = (key) =>
  ({
    'channel.edit.billing.purchase_kinds.recharge': '充值',
    'channel.edit.billing.purchase_kinds.subscription': '订阅',
    'channel.edit.billing.procurement_events.purchase': '新购',
    'channel.edit.billing.procurement_events.upgrade': '升级',
  })[key] || key;

assert.equal(
  buildAutomaticPurchaseRecordName(
    {
      purchase_kind: 'recharge',
      event_type: 'purchase',
      purchase_at_input: '2026-10-17T10:00',
    },
    translatePurchaseName
  ),
  '充值 2026-10-17'
);
assert.equal(
  buildAutomaticPurchaseRecordName(
    {
      purchase_kind: 'subscription',
      event_type: 'upgrade',
      purchase_at_input: '2026-10-17T10:00',
    },
    translatePurchaseName
  ),
  '订阅 升级 2026-10-17'
);

assert.deepEqual(purchaseKindItemDefaults('recharge'), {
  resource_type: 'quota',
  quota_type: 'total',
});
assert.deepEqual(purchaseKindItemDefaults('subscription'), {
  resource_type: 'quota',
  quota_type: 'monthly',
});
assert.deepEqual(purchaseKindItemDefaults('subscription', 'weekly'), {
  resource_type: 'quota',
  quota_type: 'weekly',
});

const rechargeItem = applyPurchaseKindToItem(
  { ...buildManualQuotaItem(), limit_amount: 100, currency: 'USD' },
  'recharge'
);
assert.equal(rechargeItem.quota_type, 'total');
assert.equal(rechargeItem.limit_amount, 100);

assert.deepEqual(
  availableSubscriptionQuotaTypes([
    { quota_type: 'daily' },
    { quota_type: 'monthly' },
  ]),
  ['weekly']
);
assert.deepEqual(
  availableSubscriptionQuotaTypes(
    [{ quota_type: 'daily' }, { quota_type: 'weekly' }],
    0
  ),
  ['daily', 'monthly']
);

const parent = {
  valid_from: 1_700_000_000,
  valid_until: 1_702_592_000,
  items: [
    {
      id: 'daily-parent',
      resource_type: 'quota',
      quota_type: 'daily',
      limit_amount: 100,
      remaining_amount: 40,
      currency: 'usd',
    },
    {
      id: 'weekly-parent',
      resource_type: 'quota',
      quota_type: 'weekly',
      limit_amount: 500,
      remaining_amount: 200,
      currency: 'USD',
    },
  ],
};
assert.equal(isSubscriptionPurchaseRecord(parent), true);
assert.equal(resolvePurchaseRecordValidFrom(parent), parent.valid_from);
assert.equal(
  resolvePurchaseRecordValidFrom({ purchase_at: 123, created_at: 456 }),
  123
);
assert.equal(
  isSubscriptionPurchaseRecord({
    items: [{ resource_type: 'quota', quota_type: 'total' }],
  }),
  false
);

const upgradeItems = buildUpgradeQuotaItemsFromSnapshot(parent);
assert.deepEqual(
  upgradeItems.map((item) => item.quota_type),
  ['daily', 'weekly']
);
assert.deepEqual(
  upgradeItems.map((item) => item.limit_amount),
  [null, null]
);
assert.deepEqual(
  upgradeItems.map((item) => item.currency),
  ['USD', 'USD']
);
assert.ok(
  upgradeItems.every((item) => !item.id && item.used_amount === 0),
  'upgrade quota items are new incremental rows, not copies of parent IDs or usage'
);

console.log('ok channel purchase helper tests passed');
