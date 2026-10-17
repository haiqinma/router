import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';
import { AppFilterHeader, AppSelect, AppSpin } from '../../../router-ui';
import CostQuoteReconcileTable from '../../Channel/components/CostQuoteReconcileTable';

const emptyQuotes = { service_available: false, reason: '', rows: [] };

const BillingReconciliationPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const initialChannelID = useMemo(
    () => new URLSearchParams(location.search).get('channel_id') || '',
    []
  );
  const [channelID, setChannelID] = useState(initialChannelID);
  const [channelOptions, setChannelOptions] = useState([]);
  const [costQuotes, setCostQuotes] = useState(emptyQuotes);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    API.get('/api/v1/admin/channels/', {
      params: { page: 1, page_size: 500, compact: true },
    })
      .then((response) => {
        if (!response.data?.success) return;
        const items = Array.isArray(response.data?.data?.items)
          ? response.data.data.items
          : [];
        setChannelOptions(
          items.map((item) => ({
            key: item.id,
            value: String(item.id),
            text: item.name || String(item.id),
          }))
        );
      })
      .catch((error) => showError(error?.message || t('common.load_failed')));
  }, [t]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set('tab', 'reconciliation');
    if (channelID) params.set('channel_id', channelID);
    else params.delete('channel_id');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, {
      replace: true,
    });
  }, [channelID, location.pathname, navigate]);

  const loadQuotes = useCallback(async () => {
    if (!channelID) {
      setCostQuotes(emptyQuotes);
      return;
    }
    setLoading(true);
    try {
      const response = await API.get(
        `/api/v1/admin/channel/${encodeURIComponent(channelID)}/billing/cost-quotes`
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message);
      }
      setCostQuotes(response.data?.data || emptyQuotes);
    } catch (error) {
      setCostQuotes(emptyQuotes);
      showError(error?.message || t('billing.reconciliation.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [channelID, t]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  const syncQuotes = useCallback(async () => {
    if (!channelID) return;
    setSyncing(true);
    try {
      const response = await API.post(
        `/api/v1/admin/channel/${encodeURIComponent(channelID)}/billing/cost-quotes/sync`
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message);
      }
      const result = response.data?.data || {};
      showSuccess(
        t('channel.edit.billing.cost_reconcile_sync_done', {
          cached: Number(result.cached || 0),
          skipped: Number(result.skipped || 0),
        })
      );
      await loadQuotes();
    } catch (error) {
      showError(error?.message || t('billing.reconciliation.sync_failed'));
    } finally {
      setSyncing(false);
    }
  }, [channelID, loadQuotes, t]);

  return (
    <div className='billing-reconciliation-page'>
      <AppFilterHeader
        query={
          <div className='billing-reconciliation-filters'>
            <AppSelect
              className='billing-reconciliation-channel-select'
              search
              clearable
              placeholder={t('billing.reconciliation.channel_placeholder')}
              options={channelOptions}
              value={channelID}
              onChange={(event, data) => setChannelID(data?.value || '')}
            />
            {channelID ? (
              <Link
                className='billing-reconciliation-purchase-link'
                to={`/admin/channel/detail/${encodeURIComponent(channelID)}?tab=procurement`}
              >
                {t('billing.reconciliation.view_purchases')}
              </Link>
            ) : null}
          </div>
        }
      />
      <AppSpin spinning={loading}>
        <CostQuoteReconcileTable
          t={t}
          costQuotes={
            channelID
              ? costQuotes
              : {
                  ...emptyQuotes,
                  reason: t('billing.reconciliation.select_channel'),
                }
          }
          onSyncCostQuotes={syncQuotes}
          syncSubmitting={syncing}
        />
      </AppSpin>
    </div>
  );
};

export default BillingReconciliationPage;
