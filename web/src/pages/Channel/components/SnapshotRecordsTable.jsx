import React from 'react';
import {
  AppDetailSection,
  AppPopconfirm,
  AppTable,
  AppTableActionButton,
} from '../../../router-ui';
import { formatNumberText, formatUsageText } from './channelBilling.helpers';

// Manual purchase snapshot records table. Pure presentational — the parent owns
// the data and the edit/delete handlers.
const SnapshotRecordsTable = ({
  t,
  purchaseRecords,
  billingLoading,
  billingReadonly,
  billingSubmitting,
  timestamp2string,
  onEditRecord,
  onDeleteRecord,
}) => (
  <AppDetailSection
    className='router-billing-management-section'
    title={t('channel.edit.billing.snapshots_title')}
    titleTag='span'
  >
    <div className='router-billing-subsection-header'>
      <div>
        <div className='router-billing-subsection-description'>
          {t('channel.edit.billing.snapshots_hint')}
        </div>
      </div>
    </div>
    <AppTable
      className='router-detail-table'
      pagination={false}
      loading={billingLoading}
      dataSource={purchaseRecords}
      rowKey={(row) => row.id}
      columns={[
        {
          title: t('channel.edit.billing.snapshot_table.purchase_at'),
          dataIndex: 'purchase_at',
          key: 'purchase_at',
          width: 180,
          render: (value) => (value ? timestamp2string(value) : '-'),
        },
        {
          title: t('channel.edit.billing.snapshot_table.purchase_amount'),
          key: 'purchase_amount',
          width: 130,
          render: (_, row) =>
            row?.purchase_amount
              ? `${formatNumberText(row.purchase_amount, 6)} ${
                  row.purchase_currency || ''
                }`.trim()
              : '-',
        },
        {
          title: t('channel.edit.billing.snapshot_table.purchase_cost_amount'),
          dataIndex: 'purchase_cost_amount',
          key: 'purchase_cost_amount',
          width: 130,
          render: (value) =>
            Number(value || 0) > 0 ? `${formatNumberText(value, 6)} CNY` : '-',
        },
        {
          title: t('channel.edit.billing.snapshot_table.entitlement_name'),
          dataIndex: 'entitlement_name',
          key: 'entitlement_name',
          width: 180,
          render: (value) => value || '-',
        },
        {
          title: t('channel.edit.billing.snapshot_table.validity'),
          key: 'validity',
          width: 330,
          render: (_, row) => {
            const start =
              Number(row?.valid_from || 0) > 0
                ? timestamp2string(row.valid_from)
                : t('channel.edit.billing.validity_immediate');
            const end =
              Number(row?.valid_until || 0) > 0
                ? timestamp2string(row.valid_until)
                : t('channel.edit.billing.no_expire');
            return `${start} - ${end}`;
          },
        },
        {
          title: t('channel.edit.billing.snapshot_table.quota_items'),
          dataIndex: 'items',
          key: 'items',
          render: (items) =>
            Array.isArray(items) && items.length > 0
              ? items
                  .map(
                    (row) =>
                      `${row.quota_label || row.quota_type}: ${formatUsageText(
                        row
                      )}`
                  )
                  .join(' / ')
              : '-',
        },
        {
          title: t('channel.edit.billing.snapshot_table.message'),
          dataIndex: 'message',
          key: 'message',
          render: (value) => value || '-',
        },
        {
          title: t('channel.edit.billing.snapshot_table.actions'),
          key: 'actions',
          width: 110,
          render: (_, row) => (
            <div className='router-table-actions-icon-compact'>
              <AppTableActionButton
                title={t('channel.edit.billing.edit_purchase_record')}
                icon='edit'
                disabled={billingReadonly || billingSubmitting}
                onClick={() => onEditRecord(row)}
              />
              <AppPopconfirm
                title={t('channel.edit.billing.delete_purchase_record_confirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                onConfirm={() => onDeleteRecord(row)}
              >
                <span>
                  <AppTableActionButton
                    title={t('channel.edit.billing.delete_purchase_record')}
                    icon='trash'
                    color='red'
                    disabled={billingReadonly || billingSubmitting}
                  />
                </span>
              </AppPopconfirm>
            </div>
          ),
        },
      ]}
    />
  </AppDetailSection>
);

export default SnapshotRecordsTable;
