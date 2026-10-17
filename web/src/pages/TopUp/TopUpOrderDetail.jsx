import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import TopUpWorkspaceProvider from './provider.jsx';
import CopyButton from '../../components/CopyButton';
import { formatPaymentAmount } from '../../helpers/render';
import {
  buildTopUpOrderReturnURL,
  buildTopUpReturnURL,
  formatTopupBusinessType,
  formatTopupOrderStatusHint,
  renderTopupOrderStatus,
  useTopUpWorkspace,
} from './shared.jsx';
import {
  AppButton,
  AppDetailSection,
  AppDescriptions,
  AppFilterHeader,
  AppModal,
  AppSkeleton,
  AppTooltip,
} from '../../router-ui';

const resolveRecordKeyFromBusinessType = (businessType = '') => {
  return String(businessType || '').trim() === 'package_purchase'
    ? 'package'
    : 'topup';
};

const normalizeRecordKey = (value = '') => {
  const normalized = String(value || '').trim();
  if (normalized === 'package' || normalized === 'gift') {
    return normalized;
  }
  return 'topup';
};

const SYNCABLE_TOPUP_ORDER_STATUSES = new Set(['created', 'pending', 'paid']);
const TOPUP_ORDER_POLL_INTERVAL_MS = 5000;
const TOPUP_ORDER_POLL_TIMEOUT_MS = 180000;

const TopUpOrderDetailInner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { renderDisplayAmount, createTopupOrder } = useTopUpWorkspace();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [repayModalOpen, setRepayModalOpen] = useState(false);
  const [repaying, setRepaying] = useState(false);
  const pollTimerRef = useRef(null);
  const pollDeadlineRef = useRef(0);
  const orderRef = useRef(null);
  const refreshOrderStatusRef = useRef(null);

  const loadDetail = useCallback(async () => {
    const normalizedOrderID = String(id || '').trim();
    if (normalizedOrderID === '') {
      return;
    }
    setLoading(true);
    try {
      const res = await API.get(
        `/api/v1/public/user/topup/orders/${encodeURIComponent(normalizedOrderID)}`,
      );
      const { success, message, data } = res?.data || {};
      if (!success) {
        showError(message || t('topup.external_topup.request_failed'));
        return;
      }
      setOrder(data || null);
    } catch (error) {
      showError(error?.message || t('topup.external_topup.request_failed'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    loadDetail().then();
  }, [loadDetail]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // Auto-poll payment status for syncable orders while the detail page is open.
  // Stops on terminal status or when the timeout elapses; cleans up on unmount.
  useEffect(() => {
    const orderStatus = String(order?.status || '').trim();
    if (!order?.id || !SYNCABLE_TOPUP_ORDER_STATUSES.has(orderStatus)) {
      return undefined;
    }
    pollDeadlineRef.current = Date.now() + TOPUP_ORDER_POLL_TIMEOUT_MS;

    const tick = () => {
      const current = String(orderRef.current?.status || '').trim();
      if (!SYNCABLE_TOPUP_ORDER_STATUSES.has(current)) {
        return;
      }
      if (Date.now() > pollDeadlineRef.current) {
        return;
      }
      refreshOrderStatusRef.current?.();
    };

    pollTimerRef.current = window.setInterval(tick, TOPUP_ORDER_POLL_INTERVAL_MS);

    const onFocus = () => {
      const current = String(orderRef.current?.status || '').trim();
      if (SYNCABLE_TOPUP_ORDER_STATUSES.has(current)) {
        refreshOrderStatusRef.current?.();
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
    };
  }, [order?.id, order?.status]);

  const recordKey = useMemo(() => {
    const stateRecordKey = normalizeRecordKey(location.state?.recordKey || '');
    if (location.state?.recordKey) {
      return stateRecordKey;
    }
    return resolveRecordKeyFromBusinessType(order?.business_type || '');
  }, [location.state?.recordKey, order?.business_type]);

  const listPath = useMemo(() => {
    const from = String(location.state?.from || '').trim();
    if (from.startsWith('/workspace/topup')) {
      return from;
    }
    return '/workspace/service/pricing?tab=records';
  }, [location.state?.from]);

  const refreshOrderStatus = useCallback(async () => {
    const normalizedOrderID = String(order?.id || '').trim();
    if (normalizedOrderID === '') {
      return null;
    }
    setRefreshing(true);
    try {
      const res = await API.post(
        `/api/v1/public/user/topup/orders/${encodeURIComponent(normalizedOrderID)}/refresh`,
      );
      const { success, message, data } = res?.data || {};
      if (!success) {
        showError(message || t('topup.external_topup.request_failed'));
        return null;
      }
      setOrder(data || null);
      return data || null;
    } catch (error) {
      showError(error?.message || t('topup.external_topup.request_failed'));
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [order?.id, t]);

  useEffect(() => {
    refreshOrderStatusRef.current = refreshOrderStatus;
  }, [refreshOrderStatus]);

  const continuePay = useCallback(async () => {
    const refreshed = await refreshOrderStatus();
    const targetOrder = refreshed || order;
    if (!targetOrder) {
      return;
    }
    if (['paid', 'fulfilled'].includes(String(targetOrder.status || '').trim())) {
      showSuccess(t('topup.records.order_paid'));
      return;
    }
    const redirectURL = String(targetOrder.redirect_url || '').trim();
    if (redirectURL === '') {
      showError(t('topup.records.redirect_missing'));
      return;
    }
    const popup = window.open(redirectURL, '_blank');
    if (!popup) {
      showError(t('topup.external_topup.popup_blocked'));
    }
  }, [order, refreshOrderStatus, t]);

  const cancelPay = useCallback(async () => {
    const normalizedOrderID = String(order?.id || '').trim();
    if (normalizedOrderID === '') {
      return;
    }
    setCanceling(true);
    try {
      const res = await API.post(
        `/api/v1/public/user/topup/orders/${encodeURIComponent(normalizedOrderID)}/cancel`,
      );
      const { success, message, data } = res?.data || {};
      if (!success) {
        showError(message || t('topup.external_topup.request_failed'));
        return;
      }
      setOrder(data || null);
      showSuccess(t('topup.records.order_canceled'));
    } catch (error) {
      showError(error?.message || t('topup.external_topup.request_failed'));
    } finally {
      setCanceling(false);
    }
  }, [order?.id, t]);

  const statusHint = useMemo(
    () => formatTopupOrderStatusHint(order?.status, t),
    [order?.status, t],
  );

  // 终态(失败/取消)订单不可复用,重试 = 用原参数新建订单并重新拉起支付。
  const canRepay = ['failed', 'canceled'].includes(
    String(order?.status || '').trim(),
  );
  const repayPayload = useMemo(() => {
    const businessType = String(order?.business_type || '').trim();
    if (businessType === 'package_purchase') {
      const packageID = String(order?.package_id || '').trim();
      if (!packageID) {
        return null;
      }
      return {
        business_type: 'package_purchase',
        operation_type: String(order?.operation_type || '').trim(),
        package_id: packageID,
      };
    }
    const planID = String(order?.topup_plan_id || '').trim();
    if (!planID) {
      return null;
    }
    return {
      business_type: 'balance_topup',
      plan_id: planID,
    };
  }, [
    order?.business_type,
    order?.operation_type,
    order?.package_id,
    order?.topup_plan_id,
  ]);

  const handleRepay = useCallback(async () => {
    // 老数据缺少 plan_id/package_id 时无法原样重下,降级引导回定价页。
    if (!repayPayload) {
      setRepayModalOpen(false);
      navigate('/workspace/service/pricing');
      return;
    }
    setRepaying(true);
    try {
      const created = await createTopupOrder({
        ...repayPayload,
        return_url: buildTopUpReturnURL(),
      });
      if (created && typeof created === 'object' && created.id) {
        const status = String(created.status || '').trim();
        // 未即时到账时,当前标签跳到新订单的承接页轮询(弹窗已在拉起支付)。
        if (status !== 'paid' && status !== 'fulfilled') {
          navigate(buildTopUpOrderReturnURL(created.id));
        }
      }
    } finally {
      setRepaying(false);
      setRepayModalOpen(false);
    }
  }, [createTopupOrder, navigate, repayPayload]);

  const canSyncPaymentStatus = SYNCABLE_TOPUP_ORDER_STATUSES.has(
    String(order?.status || '').trim(),
  );

  const detailTitle =
    recordKey === 'package'
      ? t('topup.external_topup_orders.detail_title_package')
      : t('topup.external_topup_orders.detail_title_topup');

  const detailPathLabel =
    recordKey === 'package'
      ? t('topup.external_topup_orders.detail_path_package')
      : t('topup.external_topup_orders.detail_path_topup');

  const detailPathOrderID = String(order?.id || id || '').trim() || '-';
  const detailRows = useMemo(() => {
    const rows = [
      {
        key: 'order_id',
        label: t('topup.external_topup_orders.columns.order_id'),
        value: order?.id ? (
          <div className='router-action-group-tight'>
            <span>{order.id}</span>
            <CopyButton value={order.id} size='small' basic iconOnly />
          </div>
        ) : (
          '-'
        ),
      },
      {
        key: 'business_type',
        label: t('topup.external_topup_orders.columns.business_type'),
        value: formatTopupBusinessType(order?.business_type, t),
      },
      {
        key: 'status',
        label: t('topup.external_topup_orders.columns.status'),
        value: (
          <div className='router-action-group-tight'>
            {statusHint ? (
              <AppTooltip title={statusHint}>
                <span className='router-help-trigger'>
                  {renderTopupOrderStatus(order?.status, t)}
                </span>
              </AppTooltip>
            ) : (
              renderTopupOrderStatus(order?.status, t)
            )}
            {canSyncPaymentStatus ? (
              <AppButton
                className='router-inline-button'
                onClick={refreshOrderStatus}
                loading={refreshing}
                disabled={!order || refreshing}
              >
                {t('topup.records.refresh_status')}
              </AppButton>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status_message',
        label: t('topup.external_topup_orders.fields.status_message'),
        value: order?.status_message || '-',
      },
      {
        key: 'amount',
        label:
          Number(order?.amount || 0) > 0 && Number(order?.quota || 0) > 0
            ? t('topup.external_topup_orders.fields.paid_amount')
            : t('topup.external_topup_orders.columns.amount'),
        value:
          Number(order?.amount || 0) > 0
            ? formatPaymentAmount(order?.amount, order?.currency)
            : Number(order?.quota || 0) > 0
              ? renderDisplayAmount(order?.quota)
              : '-',
      },
      ...(Number(order?.amount || 0) > 0 && Number(order?.quota || 0) > 0
        ? [
            {
              key: 'credited_quota',
              label: t('topup.external_topup_orders.fields.credited_quota'),
              value: renderDisplayAmount(order?.quota),
            },
            {
              key: 'amount_quota_note',
              span: { xs: 1, sm: 1, md: 2, lg: 2, xl: 2 },
              label: '',
              value: (
                <span className='router-text-muted'>
                  {t('topup.external_topup_orders.fields.amount_quota_note')}
                </span>
              ),
            },
          ]
        : []),
      {
        key: 'title',
        label: t('topup.external_topup_orders.fields.title'),
        value: order?.title || '-',
      },
      {
        key: 'transaction_id',
        label: t('topup.external_topup_orders.columns.transaction_id'),
        value: order?.transaction_id || '-',
      },
      {
        key: 'provider_order_id',
        label: t('topup.external_topup_orders.fields.provider_order_id'),
        value: order?.provider_order_id || '-',
      },
      {
        key: 'created_at',
        label: t('topup.external_topup_orders.columns.time'),
        value: order?.created_at ? timestamp2string(order?.created_at) : '-',
      },
      {
        key: 'updated_at',
        label: t('topup.external_topup_orders.fields.updated_at'),
        value: order?.updated_at ? timestamp2string(order?.updated_at) : '-',
      },
    ];
    if (recordKey === 'package') {
      rows.splice(2, 0, {
        key: 'package_name',
        label: t('topup.external_topup_orders.columns.package_name'),
        value: order?.package_name || '-',
      });
    }
    return rows;
  }, [order, recordKey, renderDisplayAmount, statusHint, t]);

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'mine', label: t('header.mine') },
          {
            key: 'quota',
            label: t('topup.mine.quota'),
            onClick: () => navigate('/workspace/topup?tab=quota'),
          },
          {
            key: 'topup-order-list',
            label: detailPathLabel,
            onClick: () => navigate(listPath),
          },
          {
            key: 'topup-order-current',
            label: detailPathOrderID,
            active: true,
          },
        ]}
        title={detailTitle}
        actions={
          <>
          {['created', 'pending'].includes(String(order?.status || '').trim()) ? (
            <>
              <AppButton
                color='blue'
                className='router-section-button'
                onClick={continuePay}
                loading={refreshing}
                disabled={!order}
              >
                {t('topup.records.continue_pay')}
              </AppButton>
              <AppButton
                className='router-section-button'
                onClick={cancelPay}
                loading={canceling}
                disabled={!order}
              >
                {t('topup.records.cancel_pay')}
              </AppButton>
            </>
          ) : null}
          {canRepay ? (
            <AppButton
              color='blue'
              className='router-section-button'
              onClick={() => setRepayModalOpen(true)}
              disabled={!order}
            >
              {t('topup.records.repay')}
            </AppButton>
          ) : null}
          </>
        }
      />
      <div className='router-entity-detail-page'>
        <AppDetailSection title={t('common.basic_info')}>
            {loading ? (
              <AppSkeleton variant='text' rows={5} />
            ) : (
              <AppDescriptions items={detailRows} />
            )}
        </AppDetailSection>
      </div>
      <AppModal
        size='small'
        open={repayModalOpen}
        onClose={() => setRepayModalOpen(false)}
        title={t('topup.records.repay_confirm_title')}
        footer={[
          <AppButton
            key='cancel'
            className='router-modal-button'
            basic
            onClick={() => setRepayModalOpen(false)}
          >
            {t('common.cancel')}
          </AppButton>,
          <AppButton
            key='ok'
            className='router-modal-button'
            color='blue'
            loading={repaying}
            onClick={handleRepay}
          >
            {t('topup.records.repay')}
          </AppButton>,
        ]}
      >
        <div className='router-modal-text'>
          {t('topup.records.repay_confirm_body')}
        </div>
      </AppModal>
    </div>
  );
};

const TopUpOrderDetail = () => {
  return (
    <TopUpWorkspaceProvider>
      <TopUpOrderDetailInner />
    </TopUpWorkspaceProvider>
  );
};

export default TopUpOrderDetail;
