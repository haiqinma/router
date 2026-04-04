import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Header } from 'semantic-ui-react';
import { API, showError, showSuccess } from '../../helpers';
import { formatAmountWithUnit, renderYYC } from '../../helpers/render';
import {
  convertYYCToDisplayAmount,
  loadPublicDisplayCurrencyCatalog,
} from '../../helpers/billing';
import BalanceTopUpPage from './BalanceTopUpPage';
import PackagePurchasePage from './PackagePurchasePage';
import RedeemCodePage from './RedeemCodePage';
import TopUpRecordsPage from './TopUpRecordsPage';
import {
  TopUpWorkspaceContext,
  buildInitialDisplayCurrencyIndex,
  getStoredStatusConfig,
  normalizeTopUpRecord,
  normalizeTopUpResult,
  normalizeTopUpTab,
  resolveDisplayCurrency,
  storeDisplayCurrency,
  YYC_DISPLAY_CODE,
} from './shared.jsx';

const TopUpLayout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const rawTab = searchParams.get('tab');
  const rawRecord = searchParams.get('record');
  const initialCurrencyIndex = buildInitialDisplayCurrencyIndex();
  const [externalTopupLink, setExternalTopupLink] = useState('');
  const [userBalanceYYC, setUserBalanceYYC] = useState(0);
  const [displayCurrencyIndex, setDisplayCurrencyIndex] = useState(
    initialCurrencyIndex,
  );
  const [displayCurrency, setDisplayCurrency] = useState(
    resolveDisplayCurrency(initialCurrencyIndex),
  );
  const [loadingDisplayCurrencies, setLoadingDisplayCurrencies] =
    useState(false);

  const renderDisplayAmount = useCallback(
    (yycAmount) => {
      const normalizedAmount = Number(yycAmount || 0);
      if (!Number.isFinite(normalizedAmount)) {
        return renderYYC(0, t);
      }
      if (displayCurrency === YYC_DISPLAY_CODE) {
        return renderYYC(normalizedAmount, t);
      }
      const displayAmount = convertYYCToDisplayAmount(
        normalizedAmount,
        displayCurrency,
        displayCurrencyIndex,
      );
      if (!Number.isFinite(displayAmount)) {
        return renderYYC(normalizedAmount, t);
      }
      return formatAmountWithUnit(displayAmount, displayCurrency, 6);
    },
    [displayCurrency, displayCurrencyIndex, t],
  );

  const loadDisplayCurrencies = useCallback(async () => {
    setLoadingDisplayCurrencies(true);
    try {
      const { currencyIndex: nextIndex, defaultCurrency } =
        await loadPublicDisplayCurrencyCatalog();
      setDisplayCurrencyIndex(nextIndex);
      setDisplayCurrency((previous) => {
        const next = resolveDisplayCurrency(
          nextIndex,
          previous || defaultCurrency,
        );
        storeDisplayCurrency(next);
        return next;
      });
    } finally {
      setLoadingDisplayCurrencies(false);
    }
  }, []);

  const loadUserBalance = useCallback(async () => {
    try {
      const res = await API.get('/api/v1/public/user/self');
      const { success, message, data } = res?.data || {};
      if (success) {
        setUserBalanceYYC(Number(data?.yyc_balance ?? data?.quota ?? 0) || 0);
        return;
      }
      showError(message || t('topup.external_topup.request_failed'));
    } catch (error) {
      showError(error?.message || t('topup.external_topup.request_failed'));
    }
  }, [t]);

  useEffect(() => {
    const status = getStoredStatusConfig();
    if (status.top_up_link) {
      setExternalTopupLink(status.top_up_link);
    }
    loadUserBalance().then();
    loadDisplayCurrencies().then();
  }, [loadDisplayCurrencies, loadUserBalance]);

  useEffect(() => {
    const normalizedTab = normalizeTopUpTab(rawTab);
    const normalizedRecord = normalizeTopUpRecord(rawRecord);
    const nextSearchParams = new URLSearchParams(searchParamsString);
    let changed = false;

    if (rawTab !== normalizedTab) {
      nextSearchParams.set('tab', normalizedTab);
      changed = true;
    }
    if (normalizedTab === 'records') {
      if (rawRecord !== normalizedRecord) {
        nextSearchParams.set('record', normalizedRecord);
        changed = true;
      }
    } else if (nextSearchParams.has('record')) {
      nextSearchParams.delete('record');
      changed = true;
    }

    if (!changed) {
      return;
    }
    navigate(`/workspace/topup?${nextSearchParams.toString()}`, { replace: true });
  }, [navigate, rawRecord, rawTab, searchParamsString]);

  const createTopupOrder = useCallback(
    async (payload) => {
      if (!externalTopupLink) {
        showError(t('topup.external_topup.no_link'));
        return false;
      }
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      if (!popup) {
        showError(t('topup.external_topup.popup_blocked'));
        return false;
      }
      try {
        const res = await API.post('/api/v1/public/user/topup/orders', payload);
        const { success, message, data } = res.data || {};
        if (!success) {
          popup.close();
          showError(message || t('topup.external_topup.request_failed'));
          return false;
        }
        const redirectURL = data?.redirect_url;
        if (!redirectURL) {
          popup.close();
          showError(t('topup.external_topup.request_failed'));
          return false;
        }
        popup.location.href = redirectURL;
        popup.focus();
        return true;
      } catch (error) {
        popup.close();
        showError(error?.message || t('topup.external_topup.request_failed'));
        return false;
      }
    },
    [externalTopupLink, t],
  );

  const submitRedemption = useCallback(
    async (code) => {
      const res = await API.post('/api/v1/public/user/topup', {
        code,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('topup.redeem.request_failed'));
        return null;
      }
      const normalizedResult =
        normalizeTopUpResult(data) || {
          redeemed_yyc: Number(data ?? 0) || 0,
          before_yyc_balance: userBalanceYYC,
          after_yyc_balance: userBalanceYYC + (Number(data ?? 0) || 0),
          redemption_id: '',
          redemption_name: '',
          group_id: '',
          group_name: '',
          face_value_amount: 0,
          face_value_unit: '',
          redeemed_at: 0,
        };
      setUserBalanceYYC(normalizedResult.after_yyc_balance);
      showSuccess(t('topup.redeem.success'));
      return normalizedResult;
    },
    [t, userBalanceYYC],
  );

  const activeKey = normalizeTopUpTab(rawTab);
  const activeRecord = normalizeTopUpRecord(rawRecord);

  const contextValue = useMemo(
    () => ({
      externalTopupLink,
      userBalanceYYC,
      displayCurrency,
      displayCurrencyIndex,
      renderDisplayAmount,
      loadUserBalance,
      createTopupOrder,
      submitRedemption,
    }),
    [
      createTopupOrder,
      displayCurrency,
      displayCurrencyIndex,
      externalTopupLink,
      loadUserBalance,
      renderDisplayAmount,
      submitRedemption,
      userBalanceYYC,
    ],
  );

  const activeContent = useMemo(() => {
    switch (activeKey) {
      case 'package':
        return <PackagePurchasePage />;
      case 'records':
        return <TopUpRecordsPage recordKey={activeRecord} />;
      case 'balance':
      default:
        return (
          <>
            <BalanceTopUpPage />
            <RedeemCodePage />
          </>
        );
    }
  }, [activeKey, activeRecord]);

  const pageTitle = useMemo(() => {
    switch (activeKey) {
      case 'package':
        return t('topup.mine.package');
      case 'records':
        return t(`topup.record_nav.${activeRecord}`);
      case 'balance':
      default:
        return t('topup.mine.balance');
    }
  }, [activeKey, activeRecord, t]);

  return (
    <TopUpWorkspaceContext.Provider value={contextValue}>
      <div className='dashboard-container'>
        <Card fluid className='chart-card'>
          <Card.Content>
            <Card.Header className='router-card-header'>
              <Header as='h2' className='router-page-title'>
                {pageTitle}
              </Header>
            </Card.Header>

            {activeContent}
          </Card.Content>
        </Card>
      </div>
    </TopUpWorkspaceContext.Provider>
  );
};

export default TopUpLayout;
