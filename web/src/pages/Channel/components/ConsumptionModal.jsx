import React from 'react';
import { AppModal, AppTable } from '../../../router-ui';
import { formatNumberText } from './channelBilling.helpers';

// Read-only modal listing a procurement batch's consumption ledger. Pure
// presentational — open state, rows and loading come from props.
const ConsumptionModal = ({
  t,
  open,
  onClose,
  loading,
  rows,
  batch,
  timestamp2string,
}) => (
  <AppModal
    size='large'
    open={open}
    onClose={onClose}
    title={t('channel.edit.billing.procurement_consumptions_title', {
      batch: batch?.source_ref || batch?.id || '-',
    })}
  >
    <AppTable
      className='router-detail-table'
      pagination={false}
      loading={loading}
      dataSource={rows}
      rowKey={(row) => row.id}
      columns={[
        {
          title: t(
            'channel.edit.billing.procurement_consumption_table.request_log'
          ),
          dataIndex: 'request_log_id',
          key: 'request_log_id',
          width: 220,
          render: (value) => value || '-',
        },
        {
          title: t(
            'channel.edit.billing.procurement_consumption_table.quantity'
          ),
          dataIndex: 'consumed_quantity',
          key: 'consumed_quantity',
          width: 150,
          render: (value, row) =>
            `${formatNumberText(value, 6)} ${row?.capacity_unit || ''}`.trim(),
        },
        {
          title: t(
            'channel.edit.billing.procurement_consumption_table.unit_cost'
          ),
          dataIndex: 'unit_cost_amount',
          key: 'unit_cost_amount',
          width: 150,
          render: (value) => `${formatNumberText(value, 8)} CNY`,
        },
        {
          title: t('channel.edit.billing.procurement_consumption_table.cost'),
          dataIndex: 'consumed_cost_amount',
          key: 'consumed_cost_amount',
          width: 150,
          render: (value) => `${formatNumberText(value, 6)} CNY`,
        },
        {
          title: t(
            'channel.edit.billing.procurement_consumption_table.truth_mode'
          ),
          dataIndex: 'settlement_truth_mode',
          key: 'settlement_truth_mode',
          render: (value) => value || '-',
        },
        {
          title: t(
            'channel.edit.billing.procurement_consumption_table.created_at'
          ),
          dataIndex: 'created_at',
          key: 'created_at',
          width: 180,
          render: (value) =>
            Number(value || 0) > 0 ? timestamp2string(value) : '-',
        },
      ]}
      locale={{
        emptyText: t('channel.edit.billing.no_procurement_consumptions'),
      }}
    />
  </AppModal>
);

export default ConsumptionModal;
