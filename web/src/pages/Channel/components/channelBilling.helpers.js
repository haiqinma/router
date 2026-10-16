// Shared, UI-agnostic helpers for the channel billing views (account quota view
// and the per-channel procurement view). Keep this module free of JSX and of any
// `router-ui` imports so both view components can consume it without widening the
// UI-import surface. JSX renderers live in the view components that use them.

// 成本核算口径(cost_tracking_mode)三挡:untracked 不核算 / free 免费 / actual
// 实际成本。以下为挡位的规范化、选项与着色/文案 helper,供成本页的成本开关复用。
export const COST_TRACKING_MODES = ['untracked', 'free', 'actual'];

const COST_TRACKING_MODE_TAG_COLORS = {
  untracked: 'default',
  free: 'processing',
  actual: 'success',
};

export const normalizeCostTrackingModeValue = (mode) => {
  const normalized = (mode || '').toString().trim().toLowerCase();
  return normalized === 'free' || normalized === 'actual'
    ? normalized
    : 'untracked';
};

export const buildCostTrackingModeOptions = (t) =>
  COST_TRACKING_MODES.map((mode) => ({
    value: mode,
    label: t(`channel.edit.billing.cost_tracking_mode.options.${mode}`),
  }));

export const formatCostTrackingModeLabel = (t, mode) =>
  t(
    `channel.edit.billing.cost_tracking_mode.options.${normalizeCostTrackingModeValue(
      mode
    )}`
  );

export const formatCostTrackingConsequence = (t, mode) =>
  t(
    `channel.edit.billing.cost_tracking_mode.consequence.${normalizeCostTrackingModeValue(
      mode
    )}`
  );

export const costTrackingModeTagColor = (mode) =>
  COST_TRACKING_MODE_TAG_COLORS[normalizeCostTrackingModeValue(mode)] ||
  'default';

export const buildManualQuotaItem = () => ({
  resource_type: 'quota',
  quota_type: 'total',
  quota_label: '',
  limit_amount: null,
  used_amount: 0,
  remaining_amount: null,
  currency: 'USD',
  reset_at_input: '',
  expires_at_input: '',
  source_ref: 'manual',
});

export const toDateTimeLocalValue = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
};

// 采购主要两类:充值(预付余额,按量扣减,通常不设有效期)/ 订阅(按周期购买,
// 有生效/到期日期)。purchase_kind 只是弹窗 UI 态,用来决定默认值与字段显隐,不入
// 提交 payload。
export const DEFAULT_PURCHASE_KIND = 'subscription';
export const PURCHASE_KINDS = ['recharge', 'subscription'];
export const SUBSCRIPTION_QUOTA_TYPES = ['daily', 'weekly', 'monthly'];

// 充值是一笔可消耗总额度;订阅是一组按日/周/月重置的周期约束。周期项
// 仍由采购批次按同一 scope/unit 分组,不会把一笔采购成本重复计算多次。
export const purchaseKindItemDefaults = (kind, quotaType = '') => ({
  resource_type: 'quota',
  quota_type:
    kind === 'subscription'
      ? SUBSCRIPTION_QUOTA_TYPES.includes(normalizeBillingValue(quotaType))
        ? normalizeBillingValue(quotaType)
        : 'monthly'
      : 'total',
});

// 切换采购类型时,保留已填的额度/币种,仅改资源与额度类型。
export const applyPurchaseKindToItem = (item, kind, quotaType = '') => ({
  ...(item || buildManualQuotaItem()),
  ...purchaseKindItemDefaults(kind, quotaType || item?.quota_type),
});

export const availableSubscriptionQuotaTypes = (items, currentIndex = -1) => {
  const used = new Set(
    (Array.isArray(items) ? items : [])
      .filter((_, index) => index !== currentIndex)
      .map((item) => normalizeBillingValue(item?.quota_type))
      .filter((value) => SUBSCRIPTION_QUOTA_TYPES.includes(value))
  );
  return SUBSCRIPTION_QUOTA_TYPES.filter((value) => !used.has(value));
};

export const isSubscriptionPurchaseRecord = (record) => {
  const items = Array.isArray(record?.items) ? record.items : [];
  return (
    Number(record?.valid_from || 0) > 0 ||
    Number(record?.valid_until || 0) > 0 ||
    items.some((item) => isManualPeriodicItem(item))
  );
};

export const resolvePurchaseRecordValidFrom = (record) =>
  Number(record?.valid_from || record?.purchase_at || record?.created_at || 0);

export const buildUpgradeQuotaItemsFromSnapshot = (record) => {
  const seen = new Set();
  const items = (Array.isArray(record?.items) ? record.items : [])
    .filter((item) => isManualPeriodicItem(item))
    .filter((item) => {
      const quotaType = normalizeBillingValue(item?.quota_type);
      if (
        !SUBSCRIPTION_QUOTA_TYPES.includes(quotaType) ||
        seen.has(quotaType)
      ) {
        return false;
      }
      seen.add(quotaType);
      return true;
    })
    .map((item) => ({
      ...buildManualQuotaItem(),
      resource_type: 'quota',
      quota_type: normalizeBillingValue(item?.quota_type),
      currency:
        (item?.currency || 'USD').toString().trim().toUpperCase() || 'USD',
    }));
  return items.length > 0
    ? items
    : [applyPurchaseKindToItem(buildManualQuotaItem(), 'subscription')];
};

// 编辑态由记录反推采购类型:带有效期或周期额度 → 订阅;否则按充值处理。
export const inferPurchaseKind = (record, items) => {
  const hasValidity =
    toUnixTimestamp(record?.valid_from_input) > 0 ||
    toUnixTimestamp(record?.valid_until_input) > 0;
  const list = Array.isArray(items) ? items : [];
  const hasPeriodic = list.some((item) => isManualPeriodicItem(item));
  if (hasValidity || hasPeriodic) {
    return 'subscription';
  }
  return 'recharge';
};

// 高级区只保留采购时间、备注和旧数据兼容字段。核心采购动作与周期权益必须
// 始终可见,不再因为折叠而隐藏真实业务语义。
export const recordUsesAdvanced = (record, items) => {
  const list = Array.isArray(items) ? items : [];
  const kind = inferPurchaseKind(record, list);
  if (kind === 'recharge') {
    const hasValidity =
      toUnixTimestamp(record?.valid_from_input) > 0 ||
      toUnixTimestamp(record?.valid_until_input) > 0;
    if (hasValidity) {
      return true;
    }
  }
  return false;
};

export const buildManualPurchaseRecord = (kind = DEFAULT_PURCHASE_KIND) => ({
  channel_id: '',
  purchase_kind: kind,
  purchase_at_input: toDateTimeLocalValue(new Date()),
  purchase_currency: 'CNY',
  purchase_amount: null,
  purchase_fx_rate: 1,
  purchase_cost_amount: null,
  entitlement_name: '',
  event_type: 'purchase',
  parent_snapshot_id: '',
  old_batch_disposition: 'keep',
  valid_from_input: '',
  valid_until_input: '',
});

export const MANUAL_CURRENCY_OPTIONS = ['USD', 'CNY', 'YYC'].map((value) => ({
  value,
  label: value,
}));

export const PROCUREMENT_CURRENCY_OPTIONS = ['CNY', 'USD'].map((value) => ({
  value,
  label: value,
}));

export const procurementScopeOptions = (t) => [
  {
    value: 'global',
    label: t('channel.edit.billing.procurement_scopes.global'),
  },
  { value: 'model', label: t('channel.edit.billing.procurement_scopes.model') },
];

export const ensureUnitOption = (options, value) => {
  const normalized = (value || '').toString().trim().toUpperCase();
  const items = Array.isArray(options) ? options : [];
  if (!normalized || items.some((option) => option?.value === normalized)) {
    return items;
  }
  return [...items, { value: normalized, label: normalized }];
};

export const formatAmountText = (item) => {
  const amount = Number(item?.amount || 0);
  const currency = (item?.currency || '').toString().trim();
  if (currency !== '') {
    return `${amount} ${currency}`;
  }
  return `${amount}`;
};

export const normalizeBillingValue = (value) =>
  (value || '').toString().trim().toLowerCase();

export const buildQuotaItemRowKey = (row) =>
  [
    row?.id || '',
    row?.quota_label || '',
    row?.quota_type || '',
    row?.resource_type || '',
    row?.billing_cycle || '',
  ].join('-');

export const isPeriodicQuotaType = (quotaType) =>
  ['daily', 'weekly', 'monthly'].includes(normalizeBillingValue(quotaType));

export const isPlanEntitlement = (item) =>
  normalizeBillingValue(item?.resource_type) === 'plan';

export const isManualPlanItem = (item) =>
  normalizeBillingValue(item?.resource_type) === 'plan';

export const isManualPeriodicItem = (item) =>
  normalizeBillingValue(item?.resource_type) === 'quota' &&
  isPeriodicQuotaType(item?.quota_type);

export const shouldShowManualAmountFields = (item) => !isManualPlanItem(item);

export const resolveManualAmountLabel = (item, t) => {
  const resourceType = normalizeBillingValue(item?.resource_type);
  if (resourceType === 'plan') {
    return t('channel.edit.billing.manual_quota_expires_at');
  }
  if (resourceType === 'balance') {
    return t('channel.edit.billing.manual_balance_amount');
  }
  if (resourceType === 'credit') {
    return t('channel.edit.billing.manual_credit_amount');
  }
  if (isManualPeriodicItem(item)) {
    return t('channel.edit.billing.manual_periodic_quota_amount');
  }
  return t('channel.edit.billing.manual_quota_limit_amount');
};

export const resolveManualItemAmounts = (item) => {
  if (isManualPlanItem(item)) {
    return {
      amount: 0,
      limit_amount: 0,
      used_amount: 0,
      remaining_amount: 0,
    };
  }
  const limitAmount = Number(item?.limit_amount || 0);
  const usedAmount = Number(item?.used_amount || 0);
  let remainingAmount = Number(item?.remaining_amount || 0);
  if (remainingAmount <= 0 && limitAmount > 0 && usedAmount >= 0) {
    remainingAmount = Math.max(limitAmount - usedAmount, 0);
  }
  const amount = remainingAmount > 0 ? remainingAmount : limitAmount;
  return {
    amount,
    limit_amount: limitAmount,
    used_amount: usedAmount,
    remaining_amount: remainingAmount,
  };
};

export const classifyEntitlementItem = (item, t) => {
  const resourceType = normalizeBillingValue(item?.resource_type);
  const quotaType = normalizeBillingValue(item?.quota_type);
  if (resourceType === 'plan') {
    return {
      key: 'plan',
      color: 'purple',
      label: t('channel.edit.billing.entitlement_kinds.package'),
    };
  }
  if (isPeriodicQuotaType(quotaType)) {
    return {
      key: 'periodic',
      color: 'blue',
      label: t(`channel.edit.billing.quota_types.${quotaType}`, {
        defaultValue: quotaType,
      }),
    };
  }
  if (
    resourceType === 'balance' ||
    resourceType === 'credit' ||
    quotaType === 'total'
  ) {
    return {
      key: 'metered',
      color: 'cyan',
      label: t('channel.edit.billing.entitlement_kinds.metered'),
    };
  }
  return {
    key: 'custom',
    color: 'default',
    label: t('channel.edit.billing.entitlement_kinds.custom'),
  };
};

export const formatValidityText = (item, timestamp2string, t) => {
  const expiresAt = Number(item?.expires_at || 0);
  const resetAt = Number(item?.reset_at || 0);
  const parts = [];
  if (expiresAt > 0) {
    parts.push(
      `${t('channel.edit.billing.quota_table.valid_until')}: ${timestamp2string(
        expiresAt
      )}`
    );
  }
  if (resetAt > 0) {
    parts.push(
      `${t('channel.edit.billing.quota_table.next_reset')}: ${timestamp2string(
        resetAt
      )}`
    );
  }
  if (parts.length === 0) {
    return t('channel.edit.billing.no_expire');
  }
  return parts.join(' / ');
};

export const formatUsageText = (item) => {
  const remaining = Number(item?.remaining_amount || 0);
  const limit = Number(item?.limit_amount || 0);
  const currency = (item?.currency || '').toString().trim();
  if (limit > 0) {
    return `${remaining} / ${limit}${currency ? ` ${currency}` : ''}`;
  }
  return formatAmountText({
    amount: remaining || item?.amount || 0,
    currency,
  });
};

export const formatEntitlementUsageText = (item, t) => {
  if (isPlanEntitlement(item)) {
    return formatItemStatusText(item, t);
  }
  return formatUsageText(item);
};

export const formatUsedText = (item) => {
  if (isPlanEntitlement(item)) {
    return '-';
  }
  const used = Number(item?.used_amount || 0);
  const currency = (item?.currency || '').toString().trim();
  if (used <= 0) {
    return '-';
  }
  return `${used}${currency ? ` ${currency}` : ''}`;
};

export const formatRemainingRatioText = (item) => {
  if (isPlanEntitlement(item)) {
    return '-';
  }
  const limit = Number(item?.limit_amount || 0);
  const remaining = Number(item?.remaining_amount || 0);
  if (!(limit > 0)) {
    return '-';
  }
  return `${((remaining / limit) * 100).toFixed(2)}%`;
};

export const formatItemStatusText = (item, t) => {
  const status = (item?.status || '').toString().trim().toLowerCase();
  switch (status) {
    case 'low':
      return t('channel.edit.billing.quota_table.status_low');
    case 'depleted':
      return t('channel.edit.billing.quota_table.status_depleted');
    case 'expired':
      return t('channel.edit.billing.quota_table.status_expired');
    case 'active':
    default:
      return t('channel.edit.billing.quota_table.status_active');
  }
};

export const statusColor = (item) => {
  const status = normalizeBillingValue(item?.status);
  switch (status) {
    case 'low':
      return 'orange';
    case 'depleted':
    case 'expired':
      return 'red';
    case 'active':
    default:
      return 'green';
  }
};

export const formatNumberText = (value, digits = 6) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return '-';
  }
  return Number(amount.toFixed(digits)).toString();
};

export const formatProcurementCapacityText = (row, t) => {
  const remaining = formatNumberText(row?.capacity_remaining, 6);
  const effective = formatNumberText(
    row?.capacity_effective || row?.capacity_total,
    6
  );
  const unit = (row?.capacity_unit || '').toString().trim();
  const resetCycle = normalizeBillingValue(row?.reset_cycle);
  if (resetCycle && resetCycle !== 'none') {
    const windowRemaining = formatNumberText(row?.window_remaining, 6);
    const windowTotal = formatNumberText(row?.capacity_total, 6);
    return t('channel.edit.billing.procurement_table.periodic_capacity', {
      window: `${windowRemaining} / ${windowTotal}${unit ? ` ${unit}` : ''}`,
      total: `${remaining} / ${effective}${unit ? ` ${unit}` : ''}`,
    });
  }
  return `${remaining} / ${effective}${unit ? ` ${unit}` : ''}`;
};

export const formatProcurementCostText = (row, t) => {
  const source = (row?.cost_source || '').toString().trim();
  const status = (row?.cost_status || '').toString().trim();
  if (status === 'cost_unconfigured' || source === 'none' || source === '') {
    return t('channel.edit.billing.procurement_table.cost_unconfigured');
  }
  if (Number(row?.cost_per_unit_amount || 0) <= 0) {
    return t('channel.edit.billing.procurement_table.constraint_only');
  }
  return `${formatNumberText(row?.purchase_cost_amount, 6)} CNY`;
};

export const formatProcurementUnitCostText = (row) => {
  const unit = (row?.capacity_unit || '').toString().trim();
  const value = formatNumberText(row?.cost_per_unit_amount, 8);
  if (value === '-') {
    return '-';
  }
  return unit ? `${value} CNY/${unit}` : `${value} CNY`;
};

export const formatProcurementScopeText = (row, t) => {
  const scopeType =
    normalizeBillingValue(row?.scope_type || 'global') || 'global';
  const scopeValue = (row?.scope_value || '').toString().trim();
  if (scopeType === 'model') {
    return scopeValue || '-';
  }
  return t('channel.edit.billing.procurement_scopes.global');
};

export const formatProcurementResourceText = (row, t) => {
  const resourceType = normalizeBillingValue(row?.resource_type);
  const quotaType = normalizeBillingValue(row?.quota_type);
  const resourceLabel = t(
    `channel.edit.billing.resource_types.${resourceType || 'unknown'}`,
    { defaultValue: resourceType || '-' }
  );
  const quotaLabel =
    quotaType && quotaType !== resourceType
      ? t(`channel.edit.billing.quota_types.${quotaType}`, {
          defaultValue: quotaType,
        })
      : '';
  return quotaLabel ? `${resourceLabel} / ${quotaLabel}` : resourceLabel;
};

export const formatProcurementSourceText = (row) => {
  const sourceRef = (row?.source_ref || '').toString().trim();
  const snapshotID = (row?.source_snapshot_id || '').toString().trim();
  if (sourceRef !== '') {
    return sourceRef;
  }
  if (snapshotID !== '') {
    return snapshotID.slice(0, 8);
  }
  return '-';
};

export const procurementStatusColor = (status) => {
  switch ((status || '').toString().trim()) {
    case 'active':
      return 'green';
    case 'cost_unconfigured':
      return 'orange';
    case 'exhausted':
    case 'expired':
      return 'red';
    case 'disabled':
      return 'default';
    default:
      return 'default';
  }
};

export const buildProcurementCostDraft = (row) => ({
  purchase_currency:
    (row?.purchase_currency || 'CNY').toString().trim() || 'CNY',
  purchase_amount: Number(row?.purchase_amount || 0),
  purchase_fx_rate: Number(row?.purchase_fx_rate || 1) || 1,
  purchase_cost_amount: Number(row?.purchase_cost_amount || 0),
  capacity_effective: Number(
    row?.capacity_effective || row?.capacity_total || 0
  ),
  cost_source:
    (row?.cost_source || 'actual').toString().trim() === 'none'
      ? 'actual'
      : (row?.cost_source || 'actual').toString().trim(),
  cost_status: 'active',
  scope_type: (row?.scope_type || 'global').toString().trim() || 'global',
  scope_value: (row?.scope_value || '').toString().trim(),
});

export const toUnixTimestamp = (value) => {
  const normalized = (value || '').toString().trim();
  if (normalized === '') {
    return 0;
  }
  const parsed = new Date(normalized);
  const millis = parsed.getTime();
  if (!Number.isFinite(millis) || Number.isNaN(millis)) {
    return 0;
  }
  return Math.floor(millis / 1000);
};

export const toDateTimeLocalValueFromTimestamp = (value) => {
  const timestamp = Number(value || 0);
  if (timestamp <= 0) {
    return '';
  }
  return toDateTimeLocalValue(new Date(timestamp * 1000));
};

export const normalizeManualValidityInput = (
  value,
  defaultTime,
  forceDefaultTime = false
) => {
  const normalized = (value || '').toString().trim();
  if (normalized === '') {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T${defaultTime}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    if (forceDefaultTime) {
      return `${normalized.slice(0, 10)}T${defaultTime}`;
    }
    return normalized.length === 16
      ? `${normalized}:${defaultTime.slice(-2)}`
      : normalized;
  }
  return normalized;
};

export const buildManualPurchaseRecordFromSnapshot = (row) => ({
  channel_id: (row?.channel_id || '').toString().trim(),
  purchase_kind: inferPurchaseKind(
    {
      valid_from_input: toDateTimeLocalValueFromTimestamp(row?.valid_from),
      valid_until_input: toDateTimeLocalValueFromTimestamp(row?.valid_until),
    },
    Array.isArray(row?.items)
      ? row.items.map((item) => buildManualQuotaItemFromSnapshotItem(item))
      : []
  ),
  purchase_at_input:
    toDateTimeLocalValueFromTimestamp(row?.purchase_at) ||
    buildManualPurchaseRecord().purchase_at_input,
  purchase_currency:
    (row?.purchase_currency || 'CNY').toString().trim().toUpperCase() || 'CNY',
  purchase_amount: Number(row?.purchase_amount || 0),
  purchase_fx_rate: Number(row?.purchase_fx_rate || 1) || 1,
  purchase_cost_amount: Number(row?.purchase_cost_amount || 0),
  entitlement_name: (row?.entitlement_name || '').toString(),
  event_type: (row?.event_type || 'purchase').toString(),
  parent_snapshot_id: (row?.parent_snapshot_id || '').toString(),
  old_batch_disposition: (row?.old_batch_disposition || 'keep').toString(),
  valid_from_input: toDateTimeLocalValueFromTimestamp(row?.valid_from),
  valid_until_input: toDateTimeLocalValueFromTimestamp(row?.valid_until),
});

export const buildManualQuotaItemFromSnapshotItem = (item) => ({
  id: (item?.id || '').toString().trim(),
  resource_type: (item?.resource_type || 'quota').toString().trim() || 'quota',
  quota_type: (item?.quota_type || 'total').toString().trim() || 'total',
  quota_label: (item?.quota_label || '').toString(),
  amount: Number(item?.amount || item?.remaining_amount || 0),
  limit_amount: Number(item?.limit_amount || item?.amount || 0),
  used_amount: Number(item?.used_amount || 0),
  remaining_amount: Number(item?.remaining_amount || item?.amount || 0),
  currency: (item?.currency || 'USD').toString().trim() || 'USD',
  reset_at_input: toDateTimeLocalValueFromTimestamp(item?.reset_at),
  expires_at_input: toDateTimeLocalValueFromTimestamp(item?.expires_at),
  source_ref: (item?.source_ref || 'manual').toString().trim() || 'manual',
});

export const isPurchaseCurrencyCNY = (record) =>
  (record?.purchase_currency || '').toString().trim().toUpperCase() === 'CNY';
