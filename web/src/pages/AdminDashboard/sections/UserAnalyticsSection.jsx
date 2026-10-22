import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AppButton,
  AppErrorState,
  AppIcon,
  AppInput,
  AppSection,
  AppSegmented,
  AppSpin,
  AppTable,
  AppToolbar,
  chartAxisStyle,
  chartGridStyle,
  chartTooltipStyle,
  chartTooltipLabelStyle,
  chartTooltipItemStyle,
} from '../../../router-ui';
import {
  EMPTY_USER_GROWTH_SUMMARY,
  PERIOD_OPTIONS,
  USER_GROWTH_GRANULARITY_OPTIONS,
  USER_GROWTH_LINE_KEYS,
  USER_GROWTH_LINE_COLORS,
  USER_SEGMENT_FOCUS_LIMIT,
  deltaTone,
  formatCount,
  formatPercent,
  formatPeriodRange,
  formatSignedCount,
  formatSignedPercent,
  formatUpdatedAt,
  toPercent,
  useAdminDashboardData,
  useUsdFormatter,
} from '../dashboardShared';
import { DashboardSectionControls } from '../DashboardSectionControls';

// User growth / monetization analytics, extracted from AdminDashboard's users
// section so the user shell (/admin/user?tab=analytics) can host it inline.
// Self-contained: owns period/granularity/keyword state and fetches its own data.
const UserAnalyticsSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toUsd, formatUsd } = useUsdFormatter();
  const [period, setPeriod] = useState('last_7_days');
  const [userGrowthGranularity, setUserGrowthGranularity] = useState('week');
  const [usageKeywordInput, setUsageKeywordInput] = useState('');
  const [usageKeyword, setUsageKeyword] = useState('');

  const extraParams = useMemo(() => {
    const params = { user_growth_granularity: userGrowthGranularity };
    if (usageKeyword.trim() !== '') {
      params.user_keyword = usageKeyword.trim();
    }
    return params;
  }, [userGrowthGranularity, usageKeyword]);

  const { dashboard, loading, error, reload } = useAdminDashboardData('users', {
    period,
    extraParams,
  });

  const periodOptions = useMemo(
    () =>
      PERIOD_OPTIONS.map((value) => ({
        key: value,
        value,
        text: t(`dashboard.spending.period.${value}`),
      })),
    [t]
  );

  const userGrowthGranularityOptions = useMemo(
    () =>
      USER_GROWTH_GRANULARITY_OPTIONS.map((value) => ({
        value,
        label: t(`dashboard.admin.users.growth.granularity.${value}`),
      })),
    [t]
  );

  const userGrowthLineConfig = useMemo(
    () =>
      USER_GROWTH_LINE_KEYS.map((key) => ({
        dataKey: key,
        label: t(`dashboard.admin.users.growth.lines.${key}`),
        color: USER_GROWTH_LINE_COLORS[key],
      })),
    [t]
  );

  const formatGrowthRate = useCallback(
    (comparison) => {
      const current = Number(comparison?.current || 0);
      const hasBaseline = comparison?.has_baseline === true;
      if (!hasBaseline) {
        return current > 0
          ? t('dashboard.admin.users.growth.no_baseline')
          : '0.0%';
      }
      const rate = Number(comparison?.growth_rate || 0);
      if (!Number.isFinite(rate) || rate === 0) return '0.0%';
      return `${rate > 0 ? '+' : ''}${(rate * 100).toFixed(1)}%`;
    },
    [t]
  );

  const userGrowthSummary = useMemo(
    () => ({
      ...EMPTY_USER_GROWTH_SUMMARY,
      ...(dashboard.user_growth_summary || {}),
    }),
    [dashboard.user_growth_summary]
  );

  const resolvedUserGrowthGranularity = useMemo(() => {
    const value = (
      userGrowthSummary?.granularity ||
      userGrowthGranularity ||
      ''
    )
      .toString()
      .trim()
      .toLowerCase();
    return value === 'month' ? 'month' : 'week';
  }, [userGrowthGranularity, userGrowthSummary?.granularity]);

  const userGrowthCurrentLabel = useMemo(
    () =>
      resolvedUserGrowthGranularity === 'month'
        ? t('dashboard.admin.users.growth.period_labels.current_month')
        : t('dashboard.admin.users.growth.period_labels.current_week'),
    [resolvedUserGrowthGranularity, t]
  );

  const userGrowthPreviousLabel = useMemo(
    () =>
      resolvedUserGrowthGranularity === 'month'
        ? t('dashboard.admin.users.growth.period_labels.previous_month')
        : t('dashboard.admin.users.growth.period_labels.previous_week'),
    [resolvedUserGrowthGranularity, t]
  );

  const userGrowthComparisonLabel = useMemo(
    () =>
      resolvedUserGrowthGranularity === 'month'
        ? t('dashboard.admin.users.growth.period_labels.compare_previous_month')
        : t('dashboard.admin.users.growth.period_labels.compare_previous_week'),
    [resolvedUserGrowthGranularity, t]
  );

  const userGrowthCards = useMemo(
    () => [
      {
        key: 'new_users',
        label: t('dashboard.admin.users.growth.metrics.new_users'),
        value: Number(userGrowthSummary.current?.new_user_count || 0),
        previousValue: Number(userGrowthSummary.previous?.new_user_count || 0),
        comparison: userGrowthSummary.new_users,
        tone:
          Number(userGrowthSummary.new_users?.delta || 0) > 0
            ? 'positive'
            : Number(userGrowthSummary.new_users?.delta || 0) < 0
            ? 'negative'
            : 'neutral',
      },
      {
        key: 'active_users',
        label: t('dashboard.admin.users.growth.metrics.active_users'),
        value: Number(userGrowthSummary.current?.active_user_count || 0),
        previousValue: Number(
          userGrowthSummary.previous?.active_user_count || 0
        ),
        comparison: userGrowthSummary.active_users,
        tone:
          Number(userGrowthSummary.active_users?.delta || 0) > 0
            ? 'positive'
            : Number(userGrowthSummary.active_users?.delta || 0) < 0
            ? 'negative'
            : 'neutral',
      },
      {
        key: 'topup_users',
        label: t('dashboard.admin.users.growth.metrics.topup_users'),
        value: Number(userGrowthSummary.current?.topup_user_count || 0),
        previousValue: Number(
          userGrowthSummary.previous?.topup_user_count || 0
        ),
        comparison: userGrowthSummary.topup_users,
        tone:
          Number(userGrowthSummary.topup_users?.delta || 0) > 0
            ? 'positive'
            : Number(userGrowthSummary.topup_users?.delta || 0) < 0
            ? 'negative'
            : 'neutral',
      },
    ],
    [t, userGrowthSummary]
  );

  const userGrowthTrendData = useMemo(
    () =>
      (dashboard.user_growth_trend || []).map((item) => ({
        ...item,
        label: formatPeriodRange(item.start_timestamp, item.end_timestamp),
      })),
    [dashboard.user_growth_trend]
  );

  const userGrowthKpis = useMemo(() => {
    const activeUsers = Number(
      userGrowthSummary.current?.active_user_count || 0
    );
    const topupUsers = Number(userGrowthSummary.current?.topup_user_count || 0);
    const previousActiveUsers = Number(
      userGrowthSummary.previous?.active_user_count || 0
    );
    const previousTopupUsers = Number(
      userGrowthSummary.previous?.topup_user_count || 0
    );
    const spendAmount = Number(dashboard.usage_totals?.spend_amount || 0);
    const balanceTotal = dashboard.usage_rank.reduce(
      (sum, item) => sum + Number(item?.balance_amount || 0),
      0
    );
    const paidConversion = activeUsers > 0 ? topupUsers / activeUsers : 0;
    const previousPaidConversion =
      previousActiveUsers > 0 ? previousTopupUsers / previousActiveUsers : 0;
    const arpu = activeUsers > 0 ? spendAmount / activeUsers : 0;
    return {
      active_users: activeUsers,
      active_users_comparison: userGrowthSummary.active_users || null,
      topup_users: topupUsers,
      topup_users_comparison: userGrowthSummary.topup_users || null,
      paid_conversion_rate: paidConversion,
      paid_conversion_delta: paidConversion - previousPaidConversion,
      arpu,
      user_balance_total: balanceTotal,
    };
  }, [
    dashboard.usage_totals?.spend_amount,
    dashboard.usage_rank,
    userGrowthSummary.active_users,
    userGrowthSummary.current?.active_user_count,
    userGrowthSummary.current?.topup_user_count,
    userGrowthSummary.previous?.active_user_count,
    userGrowthSummary.previous?.topup_user_count,
    userGrowthSummary.topup_users,
  ]);

  const usageRankColumns = useMemo(
    () => [
      {
        title: t('dashboard.admin.usage_rank.columns.rank'),
        key: 'rank',
        width: 72,
        render: (_, __, index) => (
          <span className='admin-dashboard-rank-index'>{index + 1}</span>
        ),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.user'),
        dataIndex: 'username',
        key: 'user',
        width: 180,
        ellipsis: true,
        render: (_, record) =>
          record.user_id ? (
            <button
              type='button'
              className='admin-dashboard-user-link admin-dashboard-rank-user'
              title={record.username || record.user_id || '-'}
              onClick={() =>
                navigate(
                  `/admin/user/detail/${encodeURIComponent(record.user_id)}`
                )
              }
            >
              {record.username || record.user_id || '-'}
            </button>
          ) : (
            <span
              className='admin-dashboard-rank-user'
              title={record.username || record.user_id || '-'}
            >
              {record.username || record.user_id || '-'}
            </span>
          ),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.requests'),
        dataIndex: 'request_count',
        key: 'request_count',
        width: 120,
        render: (value) => formatCount(value),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.tokens'),
        dataIndex: 'total_tokens',
        key: 'total_tokens',
        width: 140,
        render: (value) => formatCount(value),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.spend'),
        dataIndex: 'spend_amount',
        key: 'spend_amount',
        width: 120,
        render: (value) => formatUsd(value),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.share'),
        dataIndex: 'share_rate',
        key: 'share_rate',
        width: 220,
        render: (value) => (
          <span className='admin-dashboard-rank-share-cell'>
            <span className='admin-dashboard-rank-share-text'>
              {formatPercent(value)}
            </span>
            <span className='admin-dashboard-rank-share-track'>
              <span
                className='admin-dashboard-rank-share-bar'
                style={{
                  '--admin-dashboard-share-width': `${Math.max(
                    4,
                    toPercent(value)
                  )}%`,
                }}
              />
            </span>
          </span>
        ),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.last_used_at'),
        dataIndex: 'last_used_at',
        key: 'last_used_at',
        width: 180,
        render: (value) => formatUpdatedAt(value),
      },
    ],
    [formatUsd, navigate, t]
  );

  const applyUsageKeyword = useCallback(() => {
    setUsageKeyword(usageKeywordInput.trim());
  }, [usageKeywordInput]);

  const clearUsageKeyword = useCallback(() => {
    setUsageKeywordInput('');
    setUsageKeyword('');
  }, []);

  const openUserSegment = useCallback(
    (segment) => {
      const rows = Array.isArray(segment?.rows) ? segment.rows : [];
      const ids = [
        ...new Set(
          rows
            .map((item) => (item?.user_id || '').toString().trim())
            .filter(Boolean)
        ),
      ].slice(0, USER_SEGMENT_FOCUS_LIMIT);
      if (ids.length === 0) {
        return;
      }
      const params = new URLSearchParams();
      params.set('focus_ids', ids.join(','));
      params.set('focus_name', segment.label);
      params.set('focus_total', String(rows.length));
      navigate(`/admin/user?${params.toString()}`);
    },
    [navigate]
  );

  const userSegments = useMemo(() => {
    const rows = Array.isArray(dashboard.usage_rank)
      ? dashboard.usage_rank.filter(
          (item) => (item?.user_id || '').toString().trim() !== ''
        )
      : [];
    const activeRows = rows.filter(
      (item) => Number(item.request_count || 0) > 0
    );
    const requestTotal = activeRows.reduce(
      (sum, item) => sum + Number(item.request_count || 0),
      0
    );
    const tokenTotal = activeRows.reduce(
      (sum, item) => sum + Number(item.total_tokens || 0),
      0
    );
    const averageRequests =
      activeRows.length > 0 ? requestTotal / activeRows.length : 0;
    const averageTokens =
      activeRows.length > 0 ? tokenTotal / activeRows.length : 0;
    const bySpendDesc = (left, right) =>
      Number(right.spend_amount || 0) - Number(left.spend_amount || 0) ||
      Number(right.request_count || 0) - Number(left.request_count || 0);
    const highSpendRows = rows
      .filter(
        (item) =>
          Number(item.spend_amount || 0) > 0 &&
          Number(item.share_rate || 0) >= 0.1
      )
      .sort(bySpendDesc);
    const activeUserRows = activeRows
      .filter((item) => Number(item.request_count || 0) > averageRequests)
      .sort(
        (left, right) =>
          Number(right.request_count || 0) - Number(left.request_count || 0)
      );
    const longTailRows = rows
      .filter(
        (item) =>
          Number(item.spend_amount || 0) > 0 &&
          Number(item.share_rate || 0) < 0.03 &&
          Number(item.total_tokens || 0) <= averageTokens
      )
      .sort(
        (left, right) =>
          Number(left.spend_amount || 0) - Number(right.spend_amount || 0)
      );
    const balanceRiskRows = activeRows
      .filter((item) => {
        const spend = Number(item.spend_amount || 0);
        const balance = Number(item.balance_amount || 0);
        return spend > 0 && balance <= spend;
      })
      .sort(
        (left, right) =>
          Number(left.balance_amount || 0) - Number(right.balance_amount || 0)
      );
    return [
      {
        key: 'high_spend',
        label: t('dashboard.admin.users.insights.high_spend'),
        hint: t('dashboard.admin.users.insights.high_spend_hint'),
        rows: highSpendRows,
      },
      {
        key: 'active',
        label: t('dashboard.admin.users.insights.active'),
        hint: t('dashboard.admin.users.insights.active_hint'),
        rows: activeUserRows,
      },
      {
        key: 'long_tail',
        label: t('dashboard.admin.users.insights.long_tail'),
        hint: t('dashboard.admin.users.insights.long_tail_hint'),
        rows: longTailRows,
      },
      {
        key: 'balance_risk',
        label: t('dashboard.admin.users.insights.balance_risk'),
        hint: t('dashboard.admin.users.insights.balance_risk_hint'),
        rows: balanceRiskRows,
      },
    ];
  }, [dashboard.usage_rank, t]);

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
              {t('dashboard.admin.users.growth.title')}
            </div>
            <div className='admin-dashboard-subsection-description'>
              {t('dashboard.admin.users.growth.description')}
            </div>
          </div>
          <AppToolbar
            className='admin-dashboard-section-toolbar'
            end={
              <DashboardSectionControls
                period={period}
                periodOptions={periodOptions}
                onPeriodChange={setPeriod}
                generatedAt={dashboard.generated_at}
                loading={loading}
                onRefresh={reload}
                extra={
                  <AppSegmented
                    className='admin-dashboard-segmented'
                    options={userGrowthGranularityOptions}
                    value={userGrowthGranularity}
                    onChange={(e, { value }) => setUserGrowthGranularity(value)}
                  />
                }
              />
            }
          />
        </div>
        <div className='admin-dashboard-user-growth-grid'>
          {userGrowthCards.map((item) => (
            <div key={item.key} className='admin-dashboard-user-growth-card'>
              <div className='admin-dashboard-user-growth-card-label'>
                {item.label}
              </div>
              <div className='admin-dashboard-user-growth-card-value'>
                {formatCount(item.value)}
              </div>
              <div className='admin-dashboard-user-growth-card-periods'>
                <span>
                  {userGrowthCurrentLabel} {formatCount(item.value)}
                </span>
                <span>
                  {userGrowthPreviousLabel} {formatCount(item.previousValue)}
                </span>
              </div>
              <div
                className={`admin-dashboard-user-growth-card-delta admin-dashboard-user-growth-card-delta-${item.tone}`}
              >
                <span>
                  {userGrowthComparisonLabel}{' '}
                  {formatSignedCount(item.comparison?.delta)}
                </span>
                <span>{formatGrowthRate(item.comparison)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className='admin-dashboard-user-monetization-strip'>
          <div className='admin-dashboard-user-monetization-item'>
            <span className='admin-dashboard-user-monetization-label'>
              {t('dashboard.admin.users.summary.paid_conversion_rate')}
            </span>
            <strong className='admin-dashboard-user-monetization-value'>
              {formatPercent(userGrowthKpis.paid_conversion_rate)}
            </strong>
            <span
              className={`admin-dashboard-user-monetization-delta admin-dashboard-kpi-delta-${deltaTone(
                userGrowthKpis.paid_conversion_delta
              )}`}
            >
              {formatSignedPercent(userGrowthKpis.paid_conversion_delta)}
            </span>
          </div>
          <div className='admin-dashboard-user-monetization-item'>
            <span className='admin-dashboard-user-monetization-label'>
              {t('dashboard.admin.users.summary.arpu')}
            </span>
            <strong className='admin-dashboard-user-monetization-value'>
              {formatUsd(userGrowthKpis.arpu)}
            </strong>
          </div>
          <div className='admin-dashboard-user-monetization-item'>
            <span className='admin-dashboard-user-monetization-label'>
              {t('dashboard.admin.users.summary.user_balance_total')}
            </span>
            <strong className='admin-dashboard-user-monetization-value'>
              {formatUsd(userGrowthKpis.user_balance_total)}
            </strong>
          </div>
        </div>
        <div className='admin-dashboard-user-growth-panel'>
          <div className='admin-dashboard-user-growth-panel-header'>
            <div>
              <div className='admin-dashboard-card-title'>
                {t('dashboard.admin.users.growth.trend_title')}
              </div>
              <div className='admin-dashboard-user-growth-period'>
                {t('dashboard.admin.users.growth.current_period', {
                  range: formatPeriodRange(
                    userGrowthSummary.current?.start_timestamp,
                    userGrowthSummary.current?.end_timestamp
                  ),
                })}
              </div>
              <div className='admin-dashboard-user-growth-period'>
                {t('dashboard.admin.users.growth.previous_period', {
                  range: formatPeriodRange(
                    userGrowthSummary.previous?.start_timestamp,
                    userGrowthSummary.previous?.end_timestamp
                  ),
                })}
              </div>
            </div>
            <div className='admin-dashboard-user-growth-legend'>
              {userGrowthLineConfig.map((item) => (
                <span
                  key={item.dataKey}
                  className='admin-dashboard-user-growth-legend-item'
                >
                  <span
                    className='admin-dashboard-user-growth-legend-dot'
                    style={{ background: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          {userGrowthTrendData.length === 0 ? (
            <div className='admin-dashboard-empty'>
              {t('dashboard.admin.empty.trend')}
            </div>
          ) : (
            <div className='chart-container'>
              <ResponsiveContainer width='100%' height={240}>
                <LineChart data={userGrowthTrendData}>
                  <CartesianGrid {...chartGridStyle()} />
                  <XAxis dataKey='label' {...chartAxisStyle()} minTickGap={8} />
                  <YAxis {...chartAxisStyle()} allowDecimals={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle()}
                    labelStyle={chartTooltipLabelStyle()}
                    itemStyle={chartTooltipItemStyle()}
                    formatter={(value, name) => {
                      const config = userGrowthLineConfig.find(
                        (item) => item.dataKey === name
                      );
                      return [formatCount(value), config?.label || name];
                    }}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.label || label
                    }
                  />
                  {userGrowthLineConfig.map((item) => (
                    <Line
                      key={item.dataKey}
                      type='monotone'
                      dataKey={item.dataKey}
                      stroke={item.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className='admin-dashboard-user-segments'>
          <div className='admin-dashboard-user-segments-header'>
            <div>
              <div className='admin-dashboard-card-title'>
                {t('dashboard.admin.users.insights.title')}
              </div>
              <div className='admin-dashboard-subsection-description'>
                {t('dashboard.admin.users.insights.footnote')}
              </div>
            </div>
          </div>
          <div className='admin-dashboard-user-segment-grid'>
            {userSegments.map((segment) => {
              const count = Array.isArray(segment.rows)
                ? segment.rows.length
                : 0;
              const isLimited = count > USER_SEGMENT_FOCUS_LIMIT;
              return (
                <div
                  key={segment.key}
                  className='admin-dashboard-user-segment-card'
                >
                  <div className='admin-dashboard-user-segment-main'>
                    <div className='admin-dashboard-user-segment-label'>
                      {segment.label}
                    </div>
                    <div className='admin-dashboard-user-segment-count'>
                      {formatCount(count)}
                    </div>
                    <div className='admin-dashboard-user-segment-hint'>
                      {segment.hint}
                    </div>
                    {isLimited ? (
                      <div className='admin-dashboard-user-segment-limit'>
                        {t('dashboard.admin.users.insights.focus_limit', {
                          count: USER_SEGMENT_FOCUS_LIMIT,
                        })}
                      </div>
                    ) : null}
                  </div>
                  <AppButton
                    className='router-inline-button admin-dashboard-user-segment-action'
                    type='button'
                    icon={<AppIcon name='users' />}
                    disabled={count === 0}
                    onClick={() => openUserSegment(segment)}
                  >
                    {t('dashboard.admin.users.insights.view_users')}
                  </AppButton>
                </div>
              );
            })}
          </div>
        </div>
        <div className='admin-dashboard-usage-rank'>
          <div className='admin-dashboard-subsection-header admin-dashboard-usage-rank-header'>
            <div className='admin-dashboard-usage-rank-title-row'>
              <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
                {t('dashboard.admin.usage_rank.title')}
              </div>
            </div>
            <div className='admin-dashboard-usage-rank-filter-row'>
              <div className='admin-dashboard-subsection-description'>
                {t('dashboard.admin.usage_rank.description')}
              </div>
              <div className='admin-dashboard-usage-rank-filters'>
                <div className='router-list-toolbar-query router-list-toolbar-query-compact'>
                  <AppInput
                    className='admin-dashboard-usage-rank-search'
                    value={usageKeywordInput}
                    placeholder={t(
                      'dashboard.admin.usage_rank.search.placeholder'
                    )}
                    onChange={(e, { value }) => setUsageKeywordInput(value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyUsageKeyword();
                      }
                    }}
                  />
                  <AppButton
                    color='blue'
                    type='button'
                    onClick={applyUsageKeyword}
                  >
                    {t('dashboard.admin.usage_rank.search.submit')}
                  </AppButton>
                  {usageKeyword ? (
                    <AppButton
                      type='button'
                      className='router-inline-button'
                      onClick={clearUsageKeyword}
                    >
                      {t('dashboard.admin.usage_rank.search.reset')}
                    </AppButton>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          {dashboard.usage_rank.length === 0 ? (
            <div className='admin-dashboard-empty'>
              {t('dashboard.admin.empty.usage_rank')}
            </div>
          ) : (
            <AppTable
              className='admin-dashboard-rank-table'
              columns={usageRankColumns}
              dataSource={dashboard.usage_rank}
              pagination={false}
              rowKey={(record) =>
                record.user_id ||
                `${record.username || 'unknown'}-${record.last_used_at || 0}`
              }
              scroll={{ x: 980 }}
            />
          )}
        </div>
      </AppSection>
    </AppSpin>
  );
};

export default UserAnalyticsSection;
