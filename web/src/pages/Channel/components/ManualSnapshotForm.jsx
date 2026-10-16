import React from 'react';
import UnitDropdown from '../../../components/UnitDropdown';
import {
  AppAlert,
  AppButton,
  AppCompact,
  AppField,
  AppFormRow,
  AppIcon,
  AppInput,
  AppInputNumber,
  AppSegmented,
  AppSelect,
  AppTooltip,
} from '../../../router-ui';
import {
  availableSubscriptionQuotaTypes,
  ensureUnitOption,
  isPurchaseCurrencyCNY,
  MANUAL_CURRENCY_OPTIONS,
  PROCUREMENT_CURRENCY_OPTIONS,
  PURCHASE_KINDS,
  SUBSCRIPTION_QUOTA_TYPES,
} from './channelBilling.helpers';

const ManualSnapshotForm = ({
  t,
  manualPurchaseRecord,
  manualItems,
  manualMessage,
  editingPurchaseRecord,
  parentPurchaseOptions,
  manualChannelOptions,
  requireManualChannelSelect,
  advancedOpen,
  billingReadonly,
  billingSubmitting,
  onChangePurchaseKind,
  onChangeProcurementEvent,
  onChangeParentPurchaseRecord,
  onToggleAdvanced,
  onUpdateManualPurchaseRecord,
  onUpdateManualValidityInput,
  onAppendManualItem,
  onRemoveManualItem,
  onUpdateManualItem,
  onManualMessageChange,
}) => {
  const purchaseKind = manualPurchaseRecord.purchase_kind || PURCHASE_KINDS[0];
  const eventType = manualPurchaseRecord.event_type || 'purchase';
  const isSubscription = purchaseKind === 'subscription';
  const isUpgrade = isSubscription && eventType === 'upgrade';
  const isEditing = Boolean(editingPurchaseRecord?.id);
  const inputReadOnly = billingReadonly || billingSubmitting;
  const firstItem = manualItems[0] || {};
  const addableQuotaTypes = availableSubscriptionQuotaTypes(manualItems);
  const showLegacyRechargeValidity =
    !isSubscription &&
    Boolean(
      manualPurchaseRecord.valid_from_input ||
        manualPurchaseRecord.valid_until_input
    );

  const formatValidityValue = (value, fallbackKey) => {
    const normalized = (value || '').toString().trim();
    return normalized
      ? normalized.replace('T', ' ')
      : t(`channel.edit.billing.${fallbackKey}`);
  };

  const renderValidityFields = () => (
    <>
      <AppField label={t('channel.edit.billing.manual_valid_from')}>
        <AppInput
          className='router-section-input'
          type='datetime-local'
          step={1}
          value={manualPurchaseRecord.valid_from_input}
          onChange={(e, { value }) =>
            onUpdateManualValidityInput('valid_from_input', value, '00:00:00')
          }
          readOnly={inputReadOnly}
        />
      </AppField>
      <AppField label={t('channel.edit.billing.manual_valid_until')}>
        <AppInput
          className='router-section-input'
          type='datetime-local'
          step={1}
          value={manualPurchaseRecord.valid_until_input}
          onChange={(e, { value }) =>
            onUpdateManualValidityInput('valid_until_input', value, '00:00:00')
          }
          readOnly={inputReadOnly}
        />
      </AppField>
    </>
  );

  const renderAmountInput = (item, index, label) => (
    <AppField label={label} required>
      <AppCompact className='router-section-input-with-unit' block>
        <AppInputNumber
          className='router-section-input router-section-input-with-unit-field'
          fluid
          value={item.limit_amount}
          min={0}
          onChange={(e, { value }) =>
            onUpdateManualItem(index, { limit_amount: value })
          }
          disabled={inputReadOnly}
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
              currency: (value || 'USD').toString().trim().toUpperCase(),
            })
          }
          disabled={inputReadOnly}
          aria-label={t('channel.edit.billing.currency')}
        />
      </AppCompact>
    </AppField>
  );

  return (
    <div className='router-purchase-form'>
      <div className='router-purchase-intent-grid'>
        <AppField label={t('channel.edit.billing.purchase_kind')} required>
          <AppSegmented
            block
            options={PURCHASE_KINDS.map((value) => ({
              value,
              label: t(`channel.edit.billing.purchase_kinds.${value}`),
            }))}
            value={purchaseKind}
            onChange={(e, { value }) => onChangePurchaseKind(value)}
            disabled={inputReadOnly || isEditing}
          />
        </AppField>
        {isSubscription ? (
          <AppField label={t('channel.edit.billing.purchase_action')} required>
            <AppSegmented
              block
              options={[
                {
                  value: 'purchase',
                  label: t('channel.edit.billing.procurement_events.purchase'),
                },
                {
                  value: 'renewal',
                  label: t('channel.edit.billing.procurement_events.renewal'),
                },
                {
                  value: 'upgrade',
                  label: t('channel.edit.billing.procurement_events.upgrade'),
                },
                {
                  value: 'quota_adjustment',
                  label: t(
                    'channel.edit.billing.procurement_events.quota_adjustment'
                  ),
                },
              ]}
              value={eventType}
              onChange={(e, { value }) => onChangeProcurementEvent(value)}
              disabled={inputReadOnly || isEditing}
            />
          </AppField>
        ) : null}
      </div>

      {isUpgrade ? (
        <div className='router-purchase-upgrade-context'>
          <AppField
            label={t('channel.edit.billing.procurement_parent_record')}
            required
          >
            <AppSelect
              className='router-section-input'
              search
              options={parentPurchaseOptions}
              value={manualPurchaseRecord.parent_snapshot_id}
              placeholder={t(
                'channel.edit.billing.procurement_parent_record_placeholder'
              )}
              onChange={(e, { value }) => onChangeParentPurchaseRecord(value)}
              disabled={inputReadOnly || isEditing}
            />
          </AppField>
          <AppAlert
            type='info'
            showIcon
            className='router-section-message'
            title={t('channel.edit.billing.upgrade_rule_hint')}
          />
        </div>
      ) : null}

      <section className='router-purchase-form-section'>
        <div className='router-purchase-form-section-head'>
          <h3>{t('channel.edit.billing.manual_purchase_title')}</h3>
        </div>
        <AppFormRow>
          {requireManualChannelSelect ? (
            <AppField label={t('channel.edit.billing.manual_channel')} required>
              <AppSelect
                className='router-section-input'
                search
                options={manualChannelOptions}
                value={manualPurchaseRecord.channel_id}
                placeholder={t(
                  'channel.edit.billing.manual_channel_placeholder'
                )}
                onChange={(e, { value }) =>
                  onUpdateManualPurchaseRecord({
                    channel_id: (value || '').toString().trim(),
                  })
                }
                disabled={inputReadOnly || isEditing}
              />
            </AppField>
          ) : null}
          <AppField
            label={t('channel.edit.billing.manual_purchase_currency')}
            required
          >
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
              disabled={inputReadOnly}
            />
          </AppField>
          <AppField
            label={t('channel.edit.billing.manual_purchase_amount')}
            required
          >
            <AppInputNumber
              className='router-section-input'
              fluid
              min={0}
              value={manualPurchaseRecord.purchase_amount}
              onChange={(e, { value }) =>
                onUpdateManualPurchaseRecord({
                  purchase_amount: Number(value || 0),
                  purchase_cost_amount: isPurchaseCurrencyCNY(
                    manualPurchaseRecord
                  )
                    ? Number(value || 0)
                    : Number(value || 0) *
                      Number(manualPurchaseRecord.purchase_fx_rate || 0),
                })
              }
              disabled={inputReadOnly}
            />
          </AppField>
          {!isPurchaseCurrencyCNY(manualPurchaseRecord) ? (
            <>
              <AppField
                label={t('channel.edit.billing.manual_purchase_fx_rate')}
                required
              >
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
                  disabled={inputReadOnly}
                />
              </AppField>
              <AppField
                label={t('channel.edit.billing.manual_purchase_cost_amount')}
                required
              >
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
                  disabled={inputReadOnly}
                />
              </AppField>
            </>
          ) : null}
        </AppFormRow>
      </section>

      <section className='router-purchase-form-section'>
        <div className='router-purchase-form-section-head'>
          <h3>{t('channel.edit.billing.entitlement_info_title')}</h3>
          {isSubscription ? (
            <AppButton
              type='button'
              className='router-page-button'
              basic
              icon={<AppIcon name='plus' />}
              disabled={inputReadOnly || addableQuotaTypes.length === 0}
              onClick={onAppendManualItem}
            >
              {t('channel.edit.billing.add_entitlement_item')}
            </AppButton>
          ) : null}
        </div>

        <AppFormRow>
          <AppField label={t('channel.edit.billing.entitlement_name')}>
            <AppInput
              className='router-section-input'
              value={manualPurchaseRecord.entitlement_name}
              onChange={(e, { value }) =>
                onUpdateManualPurchaseRecord({
                  entitlement_name: (value || '').toString(),
                })
              }
              readOnly={inputReadOnly}
            />
          </AppField>
          {isSubscription && !isUpgrade ? renderValidityFields() : null}
        </AppFormRow>

        {isUpgrade ? (
          <div className='router-upgrade-validity-summary'>
            <div>
              <span>{t('channel.edit.billing.manual_valid_from')}</span>
              <strong>
                {formatValidityValue(
                  manualPurchaseRecord.valid_from_input,
                  'validity_immediate'
                )}
              </strong>
            </div>
            <div>
              <span>{t('channel.edit.billing.manual_valid_until')}</span>
              <strong>
                {formatValidityValue(
                  manualPurchaseRecord.valid_until_input,
                  'no_expire'
                )}
              </strong>
            </div>
          </div>
        ) : null}

        {!isSubscription ? (
          <div className='router-purchase-entitlement-row router-purchase-entitlement-row-recharge'>
            {renderAmountInput(
              firstItem,
              0,
              t('channel.edit.billing.manual_quota_limit_amount')
            )}
          </div>
        ) : (
          <div className='router-purchase-entitlement-list'>
            {manualItems.map((item, index) => {
              const quotaType = (item.quota_type || 'monthly')
                .toString()
                .trim()
                .toLowerCase();
              const availableTypes = availableSubscriptionQuotaTypes(
                manualItems,
                index
              );
              return (
                <div
                  key={`manual-quota-${index}`}
                  className='router-purchase-entitlement-row'
                >
                  <AppField
                    label={t('channel.edit.billing.subscription_quota_type')}
                    required
                  >
                    <AppSelect
                      className='router-section-input'
                      options={SUBSCRIPTION_QUOTA_TYPES.map((value) => ({
                        value,
                        label: t(`channel.edit.billing.quota_types.${value}`),
                        disabled:
                          value !== quotaType &&
                          !availableTypes.includes(value),
                      }))}
                      value={quotaType}
                      onChange={(e, { value }) =>
                        onUpdateManualItem(index, {
                          resource_type: 'quota',
                          quota_type: value,
                        })
                      }
                      disabled={inputReadOnly}
                    />
                  </AppField>
                  {renderAmountInput(
                    item,
                    index,
                    t(
                      isUpgrade
                        ? 'channel.edit.billing.upgrade_increment_amount'
                        : 'channel.edit.billing.manual_periodic_quota_amount'
                    )
                  )}
                  <div className='router-purchase-entitlement-remove'>
                    {manualItems.length > 1 ? (
                      <AppTooltip
                        title={t('channel.edit.billing.remove_quota_item')}
                      >
                        <AppButton
                          type='button'
                          className='router-page-button'
                          basic
                          danger
                          icon={<AppIcon name='trash' />}
                          aria-label={t(
                            'channel.edit.billing.remove_quota_item'
                          )}
                          disabled={inputReadOnly}
                          onClick={() => onRemoveManualItem(index)}
                        />
                      </AppTooltip>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className='router-purchase-advanced-toggle'>
        <AppButton
          type='button'
          className='router-page-button'
          basic
          icon={
            <AppIcon
              name='right chevron'
              className={advancedOpen ? 'router-icon-rotate-90' : ''}
            />
          }
          onClick={onToggleAdvanced}
        >
          {t('channel.edit.billing.advanced_options')}
        </AppButton>
      </div>

      {advancedOpen ? (
        <section className='router-purchase-form-section router-purchase-form-section-advanced'>
          <AppFormRow>
            <AppField
              label={t('channel.edit.billing.manual_purchase_at')}
              required
            >
              <AppInput
                className='router-section-input'
                type='datetime-local'
                value={manualPurchaseRecord.purchase_at_input}
                onChange={(e, { value }) =>
                  onUpdateManualPurchaseRecord({
                    purchase_at_input: (value || '').toString(),
                  })
                }
                readOnly={inputReadOnly}
              />
            </AppField>
            <AppField label={t('channel.edit.billing.message')}>
              <AppInput
                className='router-section-input'
                value={manualMessage}
                onChange={(e, { value }) =>
                  onManualMessageChange((value || '').toString())
                }
                readOnly={inputReadOnly}
              />
            </AppField>
            {showLegacyRechargeValidity ? renderValidityFields() : null}
          </AppFormRow>
        </section>
      ) : null}
    </div>
  );
};

export default ManualSnapshotForm;
