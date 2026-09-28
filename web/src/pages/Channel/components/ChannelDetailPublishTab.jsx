import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppAlert,
  AppButton,
  AppDetailSection,
  AppEmpty,
  AppInput,
  AppPopconfirm,
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
  onBatchPublish,
  publishMutatingModel,
  publishReadonly,
}) => {
  const [batchMode, setBatchMode] = useState(false);
  const [batchRowKeys, setBatchRowKeys] = useState([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

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

  const isPublishEligible = (row) => {
    if (normalizePublishStatus(row) !== 'pending_publish') {
      return false;
    }
    if (row?.procurement_readiness?.status !== 'ready') {
      return false;
    }
    if (normalizeChannelModelType(row?.type) !== 'image' && !hasPositiveSellPrice(row)) {
      return false;
    }
    return true;
  };

  const rowKeyOf = (row) => (row?.model || row?.upstream_model || '').toString().trim();

  const eligibleRows = useMemo(
    () => publishRows.filter((row) => isPublishEligible(row)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishRows],
  );

  const selectedModels = useMemo(() => {
    const keySet = new Set(batchRowKeys);
    return publishRows
      .filter((row) => keySet.has(rowKeyOf(row)) && isPublishEligible(row))
      .map((row) => rowKeyOf(row))
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchRowKeys, publishRows]);

  const exitBatchMode = () => {
    setBatchMode(false);
    setBatchRowKeys([]);
  };

  const runBatchPublish = async (models) => {
    const list = Array.from(new Set((models || []).filter(Boolean)));
    if (list.length === 0 || batchSubmitting) {
      return;
    }
    setBatchSubmitting(true);
    try {
      const ok = await onBatchPublish?.(list);
      if (ok) {
        exitBatchMode();
      }
    } finally {
      setBatchSubmitting(false);
    }
  };

  const tableRowSelection = batchMode
    ? {
        columnWidth: 48,
        selectedRowKeys: batchRowKeys,
        getCheckboxProps: (row) => ({
          disabled: publishReadonly || !isPublishEligible(row),
        }),
        onSelect: (record, selected) => {
          const rowKey = rowKeyOf(record);
          setBatchRowKeys((prev) => {
            const next = new Set(prev);
            if (selected) {
              next.add(rowKey);
            } else {
              next.delete(rowKey);
            }
            return Array.from(next);
          });
        },
        onSelectAll: (selected, _selectedRows, changeRows) => {
          const changedKeys = changeRows
            .filter((row) => isPublishEligible(row))
            .map(rowKeyOf);
          setBatchRowKeys((prev) => {
            const next = new Set(prev);
            changedKeys.forEach((rowKey) => {
              if (selected) {
                next.add(rowKey);
              } else {
                next.delete(rowKey);
              }
            });
            return Array.from(next);
          });
        },
      }
    : undefined;

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
    const channelID = (row?.channel_id || '').toString().trim();
    const modelName = (row?.model || row?.upstream_model || '').toString().trim();
    const procurementPath = `/admin/finance?tab=procurement&channel_id=${encodeURIComponent(channelID)}&model=${encodeURIComponent(modelName)}`;
    return (
      <div className='router-inline-actions'>
        <AppTag
          color={procurementReadinessColor(status)}
          className='router-tag'
          title={readiness.reason || ''}
        >
          {t(`channel.edit.publish.procurement_status.${status}`)}
        </AppTag>
        {status !== 'ready' && channelID !== '' && modelName !== '' ? (
          <Link className='router-inline-button' to={procurementPath}>
            {t('channel.edit.publish.configure_procurement')}
          </Link>
        ) : null}
      </div>
    );
  };

  const renderPublishAction = (row) => {
    const status = normalizePublishStatus(row);
    const modelName = (row?.model || row?.upstream_model || '').toString().trim();
    const isMutating = publishMutatingModel === modelName;
    const procurementReady = row?.procurement_readiness?.status === 'ready';
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
      !procurementReady ||
      missingSellPrice;
    return (
      <div className='router-inline-actions'>
        <AppButton
          type='button'
          className='router-inline-button'
          loading={isMutating}
          disabled={publishDisabled}
          title={
            publishDisabled && missingSellPrice
              ? t('channel.edit.publish.zero_price_blocked')
              : publishDisabled && !procurementReady
                ? row?.procurement_readiness?.reason
                : publishDisabled && status !== 'pending_publish'
                  ? t(`channel.edit.publish.check_status.${status}`)
                  : undefined
          }
          onClick={() => onUpdatePublish?.(row, true)}
        >
          {t('channel.edit.publish.action_publish')}
        </AppButton>
        {missingSellPrice ? (
          <AppTag color='red' className='router-tag'>
            {t('channel.edit.publish.zero_price_tag')}
          </AppTag>
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
        {!publishReadonly ? (
          <div className='router-inline-actions router-section-message'>
            {!batchMode ? (
              <AppButton
                type='button'
                className='router-inline-button'
                disabled={eligibleRows.length === 0}
                onClick={() => {
                  setBatchMode(true);
                  setBatchRowKeys(eligibleRows.map((row) => rowKeyOf(row)));
                }}
              >
                {t('channel.edit.publish.batch_enter', { count: eligibleRows.length })}
              </AppButton>
            ) : (
              <>
                <AppButton
                  type='button'
                  className='router-inline-button'
                  disabled={eligibleRows.length === 0}
                  onClick={() =>
                    setBatchRowKeys(eligibleRows.map((row) => rowKeyOf(row)))
                  }
                >
                  {t('channel.edit.publish.batch_select_all', { count: eligibleRows.length })}
                </AppButton>
                <AppButton
                  type='button'
                  className='router-inline-button'
                  loading={batchSubmitting}
                  disabled={batchSubmitting || selectedModels.length === 0}
                  onClick={() => runBatchPublish(selectedModels)}
                >
                  {t('channel.edit.publish.batch_publish', { count: selectedModels.length })}
                </AppButton>
                <AppButton
                  type='button'
                  className='router-inline-button'
                  disabled={batchSubmitting}
                  onClick={exitBatchMode}
                >
                  {t('common.cancel')}
                </AppButton>
              </>
            )}
          </div>
        ) : null}
        <AppTable
          className='router-detail-table router-table-fit-page'
          pagination={false}
          rowSelection={tableRowSelection}
          locale={{
            emptyText: (
              <AppEmpty>{t('channel.edit.publish.empty')}</AppEmpty>
            ),
          }}
          rowKey={(row) => row.model || row.upstream_model}
          dataSource={publishRows}
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
              width: 128,
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
