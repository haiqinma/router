import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppAlert,
  AppButton,
  AppDetailSection,
  AppEmpty,
  AppInput,
  AppPopconfirm,
  AppSelect,
  AppTable,
  AppTag,
} from '../../../router-ui';

const normalizePublishStatus = (row) => {
  const explicitStatus = (row?.publish_status || '').toString().trim();
  if (explicitStatus) {
    return explicitStatus;
  }
  if (!row?.selected) {
    return 'selectable';
  }
  return 'pending_config';
};

const publishStatusColor = (status) => {
  switch (status) {
    case 'published':
      return 'green';
    case 'pending_publish':
      return 'blue';
    case 'pending_test':
      return 'orange';
    case 'pending_config':
      return 'yellow';
    case 'selectable':
      return 'blue';
    case 'disabled':
      return 'grey';
    default:
      return 'grey';
  }
};

const publishCheckColor = (status) => {
  switch (status) {
    case 'published':
    case 'pending_publish':
      return 'green';
    case 'pending_test':
    case 'pending_config':
      return 'orange';
    default:
      return 'grey';
  }
};

// 成本对运营只有两种可见状态:已记录(可算毛利)/ 未记录(暂不可算)。
// 底层的耗尽/过期/单位不匹配等细分只放进悬停提示,不再作为独立概念顶到界面。
const procurementReadinessColor = (status) =>
  status === 'ready' ? 'green' : 'orange';

const ChannelDetailPublishTab = ({
  t,
  channelModels,
  getComplexPricingDetailsForModel,
  openComplexPricingModal,
  normalizeChannelModelType,
  onUpdatePublishedModelName,
  onUpdatePublish,
  onMarkZeroCost,
  onNavigateTab,
  publishMutatingModel,
  publishReadonly,
}) => {
  const [statusFilter, setStatusFilter] = useState('all');

  const publishRows = useMemo(
    () =>
      (Array.isArray(channelModels) ? channelModels : [])
        .filter((row) => row?.selected === true)
        .sort((left, right) =>
          (left?.model || left?.upstream_model || '').localeCompare(
            right?.model || right?.upstream_model || '',
          ),
        ),
    [channelModels],
  );

  const publishedCount = useMemo(
    () =>
      publishRows.filter((row) => normalizePublishStatus(row) === 'published')
        .length,
    [publishRows],
  );

  const statusCounts = useMemo(() => {
    const counts = {};
    publishRows.forEach((row) => {
      const status = normalizePublishStatus(row);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [publishRows]);

  const statusFilterOptions = useMemo(() => {
    const order = [
      'pending_config',
      'pending_test',
      'pending_publish',
      'published',
      'disabled',
      'selectable',
    ];
    const options = [
      {
        key: 'all',
        value: 'all',
        text: t('channel.edit.publish.filter_all', { count: publishRows.length }),
      },
    ];
    order.forEach((status) => {
      const count = statusCounts[status] || 0;
      if (count > 0) {
        options.push({
          key: status,
          value: status,
          text: `${t(`channel.edit.model_selector.publish_status.${status}`)} (${count})`,
        });
      }
    });
    return options;
  }, [publishRows.length, statusCounts, t]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') {
      return publishRows;
    }
    return publishRows.filter((row) => normalizePublishStatus(row) === statusFilter);
  }, [publishRows, statusFilter]);

  const hasPositiveSellPrice = (row) => {
    if (Number(row?.input_price || 0) > 0 || Number(row?.output_price || 0) > 0) {
      return true;
    }
    const complexPricingDetails = getComplexPricingDetailsForModel(row);
    return complexPricingDetails.some((detail) =>
      (detail.price_components || []).some(
        (component) =>
          Number(component.input_price || 0) > 0 ||
          Number(component.output_price || 0) > 0,
      ),
    );
  };

  const renderPrice = (row, field) => {
    const complexPricingDetails = getComplexPricingDetailsForModel(row);
    const hasComplexPricing = complexPricingDetails.some((detail) =>
      (detail.price_components || []).some(
        (component) =>
          Number(component[field] || 0) > 0,
      ),
    );
    if (hasComplexPricing) {
      return (
        <AppButton
          type='button'
          className='router-inline-button'
          onClick={() => openComplexPricingModal(row)}
        >
          {t('channel.edit.model_selector.pricing_detail_button')}
        </AppButton>
      );
    }
    const price = row?.[field];
    const hasPrice =
      price !== null &&
      price !== undefined &&
      price !== '';
    if (!hasPrice) {
      return <span className='router-nowrap'>-</span>;
    }
    return <span className='router-nowrap'>{price}</span>;
  };

  const renderPublishCheck = (row) => {
    const status = normalizePublishStatus(row);
    return (
      <AppTag color={publishCheckColor(status)} className='router-tag'>
        {t(`channel.edit.publish.check_status.${status}`)}
      </AppTag>
    );
  };

  const renderProcurementReadiness = (row) => {
    const readiness = row?.procurement_readiness || {};
    const status = (readiness.status || 'missing').toString();
    if (status === 'ready') {
      return (
        <AppTag color='green' className='router-tag'>
          {t('channel.edit.publish.procurement_status.ready')}
        </AppTag>
      );
    }
    const reason = (readiness.reason || '').toString().trim();
    const modelName = (row?.model || row?.upstream_model || '').toString().trim();
    const isMutating = publishMutatingModel === modelName;
    return (
      <div className='router-inline-actions'>
        <AppTag
          color={procurementReadinessColor(status)}
          className='router-tag'
          title={reason}
        >
          {t('channel.edit.publish.procurement_status.missing')}
        </AppTag>
        {!publishReadonly && onMarkZeroCost ? (
          <AppPopconfirm
            title={t('channel.edit.publish.mark_zero_cost_confirm')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            disabled={isMutating}
            onConfirm={() => onMarkZeroCost(row)}
          >
            <span>
              <AppButton
                type='button'
                className='router-inline-button'
                loading={isMutating}
                disabled={isMutating}
              >
                {t('channel.edit.publish.mark_zero_cost')}
              </AppButton>
            </span>
          </AppPopconfirm>
        ) : null}
        {onNavigateTab ? (
          <AppButton
            type='button'
            className='router-inline-button'
            onClick={() => onNavigateTab('overview')}
          >
            {t('channel.edit.publish.configure_procurement')}
          </AppButton>
        ) : null}
      </div>
    );
  };

  const renderPublishAction = (row) => {
    const status = normalizePublishStatus(row);
    const modelName = (row?.model || row?.upstream_model || '').toString().trim();
    const isMutating = publishMutatingModel === modelName;
    if (status === 'published') {
      const currentPublishedName = (row?.published_model || row?.model || row?.upstream_model || '')
        .toString()
        .trim();
      const originalPublishedName = (row?.published_model_original || row?.published_model || row?.model || row?.upstream_model || '')
        .toString()
        .trim();
      const hasNameChange = currentPublishedName !== originalPublishedName;
      return (
        <div className='router-inline-actions'>
          {hasNameChange && (
            <AppButton
              type='button'
              className='router-inline-button'
              loading={isMutating}
              disabled={publishReadonly || isMutating}
              onClick={() => onUpdatePublish?.(row, true)}
            >
              {t('channel.edit.publish.action_save_name')}
            </AppButton>
          )}
          <AppPopconfirm
            title={t('channel.edit.publish.unpublish_confirm')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            disabled={publishReadonly || isMutating}
            onConfirm={() => onUpdatePublish?.(row, false)}
          >
            <span>
              <AppButton
                type='button'
                className='router-inline-button'
                loading={isMutating}
                disabled={publishReadonly || isMutating}
              >
                {t('channel.edit.publish.action_unpublish')}
              </AppButton>
            </span>
          </AppPopconfirm>
        </div>
      );
    }
    const missingSellPrice =
      normalizeChannelModelType(row?.type) !== 'image' && !hasPositiveSellPrice(row);
    const publishDisabled =
      publishReadonly ||
      isMutating ||
      status !== 'pending_publish' ||
      missingSellPrice;
    let blockReason = '';
    let blockTab = '';
    if (missingSellPrice) {
      blockReason = t('channel.edit.publish.zero_price_blocked');
    } else if (status !== 'pending_publish') {
      blockReason = t(`channel.edit.publish.check_status.${status}`);
      if (status === 'pending_config') {
        blockTab = 'endpoints';
      } else if (status === 'pending_test') {
        blockTab = 'tests';
      }
    }
    return (
      <div className='router-inline-actions'>
        <AppButton
          type='button'
          className='router-inline-button'
          loading={isMutating}
          disabled={publishDisabled}
          onClick={() => onUpdatePublish?.(row, true)}
        >
          {t('channel.edit.publish.action_publish')}
        </AppButton>
        {blockReason ? (
          <span className='router-toolbar-meta' title={blockReason}>
            {blockReason}
          </span>
        ) : null}
        {blockTab && onNavigateTab ? (
          <AppButton
            type='button'
            className='router-inline-button'
            onClick={() => onNavigateTab(blockTab)}
          >
            {t('channel.edit.publish.go_to_fix')}
          </AppButton>
        ) : null}
      </div>
    );
  };

  return (
    <AppDetailSection
      title={t('channel.edit.publish.title')}
      titleTag='span'
      headerStart={
        <span className='router-toolbar-meta'>
          ({t('channel.edit.publish.summary', { count: publishRows.length })})
        </span>
      }
    >
      <div>
        <AppAlert
          type='info'
          showIcon
          className='router-section-message'
          title={t('channel.edit.publish.hint')}
        />
        {publishedCount > 0 ? (
          <AppAlert
            type='success'
            showIcon
            className='router-section-message'
            title={t('channel.edit.publish.next_step_title')}
            description={
              <span>
                {t('channel.edit.publish.next_step_desc')}{' '}
                <Link to='/admin/group'>
                  {t('channel.edit.publish.next_step_link')}
                </Link>
              </span>
            }
          />
        ) : null}
        <div className='router-inline-actions router-section-message'>
          <span className='router-toolbar-meta'>
            {t('channel.edit.publish.filter_label')}
          </span>
          <AppSelect
            className='router-section-dropdown router-dropdown-min-170 router-detail-filter-dropdown'
            value={statusFilter}
            options={statusFilterOptions}
            onChange={(e, { value }) => setStatusFilter((value || 'all').toString())}
          />
        </div>
        <AppTable
          className='router-detail-table router-table-fit-page'
          pagination={false}
          locale={{
            emptyText: (
              <AppEmpty>{t('channel.edit.publish.empty')}</AppEmpty>
            ),
          }}
          rowKey={(row) => row.model || row.upstream_model}
          dataSource={filteredRows}
          columns={[
            {
              title: t('channel.edit.model_selector.table.name'),
              dataIndex: 'upstream_model',
              key: 'upstream_model',
              width: 180,
              ellipsis: true,
              render: (value) => (
                <span className='router-cell-truncate router-monospace-value' title={value || '-'}>
                  {value || '-'}
                </span>
              ),
            },
            {
              title: t('channel.edit.publish.table.published_model'),
              key: 'published_model',
              width: 190,
              render: (_, row) => {
                const modelName = (row?.model || row?.upstream_model || '').toString().trim();
                return (
                  <AppInput
                    className='router-table-input router-monospace-value'
                    value={
                      Object.prototype.hasOwnProperty.call(row || {}, 'published_model')
                        ? row.published_model
                        : modelName
                    }
                    disabled={publishReadonly}
                    onChange={(event, data) =>
                      onUpdatePublishedModelName?.(
                        row,
                        data?.value ?? event?.target?.value ?? '',
                      )
                    }
                  />
                );
              },
            },
            {
              title: t('channel.edit.model_selector.table.type'),
              key: 'type',
              width: 72,
              render: (_, row) =>
                t(`channel.model_types.${normalizeChannelModelType(row.type)}`),
            },
            {
              title: t('channel.edit.model_selector.table.publish_status'),
              key: 'publish_status',
              width: 96,
              render: (_, row) => {
                const status = normalizePublishStatus(row);
                return (
                  <AppTag color={publishStatusColor(status)} className='router-tag'>
                    {t(`channel.edit.model_selector.publish_status.${status}`)}
                  </AppTag>
                );
              },
            },
            {
              title: t('channel.edit.model_selector.table.input_price'),
              key: 'input_price',
              width: 112,
              render: (_, row) => renderPrice(row, 'input_price'),
            },
            {
              title: t('channel.edit.model_selector.table.output_price'),
              key: 'output_price',
              width: 112,
              render: (_, row) => renderPrice(row, 'output_price'),
            },
            {
              title: t('channel.edit.publish.table.check'),
              key: 'check',
              width: 128,
              render: (_, row) => renderPublishCheck(row),
            },
            {
              title: t('channel.edit.publish.table.procurement'),
              key: 'procurement_readiness',
              width: 220,
              render: (_, row) => renderProcurementReadiness(row),
            },
            {
              title: t('channel.edit.publish.table.actions'),
              key: 'actions',
              width: 112,
              render: (_, row) => renderPublishAction(row),
            },
          ]}
        />
      </div>
    </AppDetailSection>
  );
};

export default ChannelDetailPublishTab;
