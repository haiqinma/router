import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import CopyButton from '../../components/CopyButton';
import {
  buildBillingCurrencyIndex,
  buildFaceValueUnitOptions,
} from '../../helpers/billing';
import {
  AppButton,
  AppDetailSection,
  AppEmpty,
  AppErrorState,
  AppField,
  AppFilterHeader,
  AppFormRow,
  AppInput,
  AppSelect,
  AppSkeleton,
  AppTag,
} from '../../router-ui';

const YYC_UNIT = 'YYC';

function renderStatus(status, t) {
  switch (status) {
    case 1:
      return (
        <AppTag color='green' className='router-tag'>
          {t('redemption.status.unused')}
        </AppTag>
      );
    case 2:
      return (
        <AppTag color='red' className='router-tag'>
          {t('redemption.status.disabled')}
        </AppTag>
      );
    case 3:
      return (
        <AppTag color='grey' className='router-tag'>
          {t('redemption.status.used')}
        </AppTag>
      );
    default:
      return (
        <AppTag color='black' className='router-tag'>
          {t('redemption.status.unknown')}
        </AppTag>
      );
  }
}

const toGroupOptions = (rows) =>
  (Array.isArray(rows) ? rows : []).map((item) => ({
    key: item.id,
    value: item.id,
    text: item.name || item.id,
  }));

const normalizeFaceValueAmount = (data) => `${Number(data?.quota_amount_snapshot || 0)}`;
const normalizeFaceValueUnit = (data) => (data?.quota_currency_snapshot || 'YYC').toString().trim().toUpperCase();

const formatGroupLabel = (data) => {
  const name = (data?.group_name || '').toString().trim();
  if (name) {
    return name;
  }
  const id = (data?.group_id || '').toString().trim();
  return id || '-';
};

const RedemptionDetail = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [redemption, setRedemption] = useState(null);
  const [groupOptions, setGroupOptions] = useState([]);
  const [unitOptions, setUnitOptions] = useState(buildFaceValueUnitOptions([]));
  const [currencyIndex, setCurrencyIndex] = useState(buildBillingCurrencyIndex([]));
  const [inputs, setInputs] = useState({
    name: '',
    group_id: '',
    face_value_amount: '0',
    face_value_unit: YYC_UNIT,
    code_validity_days: 0,
    credit_validity_days: 0,
  });
  const isEditing = searchParams.get('edit') === '1';
  const returnPath = (() => {
    const from = location.state?.from;
    if (typeof from !== 'string') {
      return '';
    }
    const normalized = from.trim();
    return normalized.startsWith('/') ? normalized : '';
  })();

  const syncInputs = useCallback((data) => {
    setInputs({
      name: (data?.name || '').toString(),
      group_id: (data?.group_id || '').toString().trim(),
      face_value_amount: normalizeFaceValueAmount(data),
      face_value_unit: normalizeFaceValueUnit(data),
      code_validity_days: Number(data?.code_validity_days ?? 0) || 0,
      credit_validity_days: Number(data?.credit_validity_days ?? 0) || 0,
    });
  }, []);

  const setEditMode = useCallback(
    (nextEditing) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (nextEditing) {
        nextSearchParams.set('edit', '1');
      } else {
        nextSearchParams.delete('edit');
      }
      setSearchParams(nextSearchParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleInputChange = useCallback((e, { name, value }) => {
    setInputs((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  const loadOptions = useCallback(async (currentUnit = '') => {
    setOptionsLoading(true);
    try {
      const [groupsRes, currenciesRes] = await Promise.all([
        API.get('/api/v1/admin/groups', {
          params: {
            page: 1,
            page_size: 200,
          },
        }),
        API.get('/api/v1/admin/billing/currencies'),
      ]);
      const groupsPayload = groupsRes?.data || {};
      if (!groupsPayload.success) {
        throw new Error(groupsPayload.message || t('redemption.messages.load_groups_failed'));
      }
      const currenciesPayload = currenciesRes?.data || {};
      if (!currenciesPayload.success) {
        throw new Error(
          currenciesPayload.message || t('redemption.messages.load_units_failed')
        );
      }
      const nextGroups = groupsPayload?.data?.items || [];
      const nextCurrencies = Array.isArray(currenciesPayload?.data)
        ? currenciesPayload.data
        : [];
      setGroupOptions(toGroupOptions(nextGroups));
      setUnitOptions(buildFaceValueUnitOptions(nextCurrencies, { currentUnit }));
      setCurrencyIndex(buildBillingCurrencyIndex(nextCurrencies));
    } catch (error) {
      showError(error?.message || error);
    } finally {
      setOptionsLoading(false);
    }
  }, [t]);

  const loadRedemption = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/v1/admin/redemption/${id}`);
      const { success, message, data } = res.data;
      if (success) {
        setLoadError(false);
        setRedemption(data);
        syncInputs(data);
        await loadOptions(normalizeFaceValueUnit(data));
      } else {
        setLoadError(true);
        showError(message);
      }
    } catch (error) {
      setLoadError(true);
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, [id, loadOptions, syncInputs]);

  useEffect(() => {
    loadRedemption().then();
  }, [loadRedemption]);

  const handleCancelEdit = () => {
    syncInputs(redemption);
    setEditMode(false);
  };

  const submitEdit = async () => {
    if ((inputs.name || '').trim() === '') {
      showError(t('redemption.messages.name_required'));
      return;
    }
    setSaving(true);
    try {
      const res = await API.put('/api/v1/admin/redemption/', {
        id,
        name: (inputs.name || '').toString().trim(),
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message);
        return;
      }
      setRedemption(data);
      syncInputs(data);
      setUnitOptions(buildFaceValueUnitOptions(
        Object.values(currencyIndex).filter(Boolean),
        { currentUnit: normalizeFaceValueUnit(data) }
      ));
      setEditMode(false);
      showSuccess(t('redemption.messages.update_success'));
    } catch (error) {
      showError(error?.message || error);
    } finally {
      setSaving(false);
    }
  };

  const redeemedByValue =
    redemption?.redeemed_by_username ||
    redemption?.redeemed_by_user_id ||
    t('redemption.table.not_redeemed');

  const handleBack = () => {
    navigate(returnPath || '/admin/redemption');
  };

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          {
            key: 'redemption-list',
            label: t('header.redemption'),
            onClick: handleBack,
          },
          {
            key: 'redemption-current',
            label: id,
            active: true,
          },
        ]}
        title={t('redemption.detail.title')}
      />
      <div className='router-entity-detail-page'>
        {loading && !redemption ? (
          <AppSkeleton variant='text' />
        ) : loadError && !redemption ? (
          <AppErrorState
            message={t('common.load_failed')}
            onRetry={loadRedemption}
            retryText={t('common.retry')}
          />
        ) : !redemption ? (
          <AppEmpty>{t('common.no_data')}</AppEmpty>
        ) : (
        <AppDetailSection
          title={t('common.basic_info')}
          headerStart={redemption ? renderStatus(redemption.status, t) : null}
          headerEnd={
            isEditing ? (
              <>
                <AppButton
                  className='router-page-button'
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  {t('redemption.edit.buttons.cancel')}
                </AppButton>
                <AppButton
                  className='router-page-button'
                  color='blue'
                  loading={saving}
                  disabled={saving}
                  onClick={submitEdit}
                >
                  {t('redemption.edit.buttons.submit')}
                </AppButton>
              </>
            ) : (
              <AppButton
                className='router-page-button'
                color='blue'
                onClick={() => setEditMode(true)}
              >
                {t('redemption.buttons.edit')}
              </AppButton>
            )
          }
          bodyClassName='router-page-stack'
        >
                <AppFormRow>
                  {isEditing ? (
                    <AppField label={t('redemption.edit.name')}>
                      <AppInput
                        className='router-section-input'
                        name='name'
                        value={inputs.name}
                        placeholder={t('redemption.edit.name_placeholder')}
                        onChange={handleInputChange}
                      />
                    </AppField>
                  ) : (
                    <AppField label={t('redemption.table.name')} readOnly>
                      <AppInput
                        className='router-section-input'
                        value={redemption?.name || t('redemption.table.no_name')}
                        readOnly
                      />
                    </AppField>
                  )}
                  <AppField label={t('redemption.detail.code')} readOnly>
                    <div className='router-action-group-tight router-copyable-input-row'>
                      <AppInput
                        className='router-section-input router-machine-input'
                        value={redemption?.code || ''}
                        readOnly
                      />
                      {redemption?.code ? (
                        <CopyButton
                          value={redemption.code}
                          size='small'
                          basic
                          iconOnly
                        />
                      ) : null}
                    </div>
                  </AppField>
                </AppFormRow>
                <AppFormRow>
                  <AppField label={t('redemption.table.product_name')} readOnly>
                    <button
                      type='button'
                      className='router-link-button router-link-inline'
                      onClick={() => navigate(
                        `/admin/entitlement/topup/detail/${encodeURIComponent(redemption?.entitlement_product_id || '')}`,
                        { state: { from: `${location.pathname}${location.search}` } },
                      )}
                    >
                      {redemption?.product_name_snapshot || redemption?.entitlement_product_id || '-'}
                    </button>
                  </AppField>
                  <AppField label={t('redemption.detail.redeemed_by')} readOnly>
                    {redemption?.redeemed_by_user_id ? (
                      <button
                        type='button'
                        className='router-link-button router-link-inline'
                        onClick={() =>
                          navigate(
                            `/admin/user/detail/${encodeURIComponent(
                              redemption.redeemed_by_user_id,
                            )}`,
                            {
                              state: {
                                from: `${location.pathname}${location.search}`,
                              },
                            },
                          )
                        }
                      >
                        {redeemedByValue}
                      </button>
                    ) : (
                      <AppInput
                        className='router-section-input'
                        value={redeemedByValue}
                        readOnly
                      />
                    )}
                  </AppField>
                </AppFormRow>
	                <AppFormRow>
                  <AppField label={t('redemption.detail.code_validity_days')} readOnly>
                    <AppInput
                      className='router-section-input'
                      value={Number(redemption?.code_validity_days || 0) > 0
                        ? `${Number(redemption?.code_validity_days || 0)} ${t('common.day')}`
                        : t('common.never')}
                      readOnly
                    />
                  </AppField>
                  {/* credit_validity_days 后端更新接口不支持写入,故仅只读展示 */}
                  <AppField label={t('redemption.detail.credit_validity_days')} readOnly>
                    <AppInput
                      className='router-section-input'
                      value={Number(redemption?.validity_days_snapshot || 0) > 0
                        ? `${Number(redemption?.validity_days_snapshot || 0)} ${t('common.day')}`
                        : t('common.never')}
                      readOnly
                    />
                  </AppField>
                </AppFormRow>
                <AppFormRow>
                  <AppField label={t('redemption.table.created_time')} readOnly>
                    <AppInput
                      className='router-section-input'
                      value={
                        redemption?.created_time
                          ? timestamp2string(redemption.created_time)
                          : ''
                      }
                      readOnly
                    />
                  </AppField>
                  <AppField label={t('redemption.table.redeemed_time')} readOnly>
                    <AppInput
                      className='router-section-input'
                      value={
                        redemption?.redeemed_time
                          ? timestamp2string(redemption.redeemed_time)
                          : t('redemption.table.not_redeemed')
                      }
                      readOnly
                    />
                  </AppField>
                </AppFormRow>
                <AppFormRow>
                  <AppField label={t('redemption.detail.code_expires_at')} readOnly>
                    <AppInput
                      className='router-section-input'
                      value={
                        Number(redemption?.code_expires_at || 0) > 0
                          ? timestamp2string(redemption.code_expires_at)
                          : t('common.never')
                      }
                      readOnly
                    />
                  </AppField>
                  <AppField label={t('redemption.detail.credit_expires_at')} readOnly>
                    <AppInput
                      className='router-section-input'
                      value={
                        Number(redemption?.credit_expires_at || 0) > 0
                          ? timestamp2string(redemption.credit_expires_at)
                          : t('common.never')
                      }
                      readOnly
                    />
                  </AppField>
                </AppFormRow>
        </AppDetailSection>
        )}
      </div>
    </div>
  );
};

export default RedemptionDetail;
