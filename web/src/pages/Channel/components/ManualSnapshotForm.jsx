import React from 'react';
import UnitDropdown from '../../../components/UnitDropdown';
import {
  AppAlert,
  AppButton,
  AppCompact,
  AppField,
  AppFormRow,
  AppInput,
  AppInputNumber,
  AppSegmented,
  AppSelect,
  AppTooltip,
} from '../../../router-ui';
import {
  ensureUnitOption,
  entitlementTypeOptions,
  entitlementTypePatch,
  entitlementTypeValue,
  isPurchaseCurrencyCNY,
  MANUAL_CURRENCY_OPTIONS,
  PROCUREMENT_CURRENCY_OPTIONS,
  resolveManualAmountLabel,
  resolveManualResourceHint,
  shouldShowManualAmountFields,
} from './channelBilling.helpers';

// Create/edit form for a manual purchase snapshot (purchase header + entitlement
// items). Pure presentational — all draft state and mutators come from props.
const ManualSnapshotForm = ({
  t,
  manualPurchaseRecord,
  manualItems,
  manualMessage,
  editingPurchaseRecord,
  parentPurchaseOptions,
  manualChannelOptions,
  requireManualChannelSelect,
  billingReadonly,
  billingSubmitting,
  onUpdateManualPurchaseRecord,
  onUpdateManualValidityInput,
  onAppendManualItem,
  onRemoveManualItem,
  onUpdateManualItem,
  onManualMessageChange,
}) => (
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
                onUpdateManualPurchaseRecord({
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
              onUpdateManualPurchaseRecord({
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
              onUpdateManualPurchaseRecord({
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
              onUpdateManualPurchaseRecord({
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
                  onUpdateManualPurchaseRecord({
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
                  onUpdateManualPurchaseRecord({
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
              onUpdateManualPurchaseRecord({ entitlement_name: (value || '').toString() })
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
              onUpdateManualValidityInput('valid_from_input', value, '00:00:00')
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
              onUpdateManualValidityInput('valid_until_input', value, '23:59:59')
            }
            readOnly={billingReadonly || billingSubmitting}
          />
        </AppField>
        {!editingPurchaseRecord ? (
          <AppField label={t('channel.edit.billing.procurement_event_type')} required>
            <AppSegmented
              options={[
                { value: 'purchase', label: t('channel.edit.billing.procurement_events.purchase') },
                { value: 'renewal', label: t('channel.edit.billing.procurement_events.renewal') },
                { value: 'upgrade', label: t('channel.edit.billing.procurement_events.upgrade') },
                { value: 'quota_adjustment', label: t('channel.edit.billing.procurement_events.quota_adjustment') },
              ]}
              value={manualPurchaseRecord.event_type}
              onChange={(e, { value }) =>
                onUpdateManualPurchaseRecord({
                  event_type: value,
                  parent_snapshot_id: value === 'upgrade' ? manualPurchaseRecord.parent_snapshot_id : '',
                  old_batch_disposition: value === 'upgrade' ? manualPurchaseRecord.old_batch_disposition : 'keep',
                })
              }
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField>
        ) : null}
      </AppFormRow>
      {!editingPurchaseRecord && manualPurchaseRecord.event_type === 'upgrade' ? (
        <AppFormRow>
          <AppField label={t('channel.edit.billing.procurement_parent_record')} required>
            <AppSelect
              className='router-section-input'
              search
              options={parentPurchaseOptions}
              value={manualPurchaseRecord.parent_snapshot_id}
              placeholder={t('channel.edit.billing.procurement_parent_record_placeholder')}
              onChange={(e, { value }) =>
                onUpdateManualPurchaseRecord({ parent_snapshot_id: (value || '').toString() })
              }
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField>
          <AppField label={t('channel.edit.billing.procurement_old_batch_disposition')} required>
            <AppSegmented
              options={[
                { value: 'keep', label: t('channel.edit.billing.procurement_old_batch_dispositions.keep') },
                { value: 'disable', label: t('channel.edit.billing.procurement_old_batch_dispositions.disable') },
              ]}
              value={manualPurchaseRecord.old_batch_disposition}
              onChange={(e, { value }) =>
                onUpdateManualPurchaseRecord({ old_batch_disposition: value })
              }
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField>
        </AppFormRow>
      ) : null}
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
        onClick={onAppendManualItem}
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
      <div key={`manual-quota-${index}`} className='router-billing-manual-item-card'>
        <div className='router-billing-manual-item-header'>
          <div className='router-billing-manual-item-title'>
            {t('channel.edit.billing.manual_item_title', { index: index + 1 })}
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
              onClick={() => onRemoveManualItem(index)}
            >
              {t('channel.edit.billing.remove_quota_item')}
            </AppButton>
          </div>
        </div>
        <AppFormRow>
          <AppField label={t('channel.edit.billing.manual_resource_type')} required>
            <AppSelect
              className='router-section-input'
              options={entitlementTypeOptions(t)}
              value={entitlementTypeValue(item)}
              onChange={(e, { value }) =>
                onUpdateManualItem(index, {
                  ...entitlementTypePatch(value),
                  quota_label: '',
                })
              }
              disabled={billingReadonly || billingSubmitting}
            />
          </AppField>
          {shouldShowManualAmountFields(item) ? (
            <>
              <AppField label={resolveManualAmountLabel(item, t)} required>
                <AppCompact className='router-section-input-with-unit' block>
                  <AppInputNumber
                    className='router-section-input router-section-input-with-unit-field'
                    fluid
                    value={item.limit_amount}
                    min={0}
                    onChange={(e, { value }) =>
                      onUpdateManualItem(index, {
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
                      onUpdateManualItem(index, {
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
          onChange={(e, { value }) => onManualMessageChange((value || '').toString())}
          readOnly={billingReadonly || billingSubmitting}
        />
      </AppField>
    </AppFormRow>
  </div>
);

export default ManualSnapshotForm;
