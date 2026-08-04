import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { API, showError, timestamp2string } from '../../helpers';
import { renderDisplayAmount, YYC_SYMBOL } from '../../helpers/render';
import {
  AppDetailSection,
  AppFilterHeader,
  AppTag,
} from '../../router-ui';

function renderType(type, t) {
  switch (Number(type)) {
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
          -
        </AppTag>
      );
  }
}

function renderBoolean(value) {
  if (value === true) {
    return 'true';
  }
  if (value === false) {
    return 'false';
  }
  return '-';
}

function renderText(value) {
  const normalized = (value || '').toString().trim();
  return normalized || '-';
}

function getLogPublicModelName(log) {
  return (log?.request_model_name || '').toString().trim();
}

function getLogActualModelName(log) {
  return (log?.actual_model_name || '').toString().trim();
}

function renderBillingSource(value, t) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'package') {
    return t('log.detail.billing_sources.package');
  }
  if (normalized === 'balance') {
    return t('log.detail.billing_sources.balance');
  }
  return renderText(value);
}

function renderEstimatePrecision(value, t) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'high') {
    return t('log.detail.route.precision.high');
  }
  if (normalized === 'medium') {
    return t('log.detail.route.precision.medium');
  }
  if (normalized === 'low') {
    return t('log.detail.route.precision.low');
  }
  return renderText(value);
}

function renderProcurementCostStatus(value, t) {
  const status = (value || 'unconfigured').toString().trim().toLowerCase();
  const colors = {
    actual: 'green',
    estimated: 'orange',
    pending: 'grey',
    retry: 'red',
    unconfigured: 'red',
    none: 'blue',
  };
  return (
    <AppTag color={colors[status] || 'grey'} className='router-tag'>
      {t(`log.detail.procurement_cost_status.${status}`)}
    </AppTag>
  );
}

function renderRouteExplanationSummary(log, t, isAdminPage) {
  if (!log) return '-';
  const channel = isAdminPage ? renderText(log.channel_name || log.channel) : '-';
  const model = renderText(
    isAdminPage ? getLogActualModelName(log) : getLogPublicModelName(log),
  );
  const source = renderText(log.billing_estimate_source);
  const settlement = renderText(log.billing_settlement_mode);
  const fallbackCount = Number(log.fallback_count || 0);
  const summaryKey = isAdminPage
    ? Number(log.type) === 6
      ? 'log.detail.route.failure_summary'
      : 'log.detail.route.summary'
    : Number(log.type) === 6
      ? 'log.detail.route.user_failure_summary'
      : 'log.detail.route.user_summary';
  return t(summaryKey, {
    channel,
    model,
    source,
    settlement,
    fallbackCount,
  });
}

function parseFallbackAttempts(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const raw = (value || '').toString().trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRouteDecision(value) {
  const raw = (value || '').toString().trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.initial_channel_id) {
      return null;
    }
    return {
      ...parsed,
      candidate_channel_ids: Array.isArray(parsed.candidate_channel_ids)
        ? parsed.candidate_channel_ids
        : [],
      filtered_candidates: Array.isArray(parsed.filtered_candidates)
        ? parsed.filtered_candidates
        : [],
    };
  } catch {
    return null;
  }
}

function renderRelayError(log) {
  const parts = [
    log?.relay_error_type,
    log?.relay_error_code,
    log?.relay_error_message,
  ]
    .map((item) => (item || '').toString().trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '-';
}

function formatNumber(value, maximumFractionDigits = 6) {
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return '-';
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function renderAmount(value, currency) {
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return '-';
  }
  const suffix = renderText(currency);
  return suffix === '-'
    ? formatNumber(value, 8)
    : `${formatNumber(value, 8)} ${suffix}`;
}

function renderRate(rate, currency) {
  if (
    typeof rate !== 'number' ||
    Number.isNaN(rate) ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return '-';
  }
  const suffix = renderText(currency);
  return suffix === '-'
    ? formatNumber(rate, 6)
    : `${formatNumber(rate, 6)} ${YYC_SYMBOL}/${suffix}`;
}

function hasFiniteNumber(value) {
  return (
    typeof value === 'number' &&
    !Number.isNaN(value) &&
    Number.isFinite(value)
  );
}

function hasNonZeroNumber(value) {
  return hasFiniteNumber(value) && Math.abs(value) > 0;
}

function hasText(value) {
  return (value || '').toString().trim() !== '';
}

function renderRatio(value) {
  return hasFiniteNumber(value) && value > 0
    ? `${formatNumber(value, 6)}x`
    : '-';
}

function renderYycAmount(value) {
  return hasFiniteNumber(value) ? `${YYC_SYMBOL} ${formatNumber(value, 0)}` : '-';
}

function renderPercent(value) {
  return hasFiniteNumber(value) ? `${(Number(value) * 100).toFixed(2)}%` : '-';
}

function renderBillingFallbackText(value, fallback) {
  const normalized = renderText(value);
  return normalized === '-' ? fallback : normalized;
}

function renderBillingDetailItem(item) {
  if (item?.visible === false) {
    return null;
  }
  const ValueTag = item?.pre ? 'pre' : 'div';
  const className = [
    'router-detail-item',
    item?.span ? 'router-detail-item-span-2' : '',
    item?.emphasis ? 'router-billing-emphasis-item' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} key={item.key}>
      <div className='router-detail-label'>{item.label}</div>
      <ValueTag className='router-detail-value'>{item.value}</ValueTag>
    </div>
  );
}

function renderBillingGroup(title, items) {
  const visibleItems = items.filter((item) => item?.visible !== false);
  if (visibleItems.length === 0) {
    return null;
  }
  return (
    <div className='router-billing-explain-group' key={title}>
      <div className='router-detail-section-subtitle'>{title}</div>
      <div className='router-detail-grid'>
        {visibleItems.map(renderBillingDetailItem)}
      </div>
    </div>
  );
}

function renderBillingFormulaCard(log, t) {
  const steps = [
    {
      key: 'base',
      label: t('log.detail.billing_explanation.base_amount'),
      value: renderAmount(log?.billing_amount, log?.billing_currency),
    },
    {
      key: 'rate',
      label: t('log.detail.billing_explanation.charge_rate'),
      value: renderRate(log?.billing_charge_rate, log?.billing_currency),
    },
    {
      key: 'ratio',
      label: t('log.detail.billing_explanation.final_ratio'),
      value: renderRatio(log?.billing_effective_ratio),
    },
    {
      key: 'charge',
      label: t('log.detail.billing_explanation.charge_amount'),
      value: renderYycAmount(log?.billingChargeAmount),
      result: true,
    },
  ];
  return (
    <div className='router-billing-formula-card'>
      <div className='router-billing-formula-header'>
        <div>
          <div className='router-detail-label'>
            {t('log.detail.billing_explanation.title')}
          </div>
          <div className='router-billing-formula-text'>
            {t('log.detail.billing_explanation.formula')}
          </div>
        </div>
        <div className='router-billing-formula-result'>
          {renderYycAmount(log?.billingChargeAmount)}
        </div>
      </div>
      <div className='router-billing-formula-steps'>
        {steps.map((step) => (
          <div
            className={`router-billing-formula-step${step.result ? ' router-billing-formula-step-result' : ''}`}
            key={step.key}
          >
            <span>{step.label}</span>
            <strong>{step.value}</strong>
          </div>
        ))}
      </div>
      <div className='router-billing-formula-note'>
        {t('log.detail.billing_explanation.formula_note')}
      </div>
    </div>
  );
}

function renderBillingSnapshot(log, t, isAdminPage) {
  const notObserved = t('log.detail.billing_explanation.not_observed');
  const groups = [
    renderBillingGroup(t('log.detail.billing_explanation.groups.source'), [
      {
        key: 'price_unit',
        label: t('log.detail.fields.billing_price_unit'),
        value: renderText(log?.billing_price_unit),
        pre: true,
      },
      {
        key: 'currency',
        label: t('log.detail.fields.billing_currency'),
        value: renderText(log?.billing_currency),
        pre: true,
      },
      {
        key: 'pricing_source',
        label: t('log.detail.fields.billing_pricing_source'),
        value: renderText(log?.billing_pricing_source),
        pre: true,
      },
      {
        key: 'usage_source',
        label: t('log.detail.fields.billing_usage_source'),
        value: renderText(log?.billing_usage_source),
        pre: true,
      },
      {
        key: 'estimate_source',
        label: t('log.detail.fields.billing_estimate_source'),
        value: renderText(log?.billing_estimate_source),
        pre: true,
      },
      {
        key: 'estimate_estimator',
        label: t('log.detail.fields.billing_estimate_estimator'),
        value: renderText(log?.billing_estimate_estimator),
        pre: true,
      },
      {
        key: 'estimate_precision',
        label: t('log.detail.fields.billing_estimate_precision'),
        value: renderEstimatePrecision(log?.billing_estimate_precision, t),
        pre: true,
      },
      {
        key: 'settlement_mode',
        label: t('log.detail.fields.billing_settlement_mode'),
        value: renderText(log?.billing_settlement_mode),
        pre: true,
      },
    ]),
    renderBillingGroup(t('log.detail.billing_explanation.groups.usage'), [
      {
        key: 'input_quantity',
        label: t('log.detail.fields.billing_input_quantity'),
        value: formatNumber(log?.billing_input_quantity, 6),
        pre: true,
      },
      {
        key: 'output_quantity',
        label: t('log.detail.fields.billing_output_quantity'),
        value: formatNumber(log?.billing_output_quantity, 6),
        pre: true,
      },
      {
        key: 'cache_read_quantity',
        label: t('log.detail.fields.billing_cache_read_quantity'),
        value: formatNumber(log?.billing_cache_read_quantity, 6),
        pre: true,
      },
      {
        key: 'cache_write_quantity',
        label: t('log.detail.fields.billing_cache_write_quantity'),
        value: formatNumber(log?.billing_cache_write_quantity, 6),
        pre: true,
      },
      {
        key: 'estimated_prompt_tokens',
        label: t('log.detail.fields.estimated_prompt_tokens'),
        value: log?.estimated_prompt_tokens ?? '-',
        pre: true,
      },
      {
        key: 'estimated_output_tokens',
        label: t('log.detail.fields.estimated_output_tokens'),
        value: log?.estimated_output_tokens ?? '-',
        pre: true,
      },
      {
        key: 'image_tool_calls',
        label: t('log.detail.fields.billing_image_tool_calls'),
        value: log?.billingImageToolCalls,
        pre: true,
        visible: log?.billingImageToolCalls > 0,
      },
      {
        key: 'image_tool_output_tokens',
        label: t('log.detail.fields.billing_image_tool_output_tokens'),
        value: formatNumber(log?.billingImageToolOutputTokens, 0),
        pre: true,
        visible: log?.billingImageToolOutputTokens > 0,
      },
    ]),
    renderBillingGroup(t('log.detail.billing_explanation.groups.base_price'), [
      {
        key: 'input_amount',
        label: t('log.detail.fields.billing_input_amount'),
        value: renderAmount(log?.billing_input_amount, log?.billing_currency),
        pre: true,
      },
      {
        key: 'output_amount',
        label: t('log.detail.fields.billing_output_amount'),
        value: renderAmount(log?.billing_output_amount, log?.billing_currency),
        pre: true,
      },
      {
        key: 'cache_read_amount',
        label: t('log.detail.fields.billing_cache_read_amount'),
        value: renderAmount(log?.billing_cache_read_amount, log?.billing_currency),
        pre: true,
      },
      {
        key: 'cache_write_amount',
        label: t('log.detail.fields.billing_cache_write_amount'),
        value: renderAmount(log?.billing_cache_write_amount, log?.billing_currency),
        pre: true,
      },
      {
        key: 'image_tool_amount',
        label: t('log.detail.fields.billing_image_tool_amount'),
        value: renderAmount(log?.billingImageToolAmount, log?.billing_currency),
        pre: true,
        visible: log?.billingImageToolAmount > 0,
      },
      {
        key: 'total_amount',
        label: t('log.detail.fields.billing_amount'),
        value: renderAmount(log?.billing_amount, log?.billing_currency),
        pre: true,
        emphasis: true,
      },
    ]),
    renderBillingGroup(t('log.detail.billing_explanation.groups.price_ratio'), [
      {
        key: 'charge_rate',
        label: t('log.detail.fields.billing_charge_rate'),
        value: renderRate(log?.billing_charge_rate, log?.billing_currency),
        pre: true,
      },
      {
        key: 'group_channel_ratio',
        label: t('log.detail.fields.billing_group_channel_ratio'),
        value: renderRatio(log?.billing_group_channel_ratio),
        pre: true,
      },
      {
        key: 'model_channel_ratio',
        label: t('log.detail.fields.billing_model_channel_ratio'),
        value: renderRatio(log?.billing_model_channel_ratio),
        pre: true,
      },
      {
        key: 'effective_ratio',
        label: t('log.detail.fields.billing_effective_ratio'),
        value: renderRatio(log?.billing_effective_ratio),
        pre: true,
        emphasis: true,
      },
    ]),
    renderBillingGroup(t('log.detail.billing_explanation.groups.settlement'), [
      {
        key: 'billing_source',
        label: t('log.detail.fields.billing_source'),
        value: renderBillingSource(log?.billing_source, t),
        pre: true,
      },
      {
        key: 'billing_source_name',
        label: t('log.detail.fields.billing_source_name'),
        value: renderText(log?.billing_source_name || log?.billing_source_id),
        pre: true,
        visible: hasText(log?.billing_source_name) || hasText(log?.billing_source_id),
      },
      {
        key: 'billing_source_detail',
        label: t('log.detail.fields.billing_source_detail'),
        value: renderText(log?.billing_source_detail),
        pre: true,
        visible: hasText(log?.billing_source_detail),
      },
      {
        key: 'charge_amount',
        label: t('log.detail.fields.billing_charge_amount'),
        value: renderYycAmount(log?.billingChargeAmount),
        emphasis: true,
      },
      {
        key: 'estimated_charge_amount',
        label: t('log.detail.fields.estimated_charge_amount'),
        value: renderYycAmount(log?.estimatedChargeAmount),
      },
      {
        key: 'charge_delta',
        label: t('log.detail.fields.billing_charge_delta_amount'),
        value: renderYycAmount(log?.billingChargeDeltaAmount),
        visible: hasNonZeroNumber(log?.billingChargeDeltaAmount),
      },
      {
        key: 'prompt_token_delta',
        label: t('log.detail.fields.billing_prompt_token_delta'),
        value: formatNumber(log?.billingPromptTokenDelta, 0),
        pre: true,
        visible: hasNonZeroNumber(log?.billingPromptTokenDelta),
      },
      {
        key: 'output_token_delta',
        label: t('log.detail.fields.billing_output_token_delta'),
        value: formatNumber(log?.billingOutputTokenDelta, 0),
        pre: true,
        visible: hasNonZeroNumber(log?.billingOutputTokenDelta),
      },
      {
        key: 'image_tool_charge_amount',
        label: t('log.detail.fields.billing_image_tool_charge_amount'),
        value: renderYycAmount(log?.billingImageToolChargeAmount),
        visible: log?.billingImageToolChargeAmount > 0,
      },
    ]),
  ];

  if (isAdminPage) {
    groups.push(
      renderBillingGroup(t('log.detail.billing_explanation.groups.procurement'), [
        {
          key: 'procurement_cost_status',
          label: t('log.detail.fields.billing_procurement_cost_status'),
          value: renderProcurementCostStatus(log?.billing_procurement_cost_status, t),
        },
        {
          key: 'procurement_cost',
          label: t('log.detail.fields.billing_procurement_cost'),
          value: hasFiniteNumber(log?.billing_procurement_cost_base_amount)
            ? renderAmount(log?.billing_procurement_cost_base_amount, 'CNY')
            : notObserved,
        },
        {
          key: 'procurement_cost_source',
          label: t('log.detail.fields.billing_procurement_cost_source'),
          value: renderBillingFallbackText(
            log?.billing_procurement_cost_source,
            notObserved,
          ),
          pre: true,
        },
        {
          key: 'procurement_cost_confidence',
          label: t('log.detail.fields.billing_procurement_cost_confidence'),
          value: renderBillingFallbackText(
            log?.billing_procurement_cost_confidence,
            notObserved,
          ),
          pre: true,
        },
        {
          key: 'gross_profit',
          label: t('log.detail.fields.billing_gross_profit'),
          value: renderAmount(log?.billing_gross_profit_base_amount, 'CNY'),
        },
        {
          key: 'gross_margin',
          label: t('log.detail.fields.billing_gross_margin'),
          value: renderPercent(log?.billing_gross_margin),
        },
        {
          key: 'sell_base',
          label: t('log.detail.fields.billing_sell_base_amount'),
          value: renderAmount(log?.billing_sell_base_amount, 'CNY'),
          visible: hasNonZeroNumber(log?.billing_sell_base_amount),
        },
        {
          key: 'cost_floor',
          label: t('log.detail.fields.billing_cost_floor_base_amount'),
          value: renderAmount(log?.billing_cost_floor_base_amount, 'CNY'),
          visible: hasNonZeroNumber(log?.billing_cost_floor_base_amount),
        },
        {
          key: 'selected_sell',
          label: t('log.detail.fields.billing_selected_sell_base_amount'),
          value: renderAmount(log?.billing_selected_sell_base_amount, 'CNY'),
          visible: hasNonZeroNumber(log?.billing_selected_sell_base_amount),
        },
        {
          key: 'cost_floor_triggered',
          label: t('log.detail.fields.billing_cost_floor_triggered'),
          value: log?.billing_cost_floor_triggered
            ? t('log.detail.billing_explanation.yes')
            : t('log.detail.billing_explanation.no'),
          visible: log?.billing_cost_floor_triggered === true,
        },
        {
          key: 'pricing_decision_reason',
          label: t('log.detail.fields.billing_pricing_decision_reason'),
          value: renderText(log?.billing_pricing_decision_reason),
          pre: true,
          visible: hasText(log?.billing_pricing_decision_reason),
        },
      ]),
    );
  }

  return (
    <div className='router-billing-explain-stack'>
      {renderBillingFormulaCard(log, t)}
      {groups}
    </div>
  );
}

function normalizeLogDetail(data) {
  return {
    ...(data || {}),
    // Prefer charge-amount fields, fall back to legacy quota payloads for old logs.
    chargeAmount: Number(data?.charge_amount ?? data?.quota ?? 0),
    userDailyChargeAmount: Number(data?.user_daily_charge_amount ?? data?.user_daily_quota ?? 0),
    userEmergencyChargeAmount: Number(
      data?.user_emergency_charge_amount ?? data?.user_emergency_quota ?? 0,
    ),
    billingChargeAmount: Number(data?.billing_charge_amount ?? 0),
    estimatedChargeAmount: Number(data?.estimated_charge_amount ?? 0),
    billingChargeDeltaAmount: Number(data?.billing_charge_delta_amount ?? 0),
    billingPromptTokenDelta: Number(data?.billing_prompt_token_delta ?? 0),
    billingOutputTokenDelta: Number(data?.billing_output_token_delta ?? 0),
    billingImageToolCalls: Number(data?.billing_image_tool_calls ?? 0),
    billingImageToolOutputTokens: Number(
      data?.billing_image_tool_output_tokens ?? 0,
    ),
    billingImageToolAmount: Number(data?.billing_image_tool_amount ?? 0),
    billingImageToolChargeAmount: Number(data?.billing_image_tool_charge_amount ?? 0),
  };
}

function renderRouteOutcomeTags(log, fallbackAttempts, t) {
  const failed = Number(log?.type) === 6;
  const fallbackCount = Math.max(
    Number(log?.fallback_count || 0),
    Array.isArray(fallbackAttempts) ? fallbackAttempts.length : 0,
  );
  return (
    <div className='router-route-explain-tags'>
      <AppTag color={failed ? 'red' : 'green'} className='router-tag'>
        {failed
          ? t('log.detail.route.outcome.failed')
          : t('log.detail.route.outcome.succeeded')}
      </AppTag>
      <AppTag color={fallbackCount > 0 ? 'orange' : 'blue'} className='router-tag'>
        {fallbackCount > 0
          ? t('log.detail.route.outcome.fallback', { count: fallbackCount })
          : t('log.detail.route.outcome.direct')}
      </AppTag>
    </div>
  );
}

function renderFallbackAttemptCards(attempts, t) {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return <div className='router-route-attempt-empty'>-</div>;
  }
  return (
    <div className='router-route-attempt-list'>
      {attempts.map((attempt, index) => {
        const attemptNo = Number(attempt?.attempt || 0) || index + 1;
        return (
          <div
            className='router-route-attempt-card'
            key={`${attemptNo}-${attempt?.channel_id || index}`}
          >
            <div className='router-route-attempt-head'>
              <span>
                {t('log.detail.route.attempt_title', {
                  attempt: attemptNo,
                })}
              </span>
              <AppTag color='red' className='router-tag'>
                HTTP {attempt?.status || '-'}
              </AppTag>
            </div>
            <div className='router-route-attempt-grid'>
              <span>{t('log.detail.route.attempt_fields.channel')}</span>
              <strong>{renderText(attempt?.channel_name || attempt?.channel_id)}</strong>
              <span>{t('log.detail.route.attempt_fields.model')}</span>
              <strong>{renderText(attempt?.model)}</strong>
              <span>{t('log.detail.route.attempt_fields.endpoint')}</span>
              <strong>{renderText(attempt?.endpoint)}</strong>
              <span>{t('log.detail.route.attempt_fields.protocol')}</span>
              <strong>{renderText(attempt?.protocol)}</strong>
              <span>{t('log.detail.route.attempt_fields.error_code')}</span>
              <strong>{renderText(attempt?.error_code)}</strong>
              <span>{t('log.detail.route.attempt_fields.error')}</span>
              <strong>{renderText(attempt?.error)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderRouteDecisionCard(decision, currentPagePath, t) {
  if (!decision) {
    return <div className='router-route-attempt-empty'>-</div>;
  }
  const renderChannel = (channelID, channelName = '') => {
    const id = renderText(channelID);
    if (id === '-') {
      return '-';
    }
    return (
      <AppTag
        className='router-tag'
        as={Link}
        to={`/admin/channel/detail/${id}`}
        state={{ from: currentPagePath }}
      >
        {renderText(channelName) === '-' ? id : channelName}
      </AppTag>
    );
  };
  return (
    <div className='router-route-decision-card'>
      <div className='router-route-decision-head'>
        <AppTag color='blue' className='router-tag'>
          {t(`log.detail.route.decision.source.${decision.source || 'unknown'}`)}
        </AppTag>
        <span>{t(`log.detail.route.decision.mode.${decision.selection_mode || 'unknown'}`)}</span>
      </div>
      <div className='router-route-decision-grid'>
        <span>{t('log.detail.route.decision.fields.candidates')}</span>
        <div className='router-route-decision-candidates'>
          {decision.candidate_channel_ids.length > 0
            ? decision.candidate_channel_ids.map((channelID) => (
                <React.Fragment key={channelID}>
                  {renderChannel(channelID)}
                </React.Fragment>
              ))
            : '-'}
        </div>
        {decision.filtered_candidates.length > 0 && (
          <>
            <span>{t('log.detail.route.decision.fields.filtered_candidates')}</span>
            <div className='router-route-decision-candidates'>
              {decision.filtered_candidates.map((candidate, index) => (
                <span key={`${candidate?.channel_id || 'unknown'}-${candidate?.reason || index}`}>
                  {renderChannel(candidate?.channel_id)}{' '}
                  <AppTag color='grey' className='router-tag'>
                    {t(`log.detail.route.decision.reasons.${candidate?.reason || 'unknown'}`)}
                  </AppTag>
                </span>
              ))}
            </div>
          </>
        )}
        <span>{t('log.detail.route.decision.fields.initial_channel')}</span>
        <strong>{renderChannel(decision.initial_channel_id, decision.initial_channel_name)}</strong>
        <span>{t('log.detail.route.decision.fields.final_channel')}</span>
        <strong>{renderChannel(decision.final_channel_id, decision.final_channel_name)}</strong>
        <span>{t('log.detail.route.decision.fields.priority')}</span>
        <strong>{Number(decision.selected_priority || 0)}</strong>
      </div>
    </div>
  );
}

const LogDetail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPagePath = `${location.pathname}${location.search}${location.hash}`;
  const { id } = useParams();
  const isAdminPage = location.pathname.startsWith('/admin/');
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState(null);

  const listPath = useMemo(
    () =>
      `${isAdminPage ? '/admin/log' : '/workspace/log'}${location.search || ''}`,
    [isAdminPage, location.search],
  );

  const fallbackAttempts = useMemo(
    () => parseFallbackAttempts(log?.fallback_attempts),
    [log?.fallback_attempts],
  );
  const routeDecision = useMemo(
    () => parseRouteDecision(log?.route_decision),
    [log?.route_decision],
  );

  const publicModelName = getLogPublicModelName(log);
  const actualModelName = getLogActualModelName(log);

  const routeExplanationItems = useMemo(
    () => {
      const items = [
        ...(isAdminPage
          ? [
              {
                key: 'channel',
                label: t('log.detail.route.fields.channel_target'),
                value: log?.channel ? (
                  <AppTag
                    className='router-tag'
                    as={Link}
                    to={`/admin/channel/detail/${log.channel}`}
                    state={{ from: currentPagePath }}
                  >
                    {log?.channel_name || log?.channel}
                  </AppTag>
                ) : (
                  '-'
                ),
              },
            ]
          : []),
        {
          key: 'model',
          label: t('log.detail.route.fields.published_model'),
          value: renderText(publicModelName),
        },
      ];
      if (isAdminPage) {
        items.push(
          {
            key: 'route_decision',
            label: t('log.detail.route.fields.route_decision'),
            value: renderRouteDecisionCard(routeDecision, currentPagePath, t),
            span: true,
            visible: Boolean(routeDecision),
          },
          {
            key: 'actual_model',
            label: t('log.detail.route.fields.channel_model'),
            value: renderText(actualModelName),
          },
          {
            key: 'upstream_endpoint',
            label: t('log.detail.route.fields.upstream_endpoint'),
            value: renderText(log?.upstream_endpoint),
          },
          {
            key: 'upstream_protocol',
            label: t('log.detail.route.fields.upstream_protocol'),
            value: renderText(log?.upstream_protocol),
          },
        );
      }
      items.push(
        {
          key: 'stream',
          label: t('log.detail.route.fields.stream_mode'),
          value: renderBoolean(log?.is_stream),
        },
        {
          key: 'latency',
          label: t('log.detail.route.fields.elapsed_time'),
          value: log?.elapsed_time ? `${log.elapsed_time} ms` : '-',
        },
        {
          key: 'estimate_source',
          label: t('log.detail.route.fields.estimate_source'),
          value: renderText(log?.billing_estimate_source),
        },
        {
          key: 'estimate_estimator',
          label: t('log.detail.route.fields.estimate_estimator'),
          value: renderText(log?.billing_estimate_estimator),
        },
        {
          key: 'estimate_precision',
          label: t('log.detail.route.fields.estimate_precision'),
          value: renderEstimatePrecision(log?.billing_estimate_precision, t),
        },
        {
          key: 'settlement_mode',
          label: t('log.detail.route.fields.settlement_mode'),
          value: renderText(log?.billing_settlement_mode),
        },
        {
          key: 'trace_id',
          label: t('log.detail.route.fields.trace_id'),
          value: renderText(log?.trace_id),
        },
        {
          key: 'fallback_count',
          label: t('log.detail.route.fields.fallback_count'),
          value: Number(log?.fallback_count || 0),
        },
        {
          key: 'relay_error',
          label: t('log.detail.route.fields.relay_error'),
          value: renderRelayError(log),
          span: true,
        },
      );
      if (isAdminPage) {
        items.push({
          key: 'fallback_attempts',
          label: t('log.detail.route.fields.fallback_attempts'),
          value: renderFallbackAttemptCards(fallbackAttempts, t),
          span: true,
        });
      }
      return items.filter((item) => item.visible !== false);
    },
    [actualModelName, currentPagePath, fallbackAttempts, isAdminPage, log, publicModelName, routeDecision, t],
  );

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isAdminPage
        ? `/api/v1/admin/log/${id}`
        : `/api/v1/public/log/${id}`;
      const res = await API.get(endpoint);
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('log.messages.load_failed'));
        return;
      }
      setLog(normalizeLogDetail(data || null));
    } catch (error) {
      showError(error?.message || t('log.messages.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [id, isAdminPage, t]);

  useEffect(() => {
    loadDetail().then();
  }, [loadDetail]);

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          {
            key: 'section',
            label: isAdminPage
              ? t('header.operation')
              : t('header.mine'),
          },
          {
            key: 'log-list',
            label: t('header.log'),
            onClick: () => navigate(listPath),
          },
          {
            key: 'log-current',
            label: renderText(log?.id || id),
            active: true,
          },
        ]}
        title={t('log.detail.title')}
      />
      <div className='router-entity-detail-page'>
        {loading ? (
          <div className='router-empty-cell'>{t('common.loading')}</div>
        ) : (
          <>
            <AppDetailSection title={t('log.detail.sections.basic')} titleTag='div'>
                  <div className='router-detail-grid'>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.id')}
                      </div>
                      <pre className='router-detail-value'>
                        {renderText(log?.id)}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.time')}
                      </div>
                      <pre className='router-detail-value'>
                        {log?.created_at
                          ? timestamp2string(log.created_at)
                          : '-'}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.type')}
                      </div>
                      <div className='router-detail-value'>
                        {renderType(log?.type, t)}
                      </div>
                    </div>
                    {isAdminPage ? (
                      <div className='router-detail-item'>
                        <div className='router-detail-label'>
                          {t('log.detail.fields.channel')}
                        </div>
                        <div className='router-detail-value'>
                          {log?.channel ? (
                              <AppTag
                                className='router-tag'
                                as={Link}
                                to={`/admin/channel/detail/${log.channel}`}
                                state={{ from: currentPagePath }}
                              >
                                {log?.channel_name || log?.channel}
                              </AppTag>
                            ) : (
                              '-'
                            )}
                        </div>
                      </div>
                    ) : null}
                    {isAdminPage ? (
                      <div className='router-detail-item'>
                        <div className='router-detail-label'>
                          {t('log.detail.fields.group')}
                        </div>
                        <div className='router-detail-value'>
                          {log?.group_id ? (
                            <AppTag
                              className='router-tag'
                              as={Link}
                              to={`/admin/group/detail/${log.group_id}`}
                              state={{ from: currentPagePath }}
                            >
                              {log?.group_name || log?.group_id}
                            </AppTag>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                    ) : null}
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.model')}
                      </div>
                      <pre className='router-detail-value router-monospace-value'>
                        {renderText(publicModelName)}
                      </pre>
                    </div>
                    {isAdminPage ? (
                      <div className='router-detail-item'>
                        <div className='router-detail-label'>
                          {t('log.detail.fields.channel_model')}
                        </div>
                        <pre className='router-detail-value router-monospace-value'>
                          {renderText(actualModelName)}
                        </pre>
                      </div>
                    ) : null}
                    {isAdminPage ? (
                      <div className='router-detail-item'>
                        <div className='router-detail-label'>
                          {t('log.detail.fields.username')}
                        </div>
                        <pre className='router-detail-value'>
                          {renderText(log?.username)}
                        </pre>
                      </div>
                    ) : null}
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.token_name')}
                      </div>
                      <pre className='router-detail-value'>
                        {renderText(log?.token_name)}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.trace_id')}
                      </div>
                      <pre className='router-detail-value router-monospace-value'>
                        {renderText(log?.trace_id)}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.prompt_tokens')}
                      </div>
                      <pre className='router-detail-value'>
                        {log?.prompt_tokens ?? '-'}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.completion_tokens')}
                      </div>
                      <pre className='router-detail-value'>
                        {log?.completion_tokens ?? '-'}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.quota')}
                      </div>
                      <div className='router-detail-value'>
                        {typeof log?.chargeAmount === 'number'
                          ? renderDisplayAmount(log.chargeAmount, t, 6)
                          : '-'}
                      </div>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.billing_source')}
                      </div>
                      <pre className='router-detail-value'>
                        {renderBillingSource(log?.billing_source, t)}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.user_daily_quota')}
                      </div>
                      <div className='router-detail-value'>
                        {typeof log?.userDailyChargeAmount === 'number'
                          ? renderDisplayAmount(log.userDailyChargeAmount, t, 6)
                          : '-'}
                      </div>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.user_emergency_quota')}
                      </div>
                      <div className='router-detail-value'>
                        {typeof log?.userEmergencyChargeAmount === 'number'
                          ? renderDisplayAmount(log.userEmergencyChargeAmount, t, 6)
                          : '-'}
                      </div>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.elapsed_time')}
                      </div>
                      <pre className='router-detail-value'>
                        {log?.elapsed_time ? `${log.elapsed_time} ms` : '-'}
                      </pre>
                    </div>
                    <div className='router-detail-item'>
                      <div className='router-detail-label'>
                        {t('log.detail.fields.is_stream')}
                      </div>
                      <pre className='router-detail-value'>
                        {renderBoolean(log?.is_stream)}
                      </pre>
                    </div>
                  </div>
            </AppDetailSection>

            <AppDetailSection title={t('log.detail.sections.route')} titleTag='div'>
                  <div className='router-detail-grid'>
                    <div className='router-detail-item router-detail-item-span-2'>
                      <div className='router-route-explain-header'>
                        <div className='router-detail-label'>
                          {t('log.detail.route.summary_title')}
                        </div>
                        {renderRouteOutcomeTags(log, fallbackAttempts, t)}
                      </div>
                      <pre className='router-detail-value'>
                        {renderRouteExplanationSummary(log, t, isAdminPage)}
                      </pre>
                    </div>
                    {routeExplanationItems.map((item) => (
                      <div
                        key={item.key}
                        className={`router-detail-item${item.span ? ' router-detail-item-span-2' : ''}`}
                      >
                        <div className='router-detail-label'>{item.label}</div>
                        <div className='router-detail-value'>{item.value}</div>
                      </div>
                    ))}
                  </div>
            </AppDetailSection>

            <AppDetailSection title={t('log.detail.sections.billing')} titleTag='div'>
              {renderBillingSnapshot(log, t, isAdminPage)}
            </AppDetailSection>

            <AppDetailSection title={t('log.detail.sections.content')} titleTag='div'>
                  <pre className='router-detail-pre'>
                    {renderText(log?.content)}
                  </pre>
            </AppDetailSection>
          </>
        )}
      </div>
    </div>
  );
};

export default LogDetail;
