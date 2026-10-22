import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppErrorState,
  AppSection,
  AppSegmented,
  AppSpin,
  AppTag,
  AppToolbar,
  AppTooltip,
} from '../../../router-ui';
import {
  CHANNEL_SORT_OPTIONS,
  CHANNEL_HEALTH_POINT_COLORS,
  EMPTY_CHANNEL_HEALTH_SUMMARY,
  buildChannelHealthHistory,
  formatCount,
  formatPercent,
  formatTimeRange,
  formatUpdatedAt,
  isActiveCircuitBreaker,
  normalizeCircuitBreakerState,
  toPercent,
  useAdminDashboardData,
} from '../dashboardShared';
import { DashboardSectionControls } from '../DashboardSectionControls';

// Channel health analytics, extracted from AdminDashboard's channels section so
// the channel shell (/admin/channel?tab=health) can host it inline without a
// full route swap. Self-contained: owns sort state, fetches its own
// section data, and renders its own toolbar (the shell provides breadcrumb+tabs).
// `injectedData` lets a parent that already loaded the `channels` section pass it
// in (e.g. the duty station reuses its strip fetch) — the internal fetch is then
// disabled so the same data isn't requested twice.
const ChannelHealthSection = ({ injectedData = null }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [channelSort, setChannelSort] = useState('health');

  const self = useAdminDashboardData('channels', undefined, {
    enabled: !injectedData,
  });
  const { dashboard, loading, error, reload } = injectedData || self;

  const channelSortOptions = useMemo(
    () =>
      CHANNEL_SORT_OPTIONS.map((value) => ({
        value,
        label: t(`dashboard.admin.channels.sort.${value}`),
      })),
    [t]
  );

  const renderCapabilities = useCallback(
    (raw) => {
      if (!Array.isArray(raw) || raw.length === 0) return '-';
      return raw
        .map((item) =>
          t(`dashboard.admin.capabilities.${item}`, { defaultValue: item })
        )
        .join(' / ');
    },
    [t]
  );

  const channelHealthData = useMemo(
    () =>
      (dashboard.top_channels || []).map((row, index) => ({
        id: row.id || `channel-${index}`,
        channel_id: row.id || '',
        name: row.name || row.id || '-',
        status: Number(row.status || 0),
        capabilities: renderCapabilities(row.capabilities),
        health_score: Number(row.health_score || 0),
        request_count: Number(row.recent_request_count || 0),
        health_level: row.health_level || 'unknown',
        pass_rate_percent: toPercent(row.pass_rate),
        coverage_rate_percent: toPercent(row.coverage_rate),
        avg_latency_ms: Number(row.avg_latency_ms || 0),
        selected_model_count: Number(row.selected_model_count || 0),
        tested_model_count: Number(row.tested_model_count || 0),
        tested_endpoint_count: Number(row.tested_endpoint_count || 0),
        has_test_data: Boolean(row.has_test_data),
        supported_count: Number(row.supported_count || 0),
        unsupported_count: Number(row.unsupported_count || 0),
        last_tested_at: Number(row.last_tested_at || 0),
        circuit_breaker: row.circuit_breaker || null,
        health_points: Array.isArray(row.health_points)
          ? row.health_points
          : [],
        health_history: buildChannelHealthHistory(row.health_points),
      })),
    [dashboard.top_channels, renderCapabilities]
  );

  const channelHealthSummary = useMemo(
    () => ({
      ...EMPTY_CHANNEL_HEALTH_SUMMARY,
      ...(dashboard.channel_health_summary || {}),
    }),
    [dashboard.channel_health_summary]
  );

  const sortedChannelHealthData = useMemo(() => {
    const items = [...channelHealthData];
    items.sort((left, right) => {
      if (channelSort === 'pass_rate') {
        if (left.pass_rate_percent !== right.pass_rate_percent) {
          return right.pass_rate_percent - left.pass_rate_percent;
        }
      } else if (channelSort === 'latency') {
        const leftLatency = Number(left.avg_latency_ms || 0);
        const rightLatency = Number(right.avg_latency_ms || 0);
        if (leftLatency !== rightLatency) {
          if (leftLatency <= 0) return 1;
          if (rightLatency <= 0) return -1;
          return leftLatency - rightLatency;
        }
      } else if (channelSort === 'requests') {
        // Busiest-first by the same five-hour request window used by the health
        // strip; ties break on health_score desc so high-volume + risky channels
        // still float to the top.
        const leftReq = Number(left.request_count || 0);
        const rightReq = Number(right.request_count || 0);
        if (leftReq !== rightReq) {
          return rightReq - leftReq;
        }
        if (left.health_score !== right.health_score) {
          return right.health_score - left.health_score;
        }
      } else if (left.health_score !== right.health_score) {
        return right.health_score - left.health_score;
      }
      // Fallback: latency asc (smaller first), then name asc
      const leftLatency = Number(left.avg_latency_ms || 0);
      const rightLatency = Number(right.avg_latency_ms || 0);
      if (leftLatency !== rightLatency) {
        if (leftLatency <= 0) return 1;
        if (rightLatency <= 0) return -1;
        return leftLatency - rightLatency;
      }
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
    return items;
  }, [channelHealthData, channelSort]);

  const renderHealthTag = useCallback(
    (level) => {
      const normalized = (level || 'unknown').toString().trim().toLowerCase();
      const color =
        normalized === 'healthy'
          ? 'green'
          : normalized === 'warning'
          ? 'orange'
          : normalized === 'critical'
          ? 'red'
          : 'grey';
      return (
        <AppTag color={color} className='router-tag'>
          {t(`dashboard.admin.health.level.${normalized}`, {
            defaultValue: t('dashboard.admin.health.level.unknown'),
          })}
        </AppTag>
      );
    },
    [t]
  );

  const renderCircuitBreakerTag = useCallback(
    (circuitBreaker) => {
      const state = normalizeCircuitBreakerState(circuitBreaker?.state);
      if (!state || state === 'recovered') {
        return null;
      }
      const color =
        state === 'open' ? 'red' : state === 'half_open' ? 'orange' : 'grey';
      const details = [
        t(`dashboard.admin.channels.circuit.state.${state}`, {
          defaultValue: t('dashboard.admin.channels.circuit.state.unknown'),
        }),
        circuitBreaker?.reason
          ? `${t('dashboard.admin.channels.circuit.reason')}: ${
              circuitBreaker.reason
            }`
          : null,
        circuitBreaker?.success_rate !== null &&
        circuitBreaker?.success_rate !== undefined
          ? `${t(
              'dashboard.admin.channels.circuit.success_rate'
            )}: ${formatPercent(circuitBreaker.success_rate)}`
          : null,
        circuitBreaker?.disabled_at
          ? `${t(
              'dashboard.admin.channels.circuit.disabled_at'
            )}: ${formatUpdatedAt(circuitBreaker.disabled_at)}`
          : null,
        circuitBreaker?.recover_after
          ? `${t(
              'dashboard.admin.channels.circuit.recover_after'
            )}: ${formatUpdatedAt(circuitBreaker.recover_after)}`
          : null,
      ].filter(Boolean);
      return (
        <AppTooltip title={details.join(' / ')}>
          <AppTag color={color} className='router-tag'>
            {t(`dashboard.admin.channels.circuit.state.${state}`, {
              defaultValue: t('dashboard.admin.channels.circuit.state.unknown'),
            })}
          </AppTag>
        </AppTooltip>
      );
    },
    [t]
  );

  if (error && !loading) {
    return (
      <AppSection className='admin-dashboard-section'>
        <AppErrorState
          message={error?.message || t('common.load_failed')}
          onRetry={reload}
          retryText={t('common.retry')}
        />
      </AppSection>
    );
  }

  return (
    <AppSpin spinning={loading} className='admin-dashboard-content-spin'>
      <AppSection className='admin-dashboard-section'>
        <div className='admin-dashboard-subsection-header'>
          <div className='admin-dashboard-subsection-header-main'>
            <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
              {t('dashboard.admin.sections.channels')}
            </div>
          </div>
          <AppToolbar
            className='admin-dashboard-section-toolbar'
            end={
              <DashboardSectionControls
                generatedAt={dashboard.generated_at}
                loading={loading}
                onRefresh={reload}
                extra={
                  <AppSegmented
                    className='admin-dashboard-segmented'
                    options={channelSortOptions}
                    value={channelSort}
                    onChange={(e, { value }) => setChannelSort(value)}
                  />
                }
              />
            }
          />
        </div>
        <div className='admin-dashboard-channel-bells'>
          {[
            {
              key: 'active_circuit_breaker',
              label: t('dashboard.admin.health.summary.active_circuit_breaker'),
              value: Number(
                channelHealthSummary.active_circuit_breaker_count || 0
              ),
              tone: 'critical',
              to: '/admin/channel?tab=alerts&type=circuit&status=active',
            },
            {
              key: 'risk_count',
              label: t('dashboard.admin.health.summary.risk_count'),
              value: Number(channelHealthSummary.risk_count || 0),
              tone: 'critical',
            },
            {
              key: 'needs_retest',
              label: t('dashboard.admin.health.summary.needs_retest'),
              value: Number(channelHealthSummary.needs_retest || 0),
              tone: 'warning',
            },
            {
              key: 'high_latency',
              label: t('dashboard.admin.health.summary.high_latency'),
              value: Number(channelHealthSummary.high_latency_count || 0),
              tone: 'warning',
            },
          ].map((bell) =>
            bell.to ? (
              <button
                type='button'
                key={bell.key}
                className={`admin-dashboard-channel-bell admin-dashboard-channel-bell-cta is-${
                  bell.tone
                }${bell.value > 0 ? ' is-active' : ''}`}
                onClick={() => navigate(bell.to)}
              >
                <div className='admin-dashboard-channel-bell-value'>
                  {bell.value}
                </div>
                <div className='admin-dashboard-channel-bell-label'>
                  {bell.label}
                </div>
              </button>
            ) : (
              <div
                key={bell.key}
                className={`admin-dashboard-channel-bell is-${bell.tone}${
                  bell.value > 0 ? ' is-active' : ''
                }`}
              >
                <div className='admin-dashboard-channel-bell-value'>
                  {bell.value}
                </div>
                <div className='admin-dashboard-channel-bell-label'>
                  {bell.label}
                </div>
              </div>
            )
          )}
        </div>
        <div className='admin-dashboard-channel-meta-strip'>
          <div className='admin-dashboard-channel-meta-item'>
            <span className='admin-dashboard-channel-meta-label'>
              {t('dashboard.admin.metrics.channels')}
            </span>
            <strong className='admin-dashboard-channel-meta-value'>
              {formatCount(dashboard.summary.channel_enabled)} /{' '}
              {formatCount(dashboard.summary.channel_total)}
            </strong>
          </div>
          <div className='admin-dashboard-channel-meta-item'>
            <span className='admin-dashboard-channel-meta-label'>
              {t('dashboard.admin.health.summary.avg_pass_rate')}
            </span>
            <strong className='admin-dashboard-channel-meta-value'>
              {formatPercent(channelHealthSummary.avg_pass_rate)}
            </strong>
          </div>
          <div className='admin-dashboard-channel-meta-item'>
            <span className='admin-dashboard-channel-meta-label'>
              {t('dashboard.admin.health.summary.avg_latency')}
            </span>
            <strong className='admin-dashboard-channel-meta-value'>
              {`${Math.round(
                Number(channelHealthSummary.avg_latency_ms || 0)
              )} ms`}
            </strong>
          </div>
        </div>
        <div className='admin-dashboard-usage-rank'>
          {sortedChannelHealthData.length === 0 ? (
            <div className='admin-dashboard-empty'>
              {t('dashboard.admin.empty.channels')}
            </div>
          ) : (
            <div className='admin-dashboard-channel-health-list'>
              <div className='admin-dashboard-channel-health-list-header'>
                <div className='admin-dashboard-channel-health-list-title'>
                  <div className='admin-dashboard-card-title'>
                    {t('dashboard.admin.channels.history.title')}
                  </div>
                  <div className='admin-dashboard-channel-health-hint'>
                    {t('dashboard.admin.channels.history.hint')}
                  </div>
                </div>
                <div className='admin-dashboard-health-strip-legend'>
                  {['success', 'warning', 'failure', 'unknown'].map((state) => (
                    <span
                      key={state}
                      className='admin-dashboard-health-strip-legend-item'
                    >
                      <span
                        className='admin-dashboard-health-strip-legend-dot'
                        style={{
                          background:
                            CHANNEL_HEALTH_POINT_COLORS[state] ||
                            CHANNEL_HEALTH_POINT_COLORS.unknown,
                        }}
                      />
                      {t(`dashboard.admin.channels.history.state.${state}`)}
                    </span>
                  ))}
                </div>
              </div>
              {sortedChannelHealthData.map((item) => {
                const statusText = t(
                  `dashboard.admin.channel_status.${Number(item.status)}`,
                  {
                    defaultValue: t('dashboard.admin.channel_status.default'),
                  }
                );
                const lastTested = item.last_tested_at
                  ? formatUpdatedAt(item.last_tested_at)
                  : '-';
                const activeCircuit = isActiveCircuitBreaker(
                  item.circuit_breaker
                );
                const canOpenDetail = Boolean(item.channel_id);
                // For a problematic channel (circuit-broken or warning/critical)
                // the obvious next step is to test it, so deep-link straight to
                // the tests tab instead of the overview.
                const needsTest =
                  activeCircuit ||
                  ['warning', 'critical'].includes(
                    (item.health_level || '').toString().toLowerCase()
                  );
                return (
                  <div
                    key={item.id}
                    className={`admin-dashboard-channel-health-row${
                      activeCircuit
                        ? ' admin-dashboard-channel-health-row-circuit'
                        : ''
                    }`}
                  >
                    <div className='admin-dashboard-channel-health-info'>
                      <div className='admin-dashboard-channel-health-title-row'>
                        <button
                          type='button'
                          className='admin-dashboard-channel-health-name'
                          title={item.name}
                          disabled={!canOpenDetail}
                          onClick={() => {
                            if (!canOpenDetail) return;
                            navigate(
                              `/admin/channel/detail/${encodeURIComponent(
                                item.channel_id
                              )}${needsTest ? '?tab=tests' : ''}`,
                              {
                                state: {
                                  from: `${location.pathname}${location.search}`,
                                },
                              }
                            );
                          }}
                        >
                          {item.name}
                        </button>
                        {renderHealthTag(item.health_level)}
                        {renderCircuitBreakerTag(item.circuit_breaker)}
                      </div>
                      <div className='admin-dashboard-channel-health-subtitle'>
                        <span>{statusText}</span>
                        <span>{item.capabilities}</span>
                        <span>
                          {t('dashboard.admin.health.chart.last_tested')}:{' '}
                          {lastTested}
                        </span>
                      </div>
                    </div>
                    <div className='admin-dashboard-channel-health-strip-wrap'>
                      <div
                        className='admin-dashboard-health-strip'
                        aria-label={`${item.name} ${t(
                          'dashboard.admin.channels.history.title'
                        )}`}
                      >
                        {item.health_history.map((point) => {
                          const stateLabel = t(
                            `dashboard.admin.channels.history.state.${point.state}`
                          );
                          const title = point.observed ? (
                            <div>
                              <div>{`${item.name}: ${stateLabel}`}</div>
                              <div>{`${t(
                                'dashboard.admin.channels.history.window'
                              )}: ${formatTimeRange(
                                point.bucket_start,
                                point.bucket_end
                              )}`}</div>
                              <div>{`${t(
                                'dashboard.admin.channels.history.success_count'
                              )}: ${formatCount(point.success_count)}`}</div>
                              <div>{`${t(
                                'dashboard.admin.channels.history.failure_count'
                              )}: ${formatCount(point.failure_count)}`}</div>
                              <div>{`${t(
                                'dashboard.admin.channels.history.total_count'
                              )}: ${formatCount(point.total_count)}`}</div>
                              <div>{`${t(
                                'dashboard.admin.channels.history.pass_rate'
                              )}: ${formatPercent(point.pass_rate)}`}</div>
                              <div>{`${t(
                                'dashboard.admin.channels.history.avg_latency'
                              )}: ${
                                point.avg_latency_ms > 0
                                  ? `${formatCount(point.avg_latency_ms)} ms`
                                  : '-'
                              }`}</div>
                            </div>
                          ) : (
                            `${item.name}: ${t(
                              'dashboard.admin.channels.history.no_data'
                            )}`
                          );
                          return (
                            <AppTooltip key={point.key} title={title}>
                              <span
                                className={`admin-dashboard-health-cell admin-dashboard-health-cell-${point.state}`}
                                style={{
                                  background:
                                    CHANNEL_HEALTH_POINT_COLORS[point.state] ||
                                    CHANNEL_HEALTH_POINT_COLORS.unknown,
                                }}
                              />
                            </AppTooltip>
                          );
                        })}
                      </div>
                    </div>
                    <div className='admin-dashboard-channel-health-metrics'>
                      <div className='admin-dashboard-channel-health-metric'>
                        <span>
                          {t('dashboard.admin.health.chart.health_score')}
                        </span>
                        <strong>
                          {Number(item.health_score || 0).toFixed(0)}
                        </strong>
                      </div>
                      <div className='admin-dashboard-channel-health-metric'>
                        <span>
                          {t('dashboard.admin.health.chart.pass_rate')}
                        </span>
                        <strong>{formatPercent(item.pass_rate_percent)}</strong>
                      </div>
                      <div className='admin-dashboard-channel-health-metric'>
                        <span>
                          {t('dashboard.admin.health.chart.avg_latency')}
                        </span>
                        <strong>
                          {item.avg_latency_ms > 0
                            ? `${formatCount(item.avg_latency_ms)} ms`
                            : '-'}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppSection>
    </AppSpin>
  );
};

export default ChannelHealthSection;
