import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LogsTable from '../../components/LogsTable';
import { API, showError, timestamp2string } from '../../helpers';
import { AppButton, AppSection, AppSegmented, AppTable, AppTag } from '../../router-ui';
import './index.css';

const GROUP_OPTIONS = [
  { value: 'model' },
  { value: 'channel' },
  { value: 'endpoint' },
  { value: 'error' },
];

const formatCount = (value) => Number(value || 0).toLocaleString();
const formatPercent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

const Log = () => {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState('model');
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const [anomalies, setAnomalies] = useState([]);

  const loadAnomalies = useCallback(async () => {
    setLoadingAnomalies(true);
    try {
      const response = await API.get('/api/v1/admin/log/route/anomalies', {
        params: {
          group_by: groupBy,
          limit: 20,
        },
      });
      if (!response.data?.success) throw new Error(response.data?.message);
      const items = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      setAnomalies(items.map((item) => ({
        ...item,
        request_count: Number(item?.request_count || 0),
        failure_count: Number(item?.failure_count || 0),
        fallback_count: Number(item?.fallback_count || 0),
        success_count: Number(item?.success_count || 0),
        failure_rate: Number(item?.failure_rate || 0),
        avg_latency_ms: Number(item?.avg_latency_ms || 0),
        last_observed_at: Number(item?.last_observed_at || 0),
      })));
    } catch (error) {
      showError(error?.message || t('log.route_anomalies.load_failed'));
    } finally {
      setLoadingAnomalies(false);
    }
  }, [groupBy, t]);

  useEffect(() => {
    loadAnomalies().then();
  }, [loadAnomalies]);

  const labelColumn = {
    title: t(`log.route_anomalies.group_by.${groupBy}`),
    key: 'label',
    width: 240,
    render: (_, row) => {
      if (groupBy === 'channel') return row.channel_name || row.channel_id || '-';
      if (groupBy === 'endpoint') return row.endpoint || '-';
      if (groupBy === 'error') return [row.error_type, row.error_code].filter((item) => item && item !== '-').join(' / ') || '-';
      return row.model || '-';
    },
  };

  const anomalyColumns = [
    labelColumn,
    {
      title: t('log.route_anomalies.columns.failure_count'),
      dataIndex: 'failure_count',
      width: 120,
      align: 'right',
      render: (value) => Number(value || 0) > 0 ? <AppTag color='red'>{formatCount(value)}</AppTag> : '-',
    },
    {
      title: t('log.route_anomalies.columns.fallback_count'),
      dataIndex: 'fallback_count',
      width: 120,
      align: 'right',
      render: (value) => Number(value || 0) > 0 ? <AppTag color='orange'>{formatCount(value)}</AppTag> : '-',
    },
    {
      title: t('log.route_anomalies.columns.request_count'),
      dataIndex: 'request_count',
      width: 120,
      align: 'right',
      render: formatCount,
    },
    {
      title: t('log.route_anomalies.columns.failure_rate'),
      dataIndex: 'failure_rate',
      width: 120,
      align: 'right',
      render: formatPercent,
    },
    {
      title: t('log.route_anomalies.columns.last_observed_at'),
      dataIndex: 'last_observed_at',
      width: 168,
      render: (value) => value ? timestamp2string(value) : '-',
    },
    {
      title: t('log.route_anomalies.columns.last_error'),
      dataIndex: 'last_error',
      width: 320,
      render: (value) => <span className='log-route-anomaly-error' title={value || ''}>{value || '-'}</span>,
    },
  ];

  return (
    <div className='dashboard-container log-page'>
      <AppSection className='log-route-anomalies-section'>
        <div className='log-route-anomalies-header'>
          <div>
            <h2>{t('log.route_anomalies.title')}</h2>
            <p>{t('log.route_anomalies.summary')}</p>
          </div>
          <div className='log-route-anomalies-actions'>
            <AppSegmented
              options={GROUP_OPTIONS.map((item) => ({
                value: item.value,
                label: t(`log.route_anomalies.group_by.${item.value}`),
              }))}
              value={groupBy}
              onChange={(e, { value }) => setGroupBy(value)}
            />
            <AppButton loading={loadingAnomalies} onClick={() => loadAnomalies().then()}>
              {t('common.refresh')}
            </AppButton>
          </div>
        </div>
        <AppTable
          className='router-detail-table router-table-fit-page log-route-anomalies-table'
          rowKey={(row) => [groupBy, row.model, row.channel_id, row.endpoint, row.error_type, row.error_code].join(':')}
          dataSource={anomalies}
          columns={anomalyColumns}
          pagination={false}
          loading={loadingAnomalies}
          scroll={{ x: 1210 }}
          locale={{ emptyText: loadingAnomalies ? t('common.loading') : t('log.route_anomalies.empty') }}
        />
      </AppSection>
      <LogsTable />
    </div>
  );
};

export default Log;
