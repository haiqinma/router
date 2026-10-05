import React from 'react';
import {
  AppAlert,
  AppField,
  AppFormRow,
  AppInput,
  AppInputNumber,
  AppSelect,
} from '../../../router-ui';
import {
  ensureUnitOption,
  procurementScopeOptions,
  PROCUREMENT_CURRENCY_OPTIONS,
} from './channelBilling.helpers';

// Editable cost/scope form for a single procurement batch. Pure presentational —
// the draft and its updater come from props.
const ProcurementCostForm = ({
  t,
  costDraft,
  onUpdateCostDraft,
  billingReadonly,
  billingSubmitting,
}) => (
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
            onUpdateCostDraft({
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
            onUpdateCostDraft({
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
            onUpdateCostDraft({
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
            onUpdateCostDraft({
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
            onUpdateCostDraft({
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
            onUpdateCostDraft({
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
            onUpdateCostDraft({
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

export default ProcurementCostForm;
