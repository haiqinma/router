import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API, showError } from '../../helpers';
import { formatDecimalNumber } from '../../helpers/render';
import {
  AppButton,
  AppFilterHeader,
  AppInput,
  AppSelect,
  AppSegmented,
  AppSpin,
  AppTable,
  AppTag,
} from '../../router-ui';
import './BillingOverview.css';

const formatCNY = (value) => `¥${formatDecimalNumber(value || 0, 2)}`;
const formatCount = (value) => formatDecimalNumber(value || 0, 0);
const formatPercent = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;

const riskLevel = (critical, warning) => {
  if (Number(critical || 0) > 0) return 'critical';
  if (Number(warning || 0) > 0) return 'warning';
  return 'ok';
};

const recentRange = () => {
  const end = Math.floor(Date.now() / 1000);
  return { start_at: end - 7 * 24 * 60 * 60, end_at: end };
};

const positiveTimestamp = (value, fallback) => {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
};

const toDateTimeLocalValue = (timestamp) => {
  const date = new Date(Number(timestamp || 0) * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const timestampFromDateTimeLocal = (value, fallback) => {
  const timestamp = Math.floor(new Date(value || '').getTime() / 1000);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
};

const normalize = (payload) => ({
  request_count: Number(payload?.request_count || 0),
  router_consumed_yyc: Number(payload?.router_consumed_yyc || 0),
  sell_base_amount: Number(payload?.sell_base_amount || 0),
  procurement_cost_base_amount: Number(payload?.procurement_cost_base_amount || 0),
  gross_profit_base_amount: Number(payload?.gross_profit_base_amount || 0),
  gross_margin: Number(payload?.gross_margin || 0),
  configured_cost_request_count: Number(payload?.configured_cost_request_count || 0),
  estimated_cost_request_count: Number(payload?.estimated_cost_request_count || 0),
  pending_cost_request_count: Number(payload?.pending_cost_request_count || 0),
  retry_cost_request_count: Number(payload?.retry_cost_request_count || 0),
  unconfigured_cost_request_count: Number(payload?.unconfigured_cost_request_count || 0),
  cost_floor_triggered_count: Number(payload?.cost_floor_triggered_count || 0),
  cost_floor_triggered_amount: Number(payload?.cost_floor_triggered_amount || 0),
  items: Array.isArray(payload?.items) ? payload.items : [],
});

const buildOperatingRiskItems = (items, t) => {
  const risks = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const modelKey = item.dimension_key || '';
    const model = item.dimension_name || modelKey || '-';
    const requestCount = Number(item.request_count || 0);
    const unconfigured = Number(item.unconfigured_cost_request_count || 0);
    const estimated = Number(item.estimated_cost_request_count || 0);
    const pending = Number(item.pending_cost_request_count || 0);
    const retry = Number(item.retry_cost_request_count || 0);
    const configured = Number(item.configured_cost_request_count || 0);
    const profit = Number(item.gross_profit_base_amount || 0);
    const margin = Number(item.gross_margin || 0);
    const floorCount = Number(item.cost_floor_triggered_count || 0);
    const push = (type, level, count, weight, text, target) => risks.push({
      key: `${model}-${type}`,
      type,
      level,
      model: modelKey,
      count,
      weight,
      text,
      target,
    });
    if (unconfigured > 0) push('unconfigured', 'critical', unconfigured, unconfigured, t('billing.overview.operating_risks.unconfigured', { model, count: formatCount(unconfigured) }), 'procurement');
    if (configured > 0 && profit < 0) push('loss', 'critical', configured, Math.abs(profit), t('billing.overview.operating_risks.loss', { model, amount: formatCNY(profit) }), 'profit');
    else if (configured > 0 && margin < 0.1) push('low_margin', 'warning', configured, requestCount, t('billing.overview.operating_risks.low_margin', { model, margin: formatPercent(margin) }), 'profit');
    if (floorCount > 0) push('floor', 'warning', floorCount, floorCount, t('billing.overview.operating_risks.floor', { model, count: formatCount(floorCount) }), 'profit');
    if (estimated > 0) push('estimated', 'warning', estimated, estimated, t('billing.overview.operating_risks.estimated', { model, count: formatCount(estimated) }), 'procurement');
    if (pending > 0) push('pending', 'warning', pending, pending, t('billing.overview.operating_risks.pending', { model, count: formatCount(pending) }), 'procurement');
    if (retry > 0) push('retry', 'critical', retry, retry, t('billing.overview.operating_risks.retry', { model, count: formatCount(retry) }), 'procurement');
  });
  return risks.sort((left, right) => (
    left.level === right.level
      ? right.weight - left.weight
      : left.level === 'critical' ? -1 : 1
  ));
};

function BillingOverview() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const initialContext = useMemo(() => {
    const defaults = recentRange();
    const params = new URLSearchParams(location.search);
    return {
      startAt: positiveTimestamp(params.get('start_at'), defaults.start_at),
      endAt: positiveTimestamp(params.get('end_at'), defaults.end_at),
      channelID: params.get('channel_id') || '',
      modelName: params.get('model') || '',
    };
  }, []);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(() => normalize({}));
  const [modelReport, setModelReport] = useState(() => normalize({}));
  const [health, setHealth] = useState({ status: 'ok', issues: [], critical_count: 0, warning_count: 0 });
  const [trend, setTrend] = useState([]);
  const [startAt, setStartAt] = useState(initialContext.startAt);
  const [endAt, setEndAt] = useState(initialContext.endAt);
  const [channelID, setChannelID] = useState(initialContext.channelID);
  const [modelName, setModelName] = useState(initialContext.modelName);
  const [channelOptions, setChannelOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [dimension, setDimension] = useState('channel');

  const financeContext = useMemo(() => ({
    start_at: startAt,
    end_at: endAt,
    channel_id: channelID,
    model: modelName,
  }), [channelID, endAt, modelName, startAt]);

  const buildTarget = useCallback((pathname, overrides = {}) => {
    const params = new URLSearchParams();
    Object.entries({ ...financeContext, ...overrides }).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    });
    const currentParams = new URLSearchParams();
    Object.entries(financeContext).forEach(([key, value]) => {
      if (value !== '') currentParams.set(key, String(value));
    });
    params.set('return_to', `${location.pathname}?${currentParams.toString()}`);
    return `${pathname}?${params.toString()}`;
  }, [financeContext, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(financeContext).forEach(([key, value]) => {
      if (value !== '') params.set(key, String(value));
    });
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  }, [financeContext, location.pathname, navigate]);

  const load = useCallback(async () => {
    if (!startAt || !endAt || endAt < startAt) {
      showError(t('billing.overview.invalid_time'));
      return;
    }
    setLoading(true);
    try {
      const filters = { start_at: startAt, end_at: endAt, channel_id: channelID, model: modelName };
      const optionRange = recentRange();
      const [reportResponse, filteredModelResponse, modelOptionsResponse, channelOptionsResponse, healthResponse, trendResponse] = await Promise.all([
        API.get('/api/v1/admin/billing/procurement-report', { params: { ...filters, group_by: 'channel', cost_scope: 'all' } }),
        API.get('/api/v1/admin/billing/procurement-report', { params: { ...filters, group_by: 'model', cost_scope: 'all' } }),
        API.get('/api/v1/admin/billing/procurement-report', { params: { ...optionRange, group_by: 'model', cost_scope: 'all' } }),
        API.get('/api/v1/admin/billing/procurement-report', { params: { ...optionRange, group_by: 'channel', cost_scope: 'all' } }),
        API.get('/api/v1/admin/billing/health'),
        API.get('/api/v1/admin/billing/procurement-trend', { params: filters }),
      ]);
      if (!reportResponse.data?.success) throw new Error(reportResponse.data?.message);
      setReport(normalize(reportResponse.data.data));
      if (filteredModelResponse.data?.success) setModelReport(normalize(filteredModelResponse.data.data));
      if (modelOptionsResponse.data?.success) {
        const items = Array.isArray(modelOptionsResponse.data?.data?.items) ? modelOptionsResponse.data.data.items : [];
        setModelOptions(items.map((item) => ({ key: item.dimension_key, value: item.dimension_key, text: item.dimension_key })));
      }
      if (channelOptionsResponse.data?.success) {
        const items = Array.isArray(channelOptionsResponse.data?.data?.items) ? channelOptionsResponse.data.data.items : [];
        setChannelOptions(items.map((item) => ({ key: item.dimension_key, value: item.dimension_key, text: item.dimension_name || item.dimension_key })));
      }
      if (healthResponse.data?.success) setHealth(healthResponse.data.data || {});
      if (trendResponse.data?.success) setTrend(Array.isArray(trendResponse.data?.data?.items) ? trendResponse.data.data.items : []);
    } catch (error) {
      showError(error?.message || t('billing.overview.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [channelID, endAt, modelName, startAt, t]);

  useEffect(() => { load().then(); }, [load]);

  const hasRequests = report.request_count > 0;
  const knownRatio = hasRequests ? report.configured_cost_request_count / report.request_count : 0;
  const operatingRiskItems = buildOperatingRiskItems(modelReport.items, t);
  const configurationRisks = (Array.isArray(health.issues) ? health.issues : []).map((issue) => ({
    ...issue,
    source: 'configuration',
    level: issue.level || 'warning',
    count: Number(issue.count || 0),
    target: buildTarget('/admin/finance/procurement'),
  }));
  const configurationRiskCount = Number(health.critical_count || 0) + Number(health.warning_count || 0);
  const operatingCriticalCount = operatingRiskItems.filter((item) => item.level === 'critical').length;
  const operatingWarningCount = operatingRiskItems.length - operatingCriticalCount;
  const negativeChannelCount = report.items.filter((item) => Number(item.gross_profit_base_amount || 0) < 0).length;
  const lowMarginModelCount = modelReport.items.filter((item) => Number(item.configured_cost_request_count || 0) > 0 && Number(item.gross_margin || 0) >= 0 && Number(item.gross_margin || 0) < 0.1).length;
  const currentScopeRiskCount = operatingRiskItems.length;
  const priorityRisks = [
    ...operatingRiskItems.map((issue) => ({
      ...issue,
      source: 'operating',
      target: buildTarget(issue.target === 'profit' ? '/admin/finance/profit' : '/admin/finance/procurement', {
        model: issue.model,
        cost_scope: issue.target === 'procurement' && issue.type === 'unconfigured' ? 'unconfigured' : undefined,
      }),
    })),
    ...configurationRisks,
  ].sort((left, right) => (
    left.level === right.level ? Number(right.weight || right.count || 0) - Number(left.weight || left.count || 0) : left.level === 'critical' ? -1 : 1
  ));
  const overviewRows = [
    {
      key: 'profitability',
      dimension: t('billing.overview.dimensions.profitability.title'),
      primary: t('billing.overview.dimensions.profitability.primary', { revenue: formatCNY(report.sell_base_amount), profit: formatCNY(report.gross_profit_base_amount) }),
      secondary: t('billing.overview.dimensions.profitability.secondary', { margin: formatPercent(report.gross_margin), requests: formatCount(report.request_count) }),
      level: !hasRequests ? 'empty' : report.gross_profit_base_amount < 0 ? 'critical' : report.gross_margin < 0.1 ? 'warning' : 'ok',
      target: buildTarget('/admin/finance/profit'),
    },
    {
      key: 'cost_coverage',
      dimension: t('billing.overview.dimensions.cost_coverage.title'),
      primary: t('billing.overview.dimensions.cost_coverage.primary', { coverage: formatPercent(knownRatio) }),
      secondary: t('billing.overview.dimensions.cost_coverage.secondary', { configured: formatCount(report.configured_cost_request_count), unconfigured: formatCount(report.unconfigured_cost_request_count), pending: formatCount(report.pending_cost_request_count) }),
      level: !hasRequests ? 'empty' : report.unconfigured_cost_request_count > 0 || report.retry_cost_request_count > 0 ? 'critical' : knownRatio < 1 ? 'warning' : 'ok',
      target: buildTarget('/admin/finance/procurement', { cost_scope: report.unconfigured_cost_request_count > 0 ? 'unconfigured' : undefined }),
    },
    {
      key: 'channel',
      dimension: t('billing.overview.dimensions.channel.title'),
      primary: t('billing.overview.dimensions.channel.primary', { count: formatCount(report.items.length), loss: formatCount(negativeChannelCount) }),
      secondary: t('billing.overview.dimensions.channel.secondary'),
      level: !hasRequests ? 'empty' : negativeChannelCount > 0 ? 'critical' : 'ok',
      target: buildTarget('/admin/finance/procurement'),
    },
    {
      key: 'model',
      dimension: t('billing.overview.dimensions.model.title'),
      primary: t('billing.overview.dimensions.model.primary', { count: formatCount(modelReport.items.length), low: formatCount(lowMarginModelCount) }),
      secondary: t('billing.overview.dimensions.model.secondary'),
      level: !hasRequests ? 'empty' : lowMarginModelCount > 0 ? 'warning' : 'ok',
      target: buildTarget('/admin/finance/profit'),
    },
    {
      key: 'operating',
      dimension: t('billing.overview.dimensions.operating.title'),
      primary: t('billing.overview.dimensions.operating.primary', { count: formatCount(currentScopeRiskCount) }),
      secondary: t('billing.overview.dimensions.operating.secondary', { critical: formatCount(operatingCriticalCount), warning: formatCount(operatingWarningCount) }),
      level: riskLevel(operatingCriticalCount, operatingWarningCount),
      target: operatingRiskItems[0]?.target === 'procurement' ? buildTarget('/admin/finance/procurement', { model: operatingRiskItems[0]?.model, cost_scope: 'unconfigured' }) : buildTarget('/admin/finance/profit', { model: operatingRiskItems[0]?.model }),
    },
    {
      key: 'configuration',
      dimension: t('billing.overview.dimensions.configuration.title'),
      primary: t('billing.overview.dimensions.configuration.primary', { count: formatCount(configurationRiskCount) }),
      secondary: t('billing.overview.dimensions.configuration.secondary', { critical: formatCount(health.critical_count || 0), warning: formatCount(health.warning_count || 0) }),
      level: riskLevel(health.critical_count, health.warning_count),
      target: buildTarget('/admin/finance/procurement'),
    },
  ];

  const statusColor = (level) => (level === 'critical' ? 'red' : level === 'warning' ? 'orange' : level === 'empty' ? 'grey' : 'green');
  const statusLabel = (level) => t(`billing.overview.status.${level || 'ok'}`);

  const overviewColumns = [
    { title: t('billing.overview.overview_table.columns.dimension'), dataIndex: 'dimension', width: 160 },
    { title: t('billing.overview.overview_table.columns.primary'), dataIndex: 'primary', width: 240 },
    { title: t('billing.overview.overview_table.columns.secondary'), dataIndex: 'secondary' },
    { title: t('billing.overview.overview_table.columns.status'), dataIndex: 'level', width: 110, render: (value) => <AppTag color={statusColor(value)}>{statusLabel(value)}</AppTag> },
    { title: t('billing.overview.overview_table.columns.action'), dataIndex: 'target', width: 110, render: (target) => <Link to={target}>{t('billing.overview.actions.drilldown')}</Link> },
  ];

  const priorityColumns = [
    { title: t('billing.overview.priority.columns.source'), dataIndex: 'source', width: 96, render: (value) => t(`billing.overview.priority.sources.${value}`) },
    { title: t('billing.overview.priority.columns.level'), dataIndex: 'level', width: 88, render: (value) => <AppTag color={statusColor(value)}>{statusLabel(value)}</AppTag> },
    { title: t('billing.overview.priority.columns.issue'), key: 'issue', render: (_, row) => row.text || row.title || '-' },
    { title: t('billing.overview.priority.columns.impact'), key: 'impact', width: 120, align: 'right', render: (_, row) => formatCount(row.count) || '-' },
    { title: t('billing.overview.priority.columns.action'), key: 'action', width: 110, render: (_, row) => <Link to={row.target}>{row.source === 'configuration' || row.target.includes('/procurement') ? t('billing.overview.actions.procurement') : t('billing.overview.actions.profit')}</Link> },
  ];

  const channelColumns = [
    { title: t('billing.overview.channels.columns.channel'), key: 'channel', width: 200, render: (_, row) => row.dimension_name || row.dimension_key || '-' },
    { title: t('billing.overview.channels.columns.requests'), dataIndex: 'request_count', width: 100, align: 'right', render: formatCount },
    { title: t('billing.overview.channels.columns.revenue'), dataIndex: 'sell_base_amount', width: 130, align: 'right', render: formatCNY },
    { title: t('billing.overview.channels.columns.cost'), dataIndex: 'procurement_cost_base_amount', width: 130, align: 'right', render: formatCNY },
    { title: t('billing.overview.channels.columns.profit'), dataIndex: 'gross_profit_base_amount', width: 130, align: 'right', render: formatCNY },
    { title: t('billing.overview.channels.columns.margin'), dataIndex: 'gross_margin', width: 110, align: 'right', render: formatPercent },
    { title: t('billing.overview.channels.columns.coverage'), key: 'coverage', width: 130, align: 'right', render: (_, row) => formatPercent(Number(row.configured_cost_request_count || 0) / Math.max(Number(row.request_count || 0), 1)) },
    { title: t('billing.overview.channels.columns.actions'), key: 'actions', width: 170, render: (_, row) => <div className='billing-overview-actions'><Link to={buildTarget('/admin/finance/profit', { channel_id: row.dimension_key })}>{t('billing.overview.actions.profit')}</Link><Link to={buildTarget('/admin/finance/procurement', { channel_id: row.dimension_key })}>{t('billing.overview.actions.procurement')}</Link></div> },
  ];

  const modelColumns = [
    { title: t('billing.overview.models.columns.model'), key: 'model', width: 200, render: (_, row) => row.dimension_name || row.dimension_key || '-' },
    { title: t('billing.overview.models.columns.requests'), dataIndex: 'request_count', width: 100, align: 'right', render: formatCount },
    { title: t('billing.overview.models.columns.profit'), dataIndex: 'gross_profit_base_amount', width: 130, align: 'right', render: formatCNY },
    { title: t('billing.overview.models.columns.margin'), dataIndex: 'gross_margin', width: 110, align: 'right', render: formatPercent },
    { title: t('billing.overview.models.columns.coverage'), key: 'coverage', width: 130, align: 'right', render: (_, row) => formatPercent(Number(row.configured_cost_request_count || 0) / Math.max(Number(row.request_count || 0), 1)) },
    { title: t('billing.overview.models.columns.actions'), key: 'actions', width: 170, render: (_, row) => <div className='billing-overview-actions'><Link to={buildTarget('/admin/finance/profit', { model: row.dimension_key })}>{t('billing.overview.actions.profit')}</Link><Link to={buildTarget('/admin/finance/procurement', { model: row.dimension_key })}>{t('billing.overview.actions.procurement')}</Link></div> },
  ];

  const activeDimensionRows = dimension === 'channel' ? report.items.slice(0, 10) : modelReport.items.slice(0, 10);
  const activeDimensionColumns = dimension === 'channel' ? channelColumns : modelColumns;

  return (
    <div className='dashboard-container billing-overview-page'>
      <AppFilterHeader
        breadcrumbs={[{ key: 'finance', label: t('header.finance') }, { key: 'billing-overview', label: t('billing.overview.title'), active: true }]}
        actions={<AppButton className='router-page-button' color='blue' loading={loading} onClick={() => load().then()}>{t('common.refresh')}</AppButton>}
        query={<div className='billing-overview-filters'><AppInput className='billing-overview-time-input' type='datetime-local' value={toDateTimeLocalValue(startAt)} onChange={(e, { value }) => setStartAt(timestampFromDateTimeLocal(value, startAt))} /><AppInput className='billing-overview-time-input' type='datetime-local' value={toDateTimeLocalValue(endAt)} onChange={(e, { value }) => setEndAt(timestampFromDateTimeLocal(value, endAt))} /><AppSelect className='billing-overview-channel-select' clearable search options={channelOptions} value={channelID} placeholder={t('billing.overview.channel_placeholder')} onChange={(e, { value }) => setChannelID((value || '').toString())} /><AppSelect className='billing-overview-model-select' clearable search options={modelOptions} value={modelName} placeholder={t('billing.overview.model_placeholder')} onChange={(e, { value }) => setModelName((value || '').toString())} /></div>}
      />
      <div className='billing-overview-context'><span>{t('billing.overview.context.range', { start: toDateTimeLocalValue(startAt).replace('T', ' '), end: toDateTimeLocalValue(endAt).replace('T', ' ') })}</span><span>{t('billing.overview.context.currency')}</span></div>
      <AppSpin spinning={loading}>
        <section className='billing-overview-section'>
          <div className='billing-overview-section-heading'><h2>{t('billing.overview.overview_table.title')}</h2><span>{t('billing.overview.overview_table.summary', { risks: formatCount(currentScopeRiskCount) })}</span></div>
          <AppTable className='router-detail-table' size='small' pagination={false} rowKey='key' dataSource={overviewRows} columns={overviewColumns} scroll={{ x: 900 }} />
        </section>
        {priorityRisks.length > 0 ? <section className='billing-overview-section'>
          <div className='billing-overview-section-heading'><h2>{t('billing.overview.priority.title')}</h2><span>{t('billing.overview.priority.scope_note')}</span></div>
          <AppTable className='router-detail-table' size='small' pagination={false} rowKey={(row) => `${row.source}-${row.key}`} dataSource={priorityRisks.slice(0, 8)} columns={priorityColumns} scroll={{ x: 760 }} />
        </section> : null}
        <section className='billing-overview-section'>
          <div className='billing-overview-section-heading'><h2>{t(`billing.overview.${dimension === 'channel' ? 'channels' : 'models'}.title`)}</h2><div className='billing-overview-section-controls'><AppSegmented options={[{ value: 'channel', label: t('billing.overview.channels.title') }, { value: 'model', label: t('billing.overview.models.title') }]} value={dimension} onChange={(e, { value }) => setDimension(value)} /><Link to={buildTarget(dimension === 'channel' ? '/admin/finance/procurement' : '/admin/finance/profit')}>{t(`billing.overview.${dimension === 'channel' ? 'channels' : 'models'}.view_details`)}</Link></div></div>
          <div className='billing-overview-table-note'>{t(`billing.overview.${dimension === 'channel' ? 'channels' : 'models'}.sorted_note`)}</div>
          <AppTable className='router-detail-table' size='small' pagination={false} rowKey={(row) => row.dimension_key} dataSource={activeDimensionRows} columns={activeDimensionColumns} scroll={{ x: dimension === 'channel' ? 1000 : 840 }} locale={{ emptyText: t(`billing.overview.${dimension === 'channel' ? 'channels' : 'models'}.empty`) }} />
        </section>
        <section className='billing-overview-section'>
          <div className='billing-overview-section-heading'><h2>{t('billing.overview.trend.title')}</h2></div>
          <div className='billing-overview-trend'>{trend.map((item) => <div className='billing-overview-trend-row' key={item.day}><span>{item.day}</span><span>{t('billing.overview.trend.financials', { revenue: formatCNY(item.sell_base_amount), cost: formatCNY(item.procurement_cost_base_amount), profit: formatCNY(item.gross_profit_base_amount) })}</span></div>)}</div>
        </section>
      </AppSpin>
    </div>
  );
}

export default BillingOverview;
