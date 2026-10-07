import React from 'react';
import { AppTable, AppTag } from '../../../router-ui';
import {
  buildQuotaItemRowKey,
  classifyEntitlementItem,
  formatEntitlementUsageText,
  formatItemStatusText,
  formatRemainingRatioText,
  formatUsedText,
  formatValidityText,
  normalizeBillingValue,
  statusColor,
} from './channelBilling.helpers';

const renderEntitlementKind = (row, t) => {
  const kind = classifyEntitlementItem(row, t);
  return <AppTag color={kind.color}>{kind.label}</AppTag>;
};

const renderQuotaLabel = (value, row, t) => {
  return (
    value ||
    t(`channel.edit.billing.quota_types.${row?.quota_type || 'custom'}`, {
      defaultValue: row?.quota_type || '-',
    })
  );
};

const renderStatus = (row, t) => {
  const status = normalizeBillingValue(row?.status);
  if (!status || status === 'depleted') {
    return '-';
  }
  return <AppTag color={statusColor(row)}>{formatItemStatusText(row, t)}</AppTag>;
};

// Effective entitlement quota table for the channel overview account view.
// Pure presentational — data and formatters come from props.
const QuotaTable = ({ t, quotaItems, billingLoading, timestamp2string }) => (
  <AppTable
    className='router-detail-table'
    pagination={false}
    loading={billingLoading}
    dataSource={Array.isArray(quotaItems) ? quotaItems : []}
    rowKey={(row) => buildQuotaItemRowKey(row)}
    columns={[
      {
        title: t('channel.edit.billing.quota_table.entitlement_kind'),
        dataIndex: 'resource_type',
        key: 'entitlement_kind',
        width: 170,
        render: (_, row) => renderEntitlementKind(row, t),
      },
      {
        title: t('channel.edit.billing.quota_table.quota_label'),
        dataIndex: 'quota_label',
        key: 'quota_label',
        width: 180,
        render: (value, row) => renderQuotaLabel(value, row, t),
      },
      {
        title: t('channel.edit.billing.quota_table.amount'),
        dataIndex: 'remaining_amount',
        key: 'remaining_amount',
        width: 180,
        render: (_, row) => formatEntitlementUsageText(row, t),
      },
      {
        title: t('channel.edit.billing.quota_table.used_amount'),
        dataIndex: 'used_amount',
        key: 'used_amount',
        width: 120,
        render: (_, row) => formatUsedText(row),
      },
      {
        title: t('channel.edit.billing.quota_table.remaining_ratio'),
        dataIndex: 'limit_amount',
        key: 'remaining_ratio',
        width: 120,
        render: (_, row) => formatRemainingRatioText(row),
      },
      {
        title: t('channel.edit.billing.quota_table.validity'),
        dataIndex: 'expires_at',
        key: 'validity',
        width: 260,
        render: (_, row) => formatValidityText(row, timestamp2string, t),
      },
      {
        title: t('channel.edit.billing.quota_table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (_, row) => renderStatus(row, t),
      },
    ]}
    locale={{
      emptyText: t('channel.edit.billing.no_quota_items'),
    }}
  />
);

export default QuotaTable;
