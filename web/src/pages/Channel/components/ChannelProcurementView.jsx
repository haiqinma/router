import React, { useMemo, useState } from 'react';
import UnitDropdown from '../../../components/UnitDropdown';
import { showInfo } from '../../../helpers';
import {
  AppAlert,
  AppButton,
  AppCompact,
  AppDetailSection,
  AppField,
  AppFormActions,
  AppFormRow,
  AppInput,
  AppInputNumber,
  AppModal,
  AppPopconfirm,
  AppSegmented,
  AppSelect,
  AppTable,
  AppTableActionButton,
  AppTag,
  AppTooltip,
} from '../../../router-ui';
import {
  buildManualPurchaseRecord,
  buildManualPurchaseRecordFromSnapshot,
  buildManualQuotaItem,
  buildManualQuotaItemFromSnapshotItem,
  buildProcurementCostDraft,
  ensureUnitOption,
  entitlementTypeOptions,
  entitlementTypePatch,
  entitlementTypeValue,
  formatNumberText,
  formatProcurementCapacityText,
  formatProcurementCostText,
  formatProcurementResourceText,
  formatProcurementScopeText,
  formatProcurementSourceText,
  formatProcurementUnitCostText,
  formatUsageText,
  isPurchaseCurrencyCNY,
  MANUAL_CURRENCY_OPTIONS,
  normalizeManualValidityInput,
  procurementScopeOptions,
  procurementStatusColor,
  PROCUREMENT_CURRENCY_OPTIONS,
  resolveManualAmountLabel,
  resolveManualItemAmounts,
  resolveManualResourceHint,
  shouldShowManualAmountFields,
  toUnixTimestamp,
} from './channelBilling.helpers';

// Per-channel procurement workspace: manual purchase snapshots + procurement
// batches (cost/status/consumptions). Pure presentational — all data/handlers
// come from props. Shared by the channel detail procurement tab and the finance
// aggregate report's (legacy) channel drill-down.
const ChannelProcurementView = ({
  t,
  billingLoading,
  billingSnapshots,
  procurementBatches,
  billingReadonly,
  billingSubmitting,
  onRefreshBilling,
  onManualSnapshotUpdate,
  onManualSnapshotDelete,
  onProcurementBatchCostUpdate,
  onProcurementBatchStatusUpdate,
  onProcurementBatchConsumptionsLoad,
  timestamp2string,
  billingError,
  channelID,
  manualChannelOptions = [],
  requireManualChannelSelect = false,
  showProcurementBatches = true,
}) => {
  const [manualPurchaseRecord, setManualPurchaseRecord] = useState(
    buildManualPurchaseRecord()
  );
  const [manualMessage, setManualMessage] = useState('');
  const [manualItems, setManualItems] = useState([buildManualQuotaItem()]);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editingPurchaseRecord, setEditingPurchaseRecord] = useState(null);
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [editingProcurementBatch, setEditingProcurementBatch] = useState(null);
  const [costDraft, setCostDraft] = useState(buildProcurementCostDraft(null));
  const [consumptionModalOpen, setConsumptionModalOpen] = useState(false);
  const [consumptionRows, setConsumptionRows] = useState([]);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [viewingProcurementBatch, setViewingProcurementBatch] = useState(null);
  const [manualValidityTouched, setManualValidityTouched] = useState({
    valid_from_input: false,
    valid_until_input: false,
  });
  const [billingView, setBillingView] = useState('records');

  const purchaseRecords = useMemo(
    () =>
      (Array.isArray(billingSnapshots) ? billingSnapshots : []).filter(
        (snapshot) =>
          (snapshot?.source_type || '').toString().trim() === 'manual'
      ),
    [billingSnapshots]
  );
  const procurementRows = Array.isArray(procurementBatches)
    ? procurementBatches
    : [];
  const parentPurchaseOptions = purchaseRecords
    .filter((item) => item?.id && item.id !== editingPurchaseRecord?.id)
    .map((item) => ({
      value: item.id,
      label: `${item.entitlement_name || item.id} ${item.purchase_at ? timestamp2string(item.purchase_at) : ''}`.trim(),
    }));

  const appendManualItem = () => {
    setManualItems((prev) => [...prev, buildManualQuotaItem()]);
  };

  const removeManualItem = (index) => {
    setManualItems((prev) => {
      if (prev.length <= 1) {
        return [buildManualQuotaItem()];
      }
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const updateManualItem = (index, patch) => {
    setManualItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  };

  const updateManualPurchaseRecord = (patch) => {
    setManualPurchaseRecord((prev) => ({
      ...prev,
      ...(patch || {}),
    }));
  };

  const updateManualValidityInput = (field, value, defaultTime) => {
    const firstTouch = manualValidityTouched[field] !== true;
    updateManualPurchaseRecord({
      [field]: normalizeManualValidityInput(value, defaultTime, firstTouch),
    });
    if (firstTouch) {
      setManualValidityTouched((prev) => ({
        ...prev,
        [field]: true,
      }));
    }
  };

  const closeManualModal = () => {
    if (!billingSubmitting) {
      setManualModalOpen(false);
      setEditingPurchaseRecord(null);
    }
  };

  const openCreateManualModal = () => {
    setEditingPurchaseRecord(null);
    setManualPurchaseRecord({
      ...buildManualPurchaseRecord(),
      channel_id: (channelID || '').toString().trim(),
    });
    setManualValidityTouched({
      valid_from_input: false,
      valid_until_input: false,
    });
    setManualMessage('');
    setManualItems([buildManualQuotaItem()]);
    setManualModalOpen(true);
  };

  const openEditManualModal = (row) => {
    setEditingPurchaseRecord(row);
    setManualPurchaseRecord({
      ...buildManualPurchaseRecordFromSnapshot(row),
      channel_id:
        (row?.channel_id || channelID || '').toString().trim(),
    });
    setManualValidityTouched({
      valid_from_input: true,
      valid_until_input: true,
    });
    setManualMessage((row?.message || '').toString());
    const items = Array.isArray(row?.items) ? row.items : [];
    setManualItems(
      items.length > 0
        ? items.map((item) => buildManualQuotaItemFromSnapshotItem(item))
        : [buildManualQuotaItem()]
    );
    setManualModalOpen(true);
  };

  const openCostModal = (row) => {
    setEditingProcurementBatch(row);
    setCostDraft(buildProcurementCostDraft(row));
    setCostModalOpen(true);
  };

  const closeCostModal = () => {
    if (!billingSubmitting) {
      setCostModalOpen(false);
      setEditingProcurementBatch(null);
    }
  };

  const updateCostDraft = (patch) => {
    setCostDraft((prev) => ({
      ...prev,
      ...(patch || {}),
    }));
  };

  const openConsumptionModal = async (row) => {
    setViewingProcurementBatch(row);
    setConsumptionRows([]);
    setConsumptionModalOpen(true);
    setConsumptionLoading(true);
    try {
      const rows = await onProcurementBatchConsumptionsLoad(row?.id);
      setConsumptionRows(Array.isArray(rows) ? rows : []);
    } finally {
      setConsumptionLoading(false);
    }
  };

  const closeConsumptionModal = () => {
    if (!consumptionLoading) {
      setConsumptionModalOpen(false);
      setViewingProcurementBatch(null);
      setConsumptionRows([]);
    }
  };

  const submitManualSnapshot = async () => {
    const targetChannelID = (manualPurchaseRecord.channel_id || channelID || '')
      .toString()
      .trim();
    if (requireManualChannelSelect && !targetChannelID) {
      showInfo(t('channel.edit.billing.manual_channel_required'));
      return;
    }
    const purchaseAmount = Number(manualPurchaseRecord.purchase_amount || 0);
    const purchaseCurrency = (manualPurchaseRecord.purchase_currency || 'CNY')
      .toString()
      .trim()
      .toUpperCase();
    const purchaseFXRate = purchaseCurrency === 'CNY'
      ? 1
      : Number(manualPurchaseRecord.purchase_fx_rate || 0);
    const purchaseCostAmount = purchaseCurrency === 'CNY'
      ? purchaseAmount
      : Number(manualPurchaseRecord.purchase_cost_amount || 0);
    const saved = await onManualSnapshotUpdate({
      channel_id: targetChannelID,
      id: editingPurchaseRecord?.id || '',
      purchase_at: toUnixTimestamp(manualPurchaseRecord.purchase_at_input),
      purchase_currency: purchaseCurrency,
      purchase_amount: purchaseAmount,
      purchase_fx_rate: purchaseFXRate,
      purchase_cost_amount: purchaseCostAmount,
      entitlement_name: manualPurchaseRecord.entitlement_name,
      event_type: manualPurchaseRecord.event_type,
      parent_snapshot_id: manualPurchaseRecord.parent_snapshot_id,
      old_batch_disposition: manualPurchaseRecord.old_batch_disposition,
      valid_from: toUnixTimestamp(manualPurchaseRecord.valid_from_input),
      valid_until: toUnixTimestamp(manualPurchaseRecord.valid_until_input),
      items: manualItems.map((manualItem) => {
        const amounts = resolveManualItemAmounts(manualItem);
        return {
          id: manualItem.id,
          resource_type: manualItem.resource_type,
          quota_type: manualItem.quota_type,
          quota_label: '',
          ...amounts,
          currency: manualItem.currency,
          reset_at: toUnixTimestamp(manualItem.reset_at_input),
          expires_at: toUnixTimestamp(manualItem.expires_at_input),
          source_ref: 'manual',
        };
      }),
      message: manualMessage,
    });
    if (saved) {
      setManualModalOpen(false);
      setEditingPurchaseRecord(null);
      setManualPurchaseRecord(buildManualPurchaseRecord());
      setManualMessage('');
      setManualItems([buildManualQuotaItem()]);
    }
  };

  const deleteManualSnapshot = async (row) => {
    if (!row?.id || !onManualSnapshotDelete) {
      return;
    }
    await onManualSnapshotDelete(row.id);
  };

  const submitProcurementBatchCost = async () => {
    if (!editingProcurementBatch?.id) {
      return;
    }
    const saved = await onProcurementBatchCostUpdate(
      editingProcurementBatch.id,
      costDraft
    );
    if (saved) {
      closeCostModal();
    }
  };

  const updateProcurementBatchStatus = async (row, status) => {
    if (!row?.id) {
      return;
    }
    await onProcurementBatchStatusUpdate(row.id, status);
  };

  const renderManualSnapshotForm = () => (
    <div>
      <div className='router-billing-manual-item-card'>
        <div className='router-billing-manual-item-header'>
          <div className='router-billing-manual-item-title'>
            {t('channel.edit.billing.manual_purchase_title')}
            <span className='router-billing-manual-item-title-hint'>
              （{t('channel.edit.billing.manual_purchase_hint')}）
            </span>
          </div>
        </div>
        <AppFormRow>
          {requireManualChannelSelect ? (
            <AppField label={t('channel.edit.billing.manual_channel')} required>
              <AppSelect
                className='router-section-input'
                search
                options={manualChannelOptions}
                value={manualPurchaseRecord.channel_id}
                placeholder={t('channel.edit.billing.manual_channel_placeholder')}
                onChange={(e, { value }) =>
                  updateManualPurchaseRecord({
                    channel_id: (value || '').toString().trim(),
                  })
                }
                disabled={
                  billingReadonly ||
                  billingSubmitting ||
                  Boolean(editingPurchaseRecord?.id)
                }
              />
            </AppField>
          ) : null}
          <AppField label={t('channel.edit.billing.manual_purchase_at')} required>
            <AppInput
              className='router-section-input'
              type='datetime-local'
              value={manualPurchaseRecord.purchase_at_input}
              onChange={(e, { value }) =>
                updateManualPurchaseRecord({
                  purchase_at_input: (value || '').toString(),
                })
              }
              readOnly={billingReadonly || billingSubmitting}
            />
          </AppField>
          <AppField label={t('channel.edit.billing.manual_purchase_currency')} required>
            <AppSelect
              className='router-section-input'
              options={ensureUnitOption(
                PROCUREMENT_CURRENCY_OPTIONS,
                manualPurchaseRecord.purchase_currency || 'CNY'
              )}
              value={manualPurchaseRecord.purchase_currency || 'CNY'}
              onChange={(e, { value }) => {
                const nextCurrency = (value || 'CNY')
                  .toString()
                  .trim()
                  .toUpperCase();
                updateManualPurchaseRecord({
                  purchase_currency: nextCurrency,
                  purchase_fx_rate:
                    nextCurrency === 'CNY'
                      ? 1
                      : manualPurchaseRecord.purchase_fx_rate,
                  purchase_cost_amount:
                    nextCurrency === 'CNY'
                      ? Number(manualPurchaseRecord.purchase_amount || 0)
                      : manualPurchaseRecord.purchase_cost_amount,
                });
              }}
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField>
          <AppField label={t('channel.edit.billing.manual_purchase_amount')} required>
            <AppInputNumber
              className='router-section-input'
              fluid
              min={0}
              value={manualPurchaseRecord.purchase_amount}
              onChange={(e, { value }) =>
                updateManualPurchaseRecord({
                  purchase_amount: Number(value || 0),
                  purchase_cost_amount: isPurchaseCurrencyCNY(manualPurchaseRecord)
                    ? Number(value || 0)
                    : Number(value || 0) *
                      Number(manualPurchaseRecord.purchase_fx_rate || 0),
                })
              }
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField>
          {!isPurchaseCurrencyCNY(manualPurchaseRecord) && (
            <>
              <AppField label={t('channel.edit.billing.manual_purchase_fx_rate')} required>
                <AppInputNumber
                  className='router-section-input'
                  fluid
                  min={0}
                  value={manualPurchaseRecord.purchase_fx_rate}
                  onChange={(e, { value }) =>
                    updateManualPurchaseRecord({
                      purchase_fx_rate: Number(value || 0),
                      purchase_cost_amount:
                        Number(manualPurchaseRecord.purchase_amount || 0) *
                        Number(value || 0),
                    })
                  }
                  disabled={billingReadonly || billingSubmitting}
                />
              </AppField>
              <AppField label={t('channel.edit.billing.manual_purchase_cost_amount')} required>
                <AppInputNumber
                  className='router-section-input'
                  fluid
                  min={0}
                  value={manualPurchaseRecord.purchase_cost_amount}
                  onChange={(e, { value }) =>
                    updateManualPurchaseRecord({
                      purchase_cost_amount: Number(value || 0),
                    })
                  }
                  disabled={billingReadonly || billingSubmitting}
                />
              </AppField>
            </>
          )}
        </AppFormRow>
      </div>
      <div className='router-billing-manual-item-card'>
        <div className='router-billing-manual-item-header'>
          <div className='router-billing-manual-item-title'>
            {t('channel.edit.billing.entitlement_info_title')}
          </div>
        </div>
        <AppFormRow>
          <AppField label={t('channel.edit.billing.entitlement_name')} required>
            <AppInput
              className='router-section-input'
              value={manualPurchaseRecord.entitlement_name}
              onChange={(e, { value }) =>
                updateManualPurchaseRecord({ entitlement_name: (value || '').toString() })
              }
              readOnly={billingReadonly || billingSubmitting}
            />
          </AppField>
          <AppField label={t('channel.edit.billing.manual_valid_from')}>
            <AppInput
              className='router-section-input'
              type='datetime-local'
              step={1}
              value={manualPurchaseRecord.valid_from_input}
              onChange={(e, { value }) =>
                updateManualValidityInput(
                  'valid_from_input',
                  value,
                  '00:00:00'
                )
              }
              readOnly={billingReadonly || billingSubmitting}
            />
          </AppField>
          <AppField label={t('channel.edit.billing.manual_valid_until')}>
            <AppInput
              className='router-section-input'
              type='datetime-local'
              step={1}
              value={manualPurchaseRecord.valid_until_input}
              onChange={(e, { value }) =>
                updateManualValidityInput(
                  'valid_until_input',
                  value,
                  '23:59:59'
                )
              }
              readOnly={billingReadonly || billingSubmitting}
            />
          </AppField>
          {!editingPurchaseRecord ? <AppField label={t('channel.edit.billing.procurement_event_type')} required>
            <AppSegmented
              options={[
                { value: 'purchase', label: t('channel.edit.billing.procurement_events.purchase') },
                { value: 'renewal', label: t('channel.edit.billing.procurement_events.renewal') },
                { value: 'upgrade', label: t('channel.edit.billing.procurement_events.upgrade') },
                { value: 'quota_adjustment', label: t('channel.edit.billing.procurement_events.quota_adjustment') },
              ]}
              value={manualPurchaseRecord.event_type}
              onChange={(e, { value }) => updateManualPurchaseRecord({ event_type: value, parent_snapshot_id: value === 'upgrade' ? manualPurchaseRecord.parent_snapshot_id : '', old_batch_disposition: value === 'upgrade' ? manualPurchaseRecord.old_batch_disposition : 'keep' })}
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField> : null}
        </AppFormRow>
        {!editingPurchaseRecord && manualPurchaseRecord.event_type === 'upgrade' ? <AppFormRow>
          <AppField label={t('channel.edit.billing.procurement_parent_record')} required>
            <AppSelect className='router-section-input' search options={parentPurchaseOptions} value={manualPurchaseRecord.parent_snapshot_id} placeholder={t('channel.edit.billing.procurement_parent_record_placeholder')} onChange={(e, { value }) => updateManualPurchaseRecord({ parent_snapshot_id: (value || '').toString() })} disabled={billingReadonly || billingSubmitting} />
          </AppField>
          <AppField label={t('channel.edit.billing.procurement_old_batch_disposition')} required>
            <AppSegmented options={[{ value: 'keep', label: t('channel.edit.billing.procurement_old_batch_dispositions.keep') }, { value: 'disable', label: t('channel.edit.billing.procurement_old_batch_dispositions.disable') }]} value={manualPurchaseRecord.old_batch_disposition} onChange={(e, { value }) => updateManualPurchaseRecord({ old_batch_disposition: value })} disabled={billingReadonly || billingSubmitting} />
          </AppField>
        </AppFormRow> : null}
      </div>
      <div className='router-billing-manual-item-header'>
        <div className='router-billing-manual-item-title'>
          {t('channel.edit.billing.entitlement_items_title')}
        </div>
        <AppButton
          type='button'
          className='router-page-button'
          basic
          disabled={billingReadonly || billingSubmitting}
          onClick={appendManualItem}
        >
          {t('channel.edit.billing.add_entitlement_item')}
        </AppButton>
      </div>
      <AppAlert
        type='info'
        showIcon
        className='router-section-message'
        title={t('channel.edit.billing.manual_resource_hints.default')}
      />
      {manualItems.map((item, index) => (
        <div
          key={`manual-quota-${index}`}
          className='router-billing-manual-item-card'
        >
          <div className='router-billing-manual-item-header'>
            <div className='router-billing-manual-item-title'>
              {t('channel.edit.billing.manual_item_title', {
                index: index + 1,
              })}
              <AppTooltip title={resolveManualResourceHint(item, t)}>
                <span className='router-help-trigger router-billing-manual-item-help'>
                  ?
                </span>
              </AppTooltip>
            </div>
            <div className='router-billing-manual-item-actions'>
              <AppButton
                type='button'
                className='router-page-button'
                basic
                danger
                disabled={billingReadonly || billingSubmitting}
                onClick={() => removeManualItem(index)}
              >
                {t('channel.edit.billing.remove_quota_item')}
              </AppButton>
            </div>
          </div>
          <AppFormRow>
            <AppField label={t('channel.edit.billing.manual_resource_type')} required>
              <AppSelect className='router-section-input'
                options={entitlementTypeOptions(t)}
                value={entitlementTypeValue(item)}
                onChange={(e, { value }) => updateManualItem(index, {
                  ...entitlementTypePatch(value),
                  quota_label: '',
                })}
                disabled={billingReadonly || billingSubmitting} />
            </AppField>
              {shouldShowManualAmountFields(item) ? (
                <>
                  <AppField
                    label={
                      resolveManualAmountLabel(item, t)
                    }
                    required
                  >
                    <AppCompact className='router-section-input-with-unit' block>
                      <AppInputNumber
                        className='router-section-input router-section-input-with-unit-field'
                        fluid
                        value={item.limit_amount}
                        min={0}
                        onChange={(e, { value }) =>
                          updateManualItem(index, {
                            limit_amount: value,
                          })
                        }
                        disabled={billingReadonly || billingSubmitting}
                      />
                      <UnitDropdown
                        variant='inputUnit'
                        options={ensureUnitOption(
                          MANUAL_CURRENCY_OPTIONS,
                          item.currency || 'USD'
                        )}
                        value={item.currency || 'USD'}
                        onChange={(_, { value }) =>
                          updateManualItem(index, {
                            currency: (value || 'USD')
                              .toString()
                              .trim()
                              .toUpperCase(),
                          })
                        }
                        disabled={billingReadonly || billingSubmitting}
                        aria-label={t('channel.edit.billing.currency')}
                      />
                    </AppCompact>
                  </AppField>
                </>
              ) : null}
          </AppFormRow>
        </div>
      ))}
      <AppFormRow>
        <AppField label={t('channel.edit.billing.message')}>
          <AppInput
            className='router-section-input'
            value={manualMessage}
            onChange={(e, { value }) =>
              setManualMessage((value || '').toString())
            }
            readOnly={billingReadonly || billingSubmitting}
          />
        </AppField>
      </AppFormRow>
    </div>
  );

  const renderProcurementCostForm = () => (
    <div>
      <AppFormRow>
        <AppField
          label={t('channel.edit.billing.procurement_table.capacity')}
          required
        >
          <AppInputNumber
            className='router-section-input'
            fluid
            min={0}
            value={costDraft.capacity_effective}
            onChange={(e, { value }) =>
              updateCostDraft({
                capacity_effective: Number(value || 0),
              })
            }
            disabled={billingReadonly || billingSubmitting}
          />
        </AppField>
        <AppField
          label={t('channel.edit.billing.procurement_table.purchase_currency')}
          required
        >
          <AppSelect
            className='router-section-input'
            options={ensureUnitOption(
              PROCUREMENT_CURRENCY_OPTIONS,
              costDraft.purchase_currency || 'CNY'
            )}
            value={costDraft.purchase_currency || 'CNY'}
            onChange={(e, { value }) =>
              updateCostDraft({
                purchase_currency: (value || 'CNY')
                  .toString()
                  .trim()
                  .toUpperCase(),
              })
            }
            disabled={billingReadonly || billingSubmitting}
          />
        </AppField>
        <AppField
          label={t('channel.edit.billing.procurement_table.purchase_amount')}
          required
        >
          <AppInputNumber
            className='router-section-input'
            fluid
            min={0}
            value={costDraft.purchase_amount}
            onChange={(e, { value }) =>
              updateCostDraft({
                purchase_amount: Number(value || 0),
              })
            }
            disabled={billingReadonly || billingSubmitting}
          />
        </AppField>
      </AppFormRow>
      <AppFormRow>
        <AppField label={t('channel.edit.billing.procurement_table.scope_type')}>
          <AppSelect
            className='router-section-input'
            options={procurementScopeOptions(t)}
            value={costDraft.scope_type || 'global'}
            onChange={(e, { value }) =>
              updateCostDraft({
                scope_type: (value || 'global').toString().trim(),
                scope_value:
                  (value || 'global').toString().trim() === 'global'
                    ? ''
                    : costDraft.scope_value,
              })
            }
            disabled={billingReadonly || billingSubmitting}
          />
        </AppField>
        <AppField label={t('channel.edit.billing.procurement_table.scope_value')}>
          <AppInput
            className='router-section-input'
            value={costDraft.scope_value || ''}
            onChange={(e, { value }) =>
              updateCostDraft({
                scope_value: (value || '').toString(),
              })
            }
            readOnly={
              billingReadonly ||
              billingSubmitting ||
              (costDraft.scope_type || 'global') === 'global'
            }
            placeholder={t(
              'channel.edit.billing.procurement_table.scope_value_placeholder'
            )}
          />
        </AppField>
        <AppField
          label={t('channel.edit.billing.procurement_table.purchase_fx_rate')}
          required
        >
          <AppInputNumber
            className='router-section-input'
            fluid
            min={0}
            value={costDraft.purchase_fx_rate}
            onChange={(e, { value }) =>
              updateCostDraft({
                purchase_fx_rate: Number(value || 0),
              })
            }
            disabled={billingReadonly || billingSubmitting}
          />
        </AppField>
        <AppField
          label={t('channel.edit.billing.procurement_table.purchase_cost_amount')}
        >
          <AppInputNumber
            className='router-section-input'
            fluid
            min={0}
            value={costDraft.purchase_cost_amount}
            onChange={(e, { value }) =>
              updateCostDraft({
                purchase_cost_amount: Number(value || 0),
              })
            }
            disabled={billingReadonly || billingSubmitting}
          />
        </AppField>
      </AppFormRow>
      <AppAlert
        type='info'
        showIcon
        className='router-section-message'
        title={t('channel.edit.billing.procurement_cost_hint')}
      />
    </div>
  );

  return (
    <div className='router-billing-page'>
      <div className='router-billing-workspace-toolbar'>
        {showProcurementBatches ? (
          <AppSegmented
            value={billingView}
            onChange={(e, { value }) => setBillingView(value)}
            options={[
              { value: 'records', label: t('channel.edit.billing.snapshots_title') },
              { value: 'batches', label: t('channel.edit.billing.procurement_title') },
            ]}
          />
        ) : null}
        {billingView === 'records' || (showProcurementBatches && billingView === 'batches') ? (
          <AppButton type='button' className='router-page-button' color='blue'
            disabled={billingReadonly || billingSubmitting}
            onClick={openCreateManualModal}>
            {t('channel.edit.billing.add_purchase_record')}
          </AppButton>
        ) : null}
        {typeof onRefreshBilling === 'function' ? (
          <AppButton
            type='button'
            className='router-page-button'
            loading={billingLoading}
            disabled={billingLoading || billingSubmitting}
            onClick={onRefreshBilling}
          >
            {t('common.refresh')}
          </AppButton>
        ) : null}
      </div>
      <AppAlert type='info' showIcon className='router-section-message' title={t('channel.edit.billing.structure_hint')} />
      {billingView === 'records' && (
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
                  Number(value || 0) > 0
                    ? `${formatNumberText(value, 6)} CNY`
                    : '-',
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
                  const start = Number(row?.valid_from || 0) > 0
                    ? timestamp2string(row.valid_from)
                    : t('channel.edit.billing.validity_immediate');
                  const end = Number(row?.valid_until || 0) > 0
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
                            `${
                              row.quota_label || row.quota_type
                            }: ${formatUsageText(row)}`
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
                      onClick={() => openEditManualModal(row)}
                    />
                    <AppPopconfirm
                      title={t(
                        'channel.edit.billing.delete_purchase_record_confirm'
                      )}
                      okText={t('common.confirm')}
                      cancelText={t('common.cancel')}
                      onConfirm={() => deleteManualSnapshot(row)}
                    >
                      <span>
                        <AppTableActionButton
                          title={t(
                            'channel.edit.billing.delete_purchase_record'
                          )}
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
      )}
      {showProcurementBatches && billingView === 'batches' && (
        <AppDetailSection className='router-billing-management-section'
          title={t('channel.edit.billing.procurement_title')} titleTag='span'>
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
                    {t(
                      `channel.edit.billing.procurement_status.${
                        value || 'unknown'
                      }`,
                      {
                        defaultValue: value || '-',
                      }
                    )}
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
                      title={t(
                        'channel.edit.billing.procurement_view_consumptions'
                      )}
                      icon='eye'
                      disabled={billingSubmitting}
                      onClick={() => openConsumptionModal(row)}
                    />
                    <AppTableActionButton
                      title={t('channel.edit.billing.procurement_edit_cost')}
                      icon='edit'
                      disabled={billingReadonly || billingSubmitting}
                      onClick={() => openCostModal(row)}
                    />
                    {(row?.cost_status || '').toString().trim() ===
                    'disabled' ? (
                      <AppPopconfirm
                        title={t(
                          'channel.edit.billing.procurement_restore_confirm'
                        )}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                        onConfirm={() =>
                          updateProcurementBatchStatus(row, 'active')
                        }
                      >
                        <AppTableActionButton
                          title={t('channel.edit.billing.procurement_restore')}
                          icon='check'
                          disabled={billingReadonly || billingSubmitting}
                        />
                      </AppPopconfirm>
                    ) : (
                      <AppPopconfirm
                        title={t(
                          'channel.edit.billing.procurement_disable_confirm'
                        )}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                        onConfirm={() =>
                          updateProcurementBatchStatus(row, 'disabled')
                        }
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
      )}
      <div>
        <AppModal
          size='large'
          open={manualModalOpen}
          onClose={closeManualModal}
          title={t(
            editingPurchaseRecord?.id
              ? 'channel.edit.billing.edit_purchase_record'
              : 'channel.edit.billing.manual_update_title'
          )}
          footer={
            <AppFormActions>
              <AppButton
                type='button'
                disabled={billingSubmitting}
                onClick={closeManualModal}
              >
                {t('common.cancel')}
              </AppButton>
              <AppButton
                type='button'
                color='blue'
                loading={billingSubmitting}
                disabled={billingReadonly || billingSubmitting}
                onClick={submitManualSnapshot}
              >
                {t('channel.edit.billing.confirm_manual_snapshot')}
              </AppButton>
            </AppFormActions>
          }
        >
          {renderManualSnapshotForm()}
        </AppModal>
        <AppModal
          size='small'
          open={costModalOpen}
          onClose={closeCostModal}
          title={t('channel.edit.billing.procurement_edit_cost')}
          footer={
            <AppFormActions>
              <AppButton
                type='button'
                disabled={billingSubmitting}
                onClick={closeCostModal}
              >
                {t('common.cancel')}
              </AppButton>
              <AppButton
                type='button'
                color='blue'
                loading={billingSubmitting}
                disabled={billingReadonly || billingSubmitting}
                onClick={submitProcurementBatchCost}
              >
                {t('common.save')}
              </AppButton>
            </AppFormActions>
          }
        >
          {renderProcurementCostForm()}
        </AppModal>
        <AppModal
          size='large'
          open={consumptionModalOpen}
          onClose={closeConsumptionModal}
          title={t('channel.edit.billing.procurement_consumptions_title', {
            batch:
              viewingProcurementBatch?.source_ref ||
              viewingProcurementBatch?.id ||
              '-',
          })}
        >
          <AppTable
            className='router-detail-table'
            pagination={false}
            loading={consumptionLoading}
            dataSource={consumptionRows}
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
                  `${formatNumberText(value, 6)} ${
                    row?.capacity_unit || ''
                  }`.trim(),
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
                title: t(
                  'channel.edit.billing.procurement_consumption_table.cost'
                ),
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
        {billingError && (
          <div className='router-error-text router-error-text-top'>
            {billingError}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelProcurementView;
