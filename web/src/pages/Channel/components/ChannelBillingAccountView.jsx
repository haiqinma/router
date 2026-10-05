import React from 'react';
import { AppButton, AppDetailSection } from '../../../router-ui';
import QuotaTable from './QuotaTable';

// Account quota view for the channel overview tab: shows the channel's effective
// entitlement quotas plus a shortcut to the per-channel procurement workspace.
// Pure presentational — all data/handlers come from props.
const ChannelBillingAccountView = ({
  t,
  billingSummary,
  billingLoading,
  billingError,
  billingSubmitting,
  onRefreshBilling,
  onViewProcurement,
  timestamp2string,
}) => {
  const quotaItems = Array.isArray(billingSummary?.quota_items)
    ? billingSummary.quota_items
    : [];

  return (
    <div className='router-billing-page'>
      <AppDetailSection
        title={t('channel.edit.billing.current_quotas_title')}
        titleTag='span'
        headerEnd={
          <div className='router-billing-quota-status-actions'>
            {typeof onViewProcurement === 'function' ? (
              <AppButton
                type='button'
                className='router-inline-button'
                onClick={onViewProcurement}
              >
                {t('channel.edit.billing.view_procurement')}
              </AppButton>
            ) : null}
            <span className='router-billing-snapshot-time'>
              {billingSummary?.latest_snapshot_at
                ? timestamp2string(billingSummary.latest_snapshot_at)
                : '-'}
            </span>
            {billingSummary?.refresh_supported ? (
              <AppButton
                type='button'
                className='router-page-button'
                color='blue'
                loading={billingSubmitting}
                disabled={billingSubmitting}
                onClick={onRefreshBilling}
              >
                {t('channel.edit.billing.refresh_now')}
              </AppButton>
            ) : null}
          </div>
        }
      >
        <QuotaTable
          t={t}
          quotaItems={quotaItems}
          billingLoading={billingLoading}
          timestamp2string={timestamp2string}
        />
      </AppDetailSection>
      {billingError && (
        <div className='router-error-text router-error-text-top'>
          {billingError}
        </div>
      )}
    </div>
  );
};

export default ChannelBillingAccountView;
