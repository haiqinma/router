// Pure, stateless helpers extracted from LogsTable.jsx to keep the component
// file focused on rendering and effects. Nothing here reads component state;
// everything is a module-level constant or a pure function (a few return JSX).
import React from 'react';
import { timestamp2string } from '../helpers';
import { AppTag } from '../router-ui';
import { LOG_LIST_COLUMN_WIDTHS } from '../constants/tableWidthPresets';

export const USER_LOG_COLUMN_ORDER_STORAGE_KEY = 'router_user_log_column_order_v1';
export const ADMIN_LOG_COLUMN_ORDER_STORAGE_KEY = 'router_admin_log_column_order_v1';
export const USER_LOG_COLUMN_WIDTH_STORAGE_KEY = 'router_user_log_column_width_v1';
export const ADMIN_LOG_COLUMN_WIDTH_STORAGE_KEY = 'router_admin_log_column_width_v1';
export const LOG_COLUMN_MIN_WIDTH = 72;
export const LOG_COLUMN_MAX_WIDTH = 420;
export const DEFAULT_USER_LOG_COLUMN_ORDER = [
  'created_at',
  'billingSource',
  'model_name',
  'token_name',
  'prompt_tokens',
  'completion_tokens',
  'cacheQuantity',
  'chargeAmount',
];
export const DEFAULT_ADMIN_LOG_COLUMN_ORDER = [
  'created_at',
  'channel',
  'group_id',
  'type',
  'model_name',
  'username',
  'token_name',
  'prompt_tokens',
  'completion_tokens',
  'cacheQuantity',
  'chargeAmount',
];
export const DEFAULT_LOG_COLUMN_WIDTHS = {
  created_at: LOG_LIST_COLUMN_WIDTHS.time,
  channel: LOG_LIST_COLUMN_WIDTHS.channel,
  group_id: LOG_LIST_COLUMN_WIDTHS.group,
  type: LOG_LIST_COLUMN_WIDTHS.type,
  billingSource: LOG_LIST_COLUMN_WIDTHS.billingSource,
  model_name: LOG_LIST_COLUMN_WIDTHS.model,
  username: LOG_LIST_COLUMN_WIDTHS.username,
  token_name: LOG_LIST_COLUMN_WIDTHS.tokenName,
  prompt_tokens: LOG_LIST_COLUMN_WIDTHS.promptTokens,
  completion_tokens: LOG_LIST_COLUMN_WIDTHS.completionTokens,
  cacheQuantity: LOG_LIST_COLUMN_WIDTHS.cacheTokens,
  chargeAmount: LOG_LIST_COLUMN_WIDTHS.quota,
};

export function getLogColumnOrderStorageKey(isAdminScope) {
  return isAdminScope
    ? ADMIN_LOG_COLUMN_ORDER_STORAGE_KEY
    : USER_LOG_COLUMN_ORDER_STORAGE_KEY;
}

export function getLogColumnWidthStorageKey(isAdminScope) {
  return isAdminScope
    ? ADMIN_LOG_COLUMN_WIDTH_STORAGE_KEY
    : USER_LOG_COLUMN_WIDTH_STORAGE_KEY;
}

export function getDefaultLogColumnOrder(isAdminScope) {
  return isAdminScope
    ? DEFAULT_ADMIN_LOG_COLUMN_ORDER
    : DEFAULT_USER_LOG_COLUMN_ORDER;
}

export function normalizeLogColumnOrder(rawOrder, isAdminScope) {
  const defaultOrder = getDefaultLogColumnOrder(isAdminScope);
  const nextOrder = [];
  const seen = new Set();
  const append = (key) => {
    const normalizedKey = !isAdminScope && key === 'type' ? 'billingSource' : key;
    if (
      !defaultOrder.includes(normalizedKey) ||
      seen.has(normalizedKey)
    ) {
      return;
    }
    seen.add(normalizedKey);
    nextOrder.push(normalizedKey);
  };
  if (Array.isArray(rawOrder)) {
    rawOrder.forEach((key) => append(String(key || '').trim()));
  }
  defaultOrder.forEach(append);
  return nextOrder;
}

export function loadLogColumnOrder(isAdminScope) {
  if (typeof window === 'undefined') {
    return [...getDefaultLogColumnOrder(isAdminScope)];
  }
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(getLogColumnOrderStorageKey(isAdminScope)) || '[]',
    );
    return normalizeLogColumnOrder(stored, isAdminScope);
  } catch (error) {
    return [...getDefaultLogColumnOrder(isAdminScope)];
  }
}

export function normalizeLogColumnWidths(rawWidths) {
  const nextWidths = {};
  Object.entries(DEFAULT_LOG_COLUMN_WIDTHS).forEach(([key, defaultWidth]) => {
    const storedWidth = Number(rawWidths?.[key]);
    nextWidths[key] = Math.min(
      LOG_COLUMN_MAX_WIDTH,
      Math.max(
        LOG_COLUMN_MIN_WIDTH,
        Number.isFinite(storedWidth) && storedWidth > 0
          ? storedWidth
          : defaultWidth,
      ),
    );
  });
  return nextWidths;
}

export function loadLogColumnWidths(isAdminScope) {
  if (typeof window === 'undefined') {
    return normalizeLogColumnWidths({});
  }
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(getLogColumnWidthStorageKey(isAdminScope)) || '{}',
    );
    return normalizeLogColumnWidths(stored);
  } catch (error) {
    return normalizeLogColumnWidths({});
  }
}

// Frontend column key → backend sort column (whitelisted server-side). Columns
// absent from this map are not sortable via the backend.
export const LOG_SORT_FIELD_MAP = {
  created_at: 'created_at',
  prompt_tokens: 'prompt_tokens',
  completion_tokens: 'completion_tokens',
  chargeAmount: 'quota',
};

export function formatCompactNumber(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return '';
  }
  if (Number.isInteger(numericValue)) {
    return numericValue.toLocaleString();
  }
  return numericValue.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

export function renderTimestamp(timestamp) {
  return <code>{timestamp2string(timestamp)}</code>;
}

export function renderType(type, t) {
  switch (type) {
    case 1:
      return (
        <AppTag color='green' className='router-tag'>
          {t('log.type.topup')}
        </AppTag>
      );
    case 2:
      return (
        <AppTag color='olive' className='router-tag'>
          {t('log.type.usage')}
        </AppTag>
      );
    case 3:
      return (
        <AppTag color='orange' className='router-tag'>
          {t('log.type.admin')}
        </AppTag>
      );
    case 4:
      return (
        <AppTag color='purple' className='router-tag'>
          {t('log.type.system')}
        </AppTag>
      );
    case 5:
      return (
        <AppTag color='violet' className='router-tag'>
          {t('log.type.test')}
        </AppTag>
      );
    case 6:
      return (
        <AppTag color='red' className='router-tag'>
          {t('log.type.relay_failure')}
        </AppTag>
      );
    default:
      return (
        <AppTag color='black' className='router-tag'>
          {t('log.type.unknown')}
        </AppTag>
      );
  }
}

export function renderBillingSource(log, t) {
  const upstreamSource = String(log?.upstream_source || '').trim();
  const upstreamLabel =
    upstreamSource === 'personal_provider'
      ? log?.personal_provider_name || t('log.table.personal_provider')
      : upstreamSource === 'community_package'
        ? t('log.table.community_package')
        : '';
  const upstreamColor = upstreamSource === 'personal_provider' ? 'purple' : 'blue';
  const name = String(log?.billing_source_name || '').trim();
  const source = String(log?.billing_source || '').trim();
  const fallback =
    source === 'package'
      ? t('log.detail.billing_sources.package')
      : source === 'balance'
        ? t('log.detail.billing_sources.balance')
        : source === 'personal_provider'
          ? t('log.table.no_community_charge')
        : '';
  const label = name || fallback || '-';
  const color = source === 'package' ? 'blue' : source === 'balance' ? 'teal' : 'grey';
  const sourceID = String(log?.billing_source_id || '').trim();
  const sourceDetail = String(log?.billing_source_detail || '').trim();
  const title = [sourceDetail, sourceID].filter(Boolean).join(' / ');

  if (label === '-' && upstreamLabel === '') return '-';
  return (
    <span className='router-log-source-tags'>
      {upstreamLabel ? <AppTag className='router-tag' color={upstreamColor}>{upstreamLabel}</AppTag> : null}
      {label !== '-' ? <AppTag className='router-tag' color={color} title={title || label}>{label}</AppTag> : null}
      {Number(log?.fallback_count || 0) > 0 ? <AppTag className='router-tag' color='orange'>{t('log.table.fallback_used')}</AppTag> : null}
    </span>
  );
}

export function getColorByElapsedTime(elapsedTime) {
  if (elapsedTime === undefined || 0) return 'black';
  if (elapsedTime < 1000) return 'green';
  if (elapsedTime < 3000) return 'olive';
  if (elapsedTime < 5000) return 'yellow';
  if (elapsedTime < 10000) return 'orange';
  return 'red';
}

export function renderDetail(log) {
  return (
    <>
      {log.content}
      <br />
      {log.elapsed_time && (
        <AppTag className='router-tag' color={getColorByElapsedTime(log.elapsed_time)}>
          {log.elapsed_time} ms
        </AppTag>
      )}
      {log.is_stream && (
        <AppTag className='router-tag' color='pink'>
          Stream
        </AppTag>
      )}
    </>
  );
}

export function getLogChannelLabel(log) {
  if (!log) {
    return '';
  }
  return log.channel_name || log.channel || '';
}

export function getLogPublicModelName(log) {
  return (log?.request_model_name || '').toString().trim();
}

export function getLogActualModelName(log) {
  return (log?.actual_model_name || '').toString().trim();
}

export function normalizeLogEntry(log) {
  const cacheReadQuantity = Number(log?.billing_cache_read_quantity ?? 0);
  const cacheWriteQuantity = Number(log?.billing_cache_write_quantity ?? 0);
  return {
    ...(log || {}),
    publicModelName: getLogPublicModelName(log),
    actualModelName: getLogActualModelName(log),
    // Prefer charge-amount settlement fields, fall back to legacy quota-based logs.
    chargeAmount: Number(log?.charge_amount ?? log?.quota ?? 0),
    userDailyChargeAmount: Number(log?.user_daily_charge_amount ?? log?.user_daily_quota ?? 0),
    userEmergencyChargeAmount: Number(log?.user_emergency_charge_amount ?? log?.user_emergency_quota ?? 0),
    cacheReadQuantity,
    cacheWriteQuantity,
    cacheQuantity: cacheReadQuantity + cacheWriteQuantity,
  };
}

export function toDatetimeLocalValue(value) {
  const raw = (value || '').toString().trim();
  if (raw === '') {
    return '';
  }
  if (raw.includes('T')) {
    return raw.slice(0, 16);
  }
  if (raw.includes(' ')) {
    return raw.replace(' ', 'T').slice(0, 16);
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  const date = new Date(parsed);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toUserFilterOption(item) {
  const username = (item?.username || '').toString().trim();
  const displayName = (item?.display_name || '').toString().trim();
  const walletAddress = (item?.wallet_address || '').toString().trim();
  if (!username) {
    return null;
  }
  const label = [displayName || username, walletAddress].filter(Boolean).join(' / ');
  return {
    key: username,
    text: label || username,
    value: username,
  };
}

export function toTokenFilterOption(item) {
  const tokenName = (item?.name || '').toString().trim();
  const tokenID = (item?.id || '').toString().trim();
  if (!tokenName) {
    return null;
  }
  return {
    key: tokenName,
    text: [tokenName, tokenID].filter(Boolean).join(' / '),
    value: tokenName,
  };
}

export function parseDatetimeInput(value) {
  const raw = (value || '').toString().trim();
  if (raw === '') {
    return 0;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.floor(parsed / 1000);
}

export function cleanupDatetimeLocalValue() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function formatFilterDisplayValue(value) {
  return (value || '').toString().trim().replace('T', ' ');
}

export function normalizeSearchDateTimeValue(value) {
  const raw = (value || '').toString().trim();
  if (raw === '') {
    return '';
  }
  if (/^\d+$/.test(raw)) {
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      return '';
    }
    const normalizedTimestamp = raw.length > 10 ? timestamp : timestamp * 1000;
    const date = new Date(normalizedTimestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
  return toDatetimeLocalValue(raw);
}

export function parseLogFiltersFromSearch(search, isAdminScope) {
  const params = new URLSearchParams(search || '');
  const nextInputs = {
    username: '',
    token_name: '',
    model_name: '',
    start_timestamp: '',
    end_timestamp: '',
    channel: '',
    group_id: '',
  };
  const nextActiveFilterKeys = [];
  const nextLogType = Number(params.get('log_type') || params.get('type') || 0);
  if (Number.isFinite(nextLogType) && nextLogType > 0) {
    nextActiveFilterKeys.push('log_type');
  }
  const nextStart = normalizeSearchDateTimeValue(params.get('start_timestamp'));
  const nextEnd = normalizeSearchDateTimeValue(params.get('end_timestamp'));
  if (nextStart !== '' || nextEnd !== '') {
    nextInputs.start_timestamp = nextStart;
    nextInputs.end_timestamp = nextEnd;
    nextActiveFilterKeys.push('time_range');
  }
  const filterKeys = ['token_name', 'model_name'];
  if (isAdminScope) {
    filterKeys.push('channel', 'group_id', 'username');
  }
  filterKeys.forEach((key) => {
    const value = (params.get(key) || '').toString().trim();
    if (value === '') {
      return;
    }
    nextInputs[key] = value;
    nextActiveFilterKeys.push(key);
  });
  return {
    inputs: nextInputs,
    logType: Number.isFinite(nextLogType) && nextLogType > 0 ? nextLogType : 0,
    activeFilterKeys: Array.from(new Set(nextActiveFilterKeys)),
  };
}

// Build a deep-link into the log page pre-filtered by a single entity, e.g.
// a channel row → `/admin/log?channel=<id>`. `scope` picks the log surface
// ('admin' → /admin/log, 'workspace' → /workspace/log). Only non-empty filter
// keys are appended, and the keys mirror parseLogFiltersFromSearch above so the
// round-trip (build → parse) stays consistent.
//
// By default the link also carries a "last 7 days" time window (start/end unix
// seconds) so entity drill-downs land on a bounded, shareable view instead of
// the unbounded all-time log — 7d keeps recent-but-not-just-today usage visible
// for support lookups. Callers can override the window by passing an explicit
// `start_timestamp`/`end_timestamp` in `filters`, or opt out entirely
// with `{ rangeDays: 0 }`. No log_type is prefilled.
export function buildLogDrilldownPath(scope, filters = {}, options = {}) {
  const base = scope === 'workspace' ? '/workspace/log' : '/admin/log';
  const params = new URLSearchParams();
  ['channel', 'group_id', 'username', 'token_name', 'model_name'].forEach(
    (key) => {
      const value = (filters[key] ?? '').toString().trim();
      if (value !== '') {
        params.set(key, value);
      }
    },
  );

  const explicitStart = (filters.start_timestamp ?? '').toString().trim();
  const explicitEnd = (filters.end_timestamp ?? '').toString().trim();
  if (explicitStart !== '' || explicitEnd !== '') {
    // Explicit range wins — mirror whatever the caller passed.
    if (explicitStart !== '') {
      params.set('start_timestamp', explicitStart);
    }
    if (explicitEnd !== '') {
      params.set('end_timestamp', explicitEnd);
    }
  } else {
    const rangeDays = options.rangeDays === undefined ? 7 : options.rangeDays;
    if (rangeDays > 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      params.set('start_timestamp', String(nowSec - rangeDays * 86400));
      params.set('end_timestamp', String(nowSec));
    }
  }

  const query = params.toString();
  return query === '' ? base : `${base}?${query}`;
}

export function currentDatetimeLocalValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hour = `${now.getHours()}`.padStart(2, '0');
  const minute = `${now.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function startOfTodayDatetimeLocalValue() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}T00:00`;
}

export function renderFilterSummary(filterKey, inputs, t, extra = {}) {
  if (filterKey === 'time_range') {
    const start = formatFilterDisplayValue(inputs?.start_timestamp);
    const end = formatFilterDisplayValue(inputs?.end_timestamp);
    if (start === '' && end === '') {
      return t('log.filters.empty');
    }
    if (start !== '' && end !== '') {
      return `${start} ${t('log.filters.range_separator')} ${end}`;
    }
    return start || end || t('log.filters.empty');
  }
  if (filterKey === 'log_type') {
    return extra.logTypeLabel || t('log.filters.empty');
  }
  const value = (inputs?.[filterKey] || '').toString().trim();
  if (value === '') {
    return t('log.filters.empty');
  }
  if (typeof extra.resolveOptionLabel === 'function') {
    return extra.resolveOptionLabel(filterKey, value) || value;
  }
  return value;
}
