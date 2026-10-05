import React from 'react';
import {
  AppDetailSection,
  AppPopconfirm,
  AppTable,
  AppTableActionButton,
  AppTag,
} from '../../../router-ui';
import {
  formatProcurementCapacityText,
  formatProcurementCostText,
  formatProcurementResourceText,
  formatProcurementScopeText,
  formatProcurementSourceText,
  formatProcurementUnitCostText,
  procurementStatusColor,
} from './channelBilling.helpers';

// Procurement batch table (cost/status/consumptions). Pure presentational — the
// parent owns the data and the view/edit/status handlers.
const ProcurementBatchTable = ({
  t,
  procurementRows,
  billingLoading,
  billingReadonly,
  billingSubmitting,
  timestamp2string,
  onViewConsumptions,
  onEditCost,
  onUpdateStatus,
}) => (
  <AppDetailSection
    className='router-billing-management-section'
    title={t('channel.edit.billing.procurement_title')}
    titleTag='span'
  >
    <div className='router-billing-subsection-header'>
      <div>
        <div className='router-billing-subsection-description'>
          {t('channel.edit.billing.procurement_hint')}
        </div>
      </div>
    </div>
    <AppTable
      className='router-detail-table'
      pagination={false}
      loading={billingLoading}
      dataSource={procurementRows}
      rowKey={(row) => row.id}
      columns={[
        {
          title: t('channel.edit.billing.procurement_table.resource'),
          dataIndex: 'resource_type',
          key: 'resource',
          width: 190,
          render: (_, row) => formatProcurementResourceText(row, t),
        },
        {
          title: t('channel.edit.billing.procurement_table.source'),
          dataIndex: 'source_ref',
          key: 'source',
          width: 150,
          render: (_, row) => formatProcurementSourceText(row),
        },
        {
          title: t('channel.edit.billing.procurement_table.capacity'),
          dataIndex: 'capacity_remaining',
          key: 'capacity',
          width: 220,
          render: (_, row) => formatProcurementCapacityText(row, t),
        },
        {
          title: t('channel.edit.billing.procurement_table.cost'),
          dataIndex: 'purchase_cost_amount',
          key: 'cost',
          width: 150,
          render: (_, row) => formatProcurementCostText(row, t),
        },
        {
          title: t('channel.edit.billing.procurement_table.unit_cost'),
          dataIndex: 'cost_per_unit_amount',
          key: 'unit_cost',
          width: 180,
          render: (_, row) => formatProcurementUnitCostText(row),
        },
        {
          title: t('channel.edit.billing.procurement_table.scope'),
          key: 'scope',
          width: 160,
          render: (_, row) => formatProcurementScopeText(row, t),
        },
        {
          title: t('channel.edit.billing.procurement_table.expire_at'),
          dataIndex: 'expire_at',
          key: 'expire_at',
          width: 180,
          render: (value) =>
            Number(value || 0) > 0 ? timestamp2string(value) : '-',
        },
        {
          title: t('channel.edit.billing.procurement_table.status'),
          dataIndex: 'cost_status',
          key: 'cost_status',
          width: 120,
          render: (value) => (
            <AppTag color={procurementStatusColor(value)}>
              {t(`channel.edit.billing.procurement_status.${value || 'unknown'}`, {
                defaultValue: value || '-',
              })}
            </AppTag>
          ),
        },
        {
          title: t('channel.edit.billing.procurement_table.actions'),
          key: 'actions',
          width: 150,
          render: (_, row) => (
            <div className='router-table-actions-icon-compact'>
              <AppTableActionButton
                title={t('channel.edit.billing.procurement_view_consumptions')}
                icon='eye'
                disabled={billingSubmitting}
                onClick={() => onViewConsumptions(row)}
              />
              <AppTableActionButton
                title={t('channel.edit.billing.procurement_edit_cost')}
                icon='edit'
                disabled={billingReadonly || billingSubmitting}
                onClick={() => onEditCost(row)}
              />
              {(row?.cost_status || '').toString().trim() === 'disabled' ? (
                <AppPopconfirm
                  title={t('channel.edit.billing.procurement_restore_confirm')}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  onConfirm={() => onUpdateStatus(row, 'active')}
                >
                  <AppTableActionButton
                    title={t('channel.edit.billing.procurement_restore')}
                    icon='check'
                    disabled={billingReadonly || billingSubmitting}
                  />
                </AppPopconfirm>
              ) : (
                <AppPopconfirm
                  title={t('channel.edit.billing.procurement_disable_confirm')}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  onConfirm={() => onUpdateStatus(row, 'disabled')}
                >
                  <AppTableActionButton
                    title={t('channel.edit.billing.procurement_disable')}
                    icon='close'
                    disabled={billingReadonly || billingSubmitting}
                  />
                </AppPopconfirm>
              )}
            </div>
          ),
        },
      ]}
      locale={{
        emptyText: t('channel.edit.billing.no_procurement_batches'),
      }}
    />
  </AppDetailSection>
);

export default ProcurementBatchTable;
