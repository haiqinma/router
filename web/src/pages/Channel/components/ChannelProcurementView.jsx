import React, { useMemo, useState } from 'react';
import { showInfo } from '../../../helpers';
import {
  AppButton,
  AppFormActions,
  AppModal,
} from '../../../router-ui';
import ManualSnapshotForm from './ManualSnapshotForm';
import SnapshotRecordsTable from './SnapshotRecordsTable';
import {
  applyPurchaseKindToItem,
  availableSubscriptionQuotaTypes,
  buildAutomaticPurchaseRecordName,
  buildManualPurchaseRecord,
  buildManualPurchaseRecordFromSnapshot,
  buildManualQuotaItem,
  buildManualQuotaItemFromSnapshotItem,
  buildUpgradeQuotaItemsFromSnapshot,
  isSubscriptionPurchaseRecord,
  normalizeManualValidityInput,
  recordUsesAdvanced,
  resolvePurchaseRecordValidFrom,
  resolveManualItemAmounts,
  toDateTimeLocalValueFromTimestamp,
  toUnixTimestamp,
} from './channelBilling.helpers';

// Per-channel procurement event workspace. Internal batches stay behind the
// accounting APIs and never appear in the operator-facing purchase ledger.
const ChannelProcurementView = ({
  t,
  billingLoading,
  billingSnapshots,
  procurementPage = 1,
  procurementPageSize = 20,
  procurementTotal = 0,
  onProcurementPageChange,
  billingReadonly,
  billingSubmitting,
  onRefreshBilling,
  onManualSnapshotUpdate,
  onManualSnapshotDelete,
  timestamp2string,
  billingError,
  channelID,
  manualChannelOptions = [],
  requireManualChannelSelect = false,
}) => {
  const [manualPurchaseRecord, setManualPurchaseRecord] = useState(
    buildManualPurchaseRecord()
  );
  const [manualMessage, setManualMessage] = useState('');
  const [manualItems, setManualItems] = useState([buildManualQuotaItem()]);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editingPurchaseRecord, setEditingPurchaseRecord] = useState(null);
  const [manualValidityTouched, setManualValidityTouched] = useState({
    valid_from_input: false,
    valid_until_input: false,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const purchaseRecords = useMemo(
    () => (Array.isArray(billingSnapshots) ? billingSnapshots : []),
    [billingSnapshots]
  );
  const parentPurchaseRecords = purchaseRecords.filter(
    (item) =>
      item?.id &&
      item.id !== editingPurchaseRecord?.id &&
      isSubscriptionPurchaseRecord(item)
  );
  const parentPurchaseOptions = parentPurchaseRecords.map((item) => ({
    value: item.id,
    label: `${item.entitlement_name || item.id} ${
      item.purchase_at ? timestamp2string(item.purchase_at) : ''
    }`.trim(),
  }));

  const appendManualItem = () => {
    setManualItems((prev) => {
      if (manualPurchaseRecord.purchase_kind !== 'subscription') {
        return prev;
      }
      const [quotaType] = availableSubscriptionQuotaTypes(prev);
      if (!quotaType) {
        return prev;
      }
      return [
        ...prev,
        applyPurchaseKindToItem(
          buildManualQuotaItem(),
          'subscription',
          quotaType
        ),
      ];
    });
  };

  const removeManualItem = (index) => {
    setManualItems((prev) => {
      if (prev.length <= 1) {
        return [
          applyPurchaseKindToItem(
            buildManualQuotaItem(),
            manualPurchaseRecord.purchase_kind
          ),
        ];
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

  // 切换采购类型时同步权益模型。充值只有一条总额度;订阅默认月额度。
  const changePurchaseKind = (kind) => {
    setManualPurchaseRecord((prev) => ({
      ...prev,
      purchase_kind: kind,
      ...(kind === 'recharge'
        ? {
            event_type: 'purchase',
            parent_snapshot_id: '',
            old_batch_disposition: 'keep',
          }
        : {}),
    }));
    setManualItems((prev) => {
      const list = prev.length > 0 ? prev : [buildManualQuotaItem()];
      if (kind === 'recharge') {
        return [applyPurchaseKindToItem(list[0], 'recharge')];
      }
      return [applyPurchaseKindToItem(list[0], 'subscription')];
    });
  };

  const changeProcurementEvent = (eventType) => {
    updateManualPurchaseRecord({
      event_type: eventType,
      parent_snapshot_id: '',
      old_batch_disposition: 'keep',
      ...(eventType === 'upgrade'
        ? { valid_from_input: '', valid_until_input: '' }
        : {}),
    });
    if (eventType === 'upgrade') {
      setManualItems([
        applyPurchaseKindToItem(buildManualQuotaItem(), 'subscription'),
      ]);
    }
  };

  const changeParentPurchaseRecord = (snapshotID) => {
    const normalizedID = (snapshotID || '').toString().trim();
    const parent = parentPurchaseRecords.find(
      (item) => item.id === normalizedID
    );
    updateManualPurchaseRecord({
      parent_snapshot_id: normalizedID,
      old_batch_disposition: 'keep',
      valid_from_input: toDateTimeLocalValueFromTimestamp(
        resolvePurchaseRecordValidFrom(parent)
      ),
      valid_until_input: toDateTimeLocalValueFromTimestamp(parent?.valid_until),
    });
    if (parent) {
      setManualItems(buildUpgradeQuotaItemsFromSnapshot(parent));
    }
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
    setAdvancedOpen(false);
    setManualMessage('');
    setManualItems([
      applyPurchaseKindToItem(
        buildManualQuotaItem(),
        buildManualPurchaseRecord().purchase_kind
      ),
    ]);
    setManualModalOpen(true);
  };

  const openEditManualModal = (row) => {
    setEditingPurchaseRecord(row);
    const nextRecord = {
      ...buildManualPurchaseRecordFromSnapshot(row),
      channel_id: (row?.channel_id || channelID || '').toString().trim(),
    };
    setManualPurchaseRecord(nextRecord);
    setManualValidityTouched({
      valid_from_input: true,
      valid_until_input: true,
    });
    setManualMessage((row?.message || '').toString());
    const items = Array.isArray(row?.items) ? row.items : [];
    const nextItems =
      items.length > 0
        ? items.map((item) => buildManualQuotaItemFromSnapshotItem(item))
        : [
            applyPurchaseKindToItem(
              buildManualQuotaItem(),
              nextRecord.purchase_kind
            ),
          ];
    setManualItems(nextItems);
    setAdvancedOpen(
      recordUsesAdvanced(nextRecord, nextItems) ||
        Boolean((row?.message || '').toString().trim())
    );
    setManualModalOpen(true);
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
    const purchaseFXRate =
      purchaseCurrency === 'CNY'
        ? 1
        : Number(manualPurchaseRecord.purchase_fx_rate || 0);
    const purchaseCostAmount =
      purchaseCurrency === 'CNY'
        ? purchaseAmount
        : Number(manualPurchaseRecord.purchase_cost_amount || 0);
    const trimmedName = (manualPurchaseRecord.entitlement_name || '')
      .toString()
      .trim();
    const entitlementName =
      (editingPurchaseRecord?.id ? trimmedName : '') ||
      buildAutomaticPurchaseRecordName(manualPurchaseRecord, t);
    const saved = await onManualSnapshotUpdate({
      channel_id: targetChannelID,
      id: editingPurchaseRecord?.id || '',
      purchase_at: toUnixTimestamp(manualPurchaseRecord.purchase_at_input),
      purchase_currency: purchaseCurrency,
      purchase_amount: purchaseAmount,
      purchase_fx_rate: purchaseFXRate,
      purchase_cost_amount: purchaseCostAmount,
      entitlement_name: entitlementName,
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

  return (
    <div className='router-billing-page'>
      <SnapshotRecordsTable
        t={t}
        purchaseRecords={purchaseRecords}
        billingLoading={billingLoading}
        billingReadonly={billingReadonly}
        billingSubmitting={billingSubmitting}
        timestamp2string={timestamp2string}
        pagination={{
          current: procurementPage,
          pageSize: procurementPageSize,
          total: procurementTotal,
          showSizeChanger: false,
          onChange: onProcurementPageChange,
        }}
        actions={
          <>
            <AppButton
              type='button'
              className='router-page-button'
              color='blue'
              disabled={billingReadonly || billingSubmitting}
              onClick={openCreateManualModal}
            >
              {t('channel.edit.billing.add_purchase_record')}
            </AppButton>
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
          </>
        }
        onEditRecord={openEditManualModal}
        onDeleteRecord={deleteManualSnapshot}
      />
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
          <ManualSnapshotForm
            t={t}
            manualPurchaseRecord={manualPurchaseRecord}
            manualItems={manualItems}
            manualMessage={manualMessage}
            editingPurchaseRecord={editingPurchaseRecord}
            parentPurchaseOptions={parentPurchaseOptions}
            manualChannelOptions={manualChannelOptions}
            requireManualChannelSelect={requireManualChannelSelect}
            advancedOpen={advancedOpen}
            billingReadonly={billingReadonly}
            billingSubmitting={billingSubmitting}
            onChangePurchaseKind={changePurchaseKind}
            onChangeProcurementEvent={changeProcurementEvent}
            onChangeParentPurchaseRecord={changeParentPurchaseRecord}
            onToggleAdvanced={() => setAdvancedOpen((prev) => !prev)}
            onUpdateManualPurchaseRecord={updateManualPurchaseRecord}
            onUpdateManualValidityInput={updateManualValidityInput}
            onAppendManualItem={appendManualItem}
            onRemoveManualItem={removeManualItem}
            onUpdateManualItem={updateManualItem}
            onManualMessageChange={setManualMessage}
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
