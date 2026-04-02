import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Divider, Form, Grid, Header, Table } from 'semantic-ui-react';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
} from '../helpers';
import { YYC_SYMBOL } from '../helpers/render';

const createEmptyBillingCurrency = () => ({
  code: '',
  name: '',
  symbol: '',
  minor_unit: 2,
  yyc_per_unit: '',
  status: 1,
  source: 'manual',
  updated_at: 0,
  _isNew: true,
});

const quotaOptionKeys = [
  'QuotaForNewUser',
  'PreConsumedQuota',
  'QuotaForInviter',
  'QuotaForInvitee',
];

const createQuotaUnitState = (defaultUnit = 'USD') =>
  quotaOptionKeys.reduce((result, key) => {
    result[key] = defaultUnit;
    return result;
  }, {});

const buildDisplayCurrencyIndex = (rows) => {
  const next = {
    YYC: {
      code: 'YYC',
      symbol: YYC_SYMBOL,
      minor_unit: 0,
      yyc_per_unit: 1,
    },
  };
  (Array.isArray(rows) ? rows : [])
    .filter((item) => Number(item?.status || 0) === 1)
    .forEach((item) => {
      const code = (item?.code || '').toString().trim().toUpperCase();
      if (!code) {
        return;
      }
      next[code] = {
        ...item,
        code,
      };
    });
  return next;
};

const resolveDefaultQuotaUnit = (currencyIndex) => {
  if (currencyIndex?.USD) {
    return 'USD';
  }
  if (currencyIndex?.YYC) {
    return 'YYC';
  }
  return (
    Object.keys(currencyIndex || {})
      .filter((code) => code)
      .sort((a, b) => a.localeCompare(b))[0] || 'YYC'
  );
};

const getCurrencyRateToYYC = (unit, currencyIndex) => {
  const normalizedUnit = (unit || '').toString().trim().toUpperCase();
  if (normalizedUnit === 'YYC') {
    return 1;
  }
  const rate = Number(currencyIndex?.[normalizedUnit]?.yyc_per_unit || 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return rate;
};

const formatQuotaInputAmount = (amount, unit, currencyIndex) => {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
    return '0';
  }
  const normalizedUnit = (unit || '').toString().trim().toUpperCase();
  if (normalizedUnit === 'YYC') {
    return `${Math.round(normalizedAmount)}`;
  }
  const minorUnit = Number(currencyIndex?.[normalizedUnit]?.minor_unit);
  const fractionDigits =
    Number.isInteger(minorUnit) && minorUnit >= 0 ? Math.min(minorUnit, 8) : 6;
  return normalizedAmount.toFixed(fractionDigits).replace(/\.?0+$/, '');
};

const quotaToInputValueByUnit = (quota, unit, currencyIndex) => {
  const storedYYC = Number(quota || 0);
  if (!Number.isFinite(storedYYC) || storedYYC <= 0) {
    return '0';
  }
  const rate = getCurrencyRateToYYC(unit, currencyIndex);
  if (rate <= 0) {
    return '0';
  }
  return formatQuotaInputAmount(storedYYC / rate, unit, currencyIndex);
};

const quotaInputToStoredValueByUnit = (value, unit, currencyIndex) => {
  const normalizedAmount = Number(value ?? 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return NaN;
  }
  const rate = getCurrencyRateToYYC(unit, currencyIndex);
  if (rate <= 0) {
    return NaN;
  }
  if ((unit || '').toString().trim().toUpperCase() === 'YYC') {
    return Math.round(normalizedAmount);
  }
  return Math.round(normalizedAmount * rate);
};

const convertQuotaInputValueUnit = (value, fromUnit, toUnit, currencyIndex) => {
  const normalizedAmount = Number(value ?? 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return '0';
  }
  const storedYYC = quotaInputToStoredValueByUnit(
    normalizedAmount,
    fromUnit,
    currencyIndex
  );
  if (!Number.isFinite(storedYYC) || storedYYC < 0) {
    return '0';
  }
  return quotaToInputValueByUnit(storedYYC, toUnit, currencyIndex);
};

const buildQuotaUnitOptions = (currencyIndex) => {
  const seen = new Set();
  return Object.values(currencyIndex || {})
    .filter((item) => item && item.code)
    .sort((a, b) => {
      if (a.code === 'USD') return -1;
      if (b.code === 'USD') return 1;
      if (a.code === 'YYC') return -1;
      if (b.code === 'YYC') return 1;
      return `${a.code}`.localeCompare(`${b.code}`);
    })
    .reduce((items, item) => {
      const code = (item.code || '').toString().trim().toUpperCase();
      if (!code || seen.has(code)) {
        return items;
      }
      seen.add(code);
      items.push({
        key: code,
        value: code,
        text: (item?.symbol || '').toString().trim() || code,
      });
      return items;
    }, []);
};

const resolveQuotaInputStep = (unit, currencyIndex) => {
  const normalizedUnit = (unit || '').toString().trim().toUpperCase();
  if (normalizedUnit === 'YYC') {
    return '1';
  }
  const minorUnit = Number(currencyIndex?.[normalizedUnit]?.minor_unit);
  if (!Number.isInteger(minorUnit) || minorUnit <= 0) {
    return '0.01';
  }
  return (1 / 10 ** Math.min(minorUnit, 8)).toFixed(Math.min(minorUnit, 8));
};

const normalizeOptionValue = (value, fallback = '') => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return `${value}`;
};

const applyQuotaDisplayValues = (rawInputs, quotaUnits, currencyIndex) => {
  const next = {
    ...(rawInputs || {}),
  };
  quotaOptionKeys.forEach((key) => {
    next[key] = quotaToInputValueByUnit(
      rawInputs?.[key] ?? 0,
      quotaUnits?.[key],
      currencyIndex
    );
  });
  return next;
};

const OperationSetting = ({ section = '' }) => {
  const { t } = useTranslation();
  let now = new Date();
  let [inputs, setInputs] = useState({
    QuotaForNewUser: 0,
    DefaultUserGroup: '',
    QuotaForInviter: 0,
    QuotaForInvitee: 0,
    QuotaRemindThreshold: 0,
    PreConsumedQuota: 0,
    TopUpLink: '',
    ChatLink: '',
    QuotaPerUnit: 0,
    AutomaticDisableChannelEnabled: '',
    AutomaticEnableChannelEnabled: '',
    ChannelDisableThreshold: 0,
    LogConsumeEnabled: '',
    DisplayInCurrencyEnabled: '',
    DisplayTokenStatEnabled: '',
    ApproximateTokenEnabled: '',
    RetryTimes: 0,
  });
  const [originInputs, setOriginInputs] = useState({});
  const [groupOptions, setGroupOptions] = useState([]);
  const [billingCurrencies, setBillingCurrencies] = useState([]);
  const [billingCurrencyIndex, setBillingCurrencyIndex] = useState(
    buildDisplayCurrencyIndex([])
  );
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingCurrenciesReady, setBillingCurrenciesReady] = useState(false);
  const [billingSavingKey, setBillingSavingKey] = useState('');
  const [quotaUnits, setQuotaUnits] = useState(createQuotaUnitState('USD'));
  const [quotaDisplayInitialized, setQuotaDisplayInitialized] = useState(false);
  let [loading, setLoading] = useState(false);
  let [historyTimestamp, setHistoryTimestamp] = useState(
    timestamp2string(now.getTime() / 1000 - 30 * 24 * 3600)
  ); // a month ago
  const normalizedSection = (section || '').trim().toLowerCase();
  const showAllSections =
    normalizedSection === '' || normalizedSection === 'all';
  const sectionVisible = {
    quota: showAllSections || normalizedSection === 'quota',
    monitor: showAllSections || normalizedSection === 'monitor',
    log: showAllSections || normalizedSection === 'log',
    general: showAllSections || normalizedSection === 'general',
    billing: showAllSections || normalizedSection === 'billing',
  };
  const sectionOrder = ['quota', 'monitor', 'log', 'general', 'billing'];
  const shouldRenderDividerAfter = (key) => {
    if (!showAllSections) {
      return false;
    }
    const index = sectionOrder.indexOf(key);
    if (index < 0) {
      return false;
    }
    return sectionOrder
      .slice(index + 1)
      .some((nextKey) => Boolean(sectionVisible[nextKey]));
  };

  const getOptions = async () => {
    const res = await API.get('/api/v1/admin/option/');
    const { success, message, data } = res.data;
    if (success) {
      let newInputs = {};
      data.forEach((item) => {
        if (item.value === '{}') {
          item.value = '';
        }
        newInputs[item.key] = item.value;
      });
      setQuotaDisplayInitialized(false);
      setInputs(newInputs);
      setOriginInputs(newInputs);
    } else {
      showError(message);
    }
  };

  useEffect(() => {
    getOptions().then();
    loadGroups().then();
    loadBillingCurrencies().then();
  }, []);

  const billingStatusOptions = [
    {
      key: 1,
      value: 1,
      text: t('setting.operation.billing.status.enabled'),
    },
    {
      key: 2,
      value: 2,
      text: t('setting.operation.billing.status.disabled'),
    },
  ];

  const quotaUnitOptions = useMemo(
    () => buildQuotaUnitOptions(billingCurrencyIndex),
    [billingCurrencyIndex]
  );

  const loadGroups = async () => {
    try {
      const rows = [];
      let page = 1;
      while (page <= 50) {
        const res = await API.get('/api/v1/admin/groups', {
          params: {
            page,
            page_size: 100,
          },
        });
        const { success, message, data } = res.data || {};
        if (!success) {
          showError(message);
          return;
        }
        const pageItems = Array.isArray(data?.items) ? data.items : [];
        rows.push(...pageItems);
        const total = Number(data?.total || pageItems.length || 0);
        if (
          pageItems.length === 0 ||
          rows.length >= total ||
          pageItems.length < 100
        ) {
          break;
        }
        page += 1;
      }
      setGroupOptions(
        rows.map((group) => ({
          key: group.id,
          value: group.id,
          text: group.name || group.id,
        })),
      );
    } catch (error) {
      showError(error?.message || error);
    }
  };

  const loadBillingCurrencies = async () => {
    setBillingLoading(true);
    try {
      const res = await API.get('/api/v1/admin/billing/currencies');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('setting.operation.billing.messages.load_failed'));
        return;
      }
      const rows = (Array.isArray(data) ? data : [])
        .map((item) => ({
          ...item,
          minor_unit: Number(item?.minor_unit ?? 2),
          yyc_per_unit:
            item?.yyc_per_unit === 0 || item?.yyc_per_unit
              ? `${item.yyc_per_unit}`
              : '',
          status: Number(item?.status || 1),
          _isNew: false,
        }))
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      const nextCurrencyIndex = buildDisplayCurrencyIndex(rows);
      const defaultQuotaUnit = resolveDefaultQuotaUnit(nextCurrencyIndex);
      setBillingCurrencies(rows);
      setBillingCurrencyIndex(nextCurrencyIndex);
      setQuotaUnits((prev) =>
        quotaOptionKeys.reduce((result, key) => {
          const currentUnit = (prev?.[key] || '').toString().trim().toUpperCase();
          result[key] =
            currentUnit && nextCurrencyIndex[currentUnit]
              ? currentUnit
              : defaultQuotaUnit;
          return result;
        }, {})
      );
    } catch (error) {
      showError(
        error?.message || t('setting.operation.billing.messages.load_failed')
      );
    } finally {
      setBillingLoading(false);
      setBillingCurrenciesReady(true);
    }
  };

  const updateOption = async (key, value) => {
    setLoading(true);
    let nextValue = value;
    let syncInputState = false;
    if (key.endsWith('Enabled')) {
      nextValue = inputs[key] === 'true' ? 'false' : 'true';
      syncInputState = true;
    }
    const res = await API.put('/api/v1/admin/option/', {
      key,
      value: nextValue,
    });
    const { success, message } = res.data;
    if (success) {
      setOriginInputs((prev) => ({ ...prev, [key]: normalizeOptionValue(nextValue) }));
      if (syncInputState) {
        setInputs((prev) => ({ ...prev, [key]: nextValue }));
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleInputChange = async (e, { name, value }) => {
    const normalizedValue = value ?? '';
    if (name.endsWith('Enabled')) {
      await updateOption(name, normalizedValue);
    } else {
      setInputs((inputs) => ({ ...inputs, [name]: normalizedValue }));
    }
  };

  const submitConfig = async (group) => {
    switch (group) {
      case 'monitor':
        if (
          originInputs['ChannelDisableThreshold'] !==
          inputs.ChannelDisableThreshold
        ) {
          await updateOption(
            'ChannelDisableThreshold',
            inputs.ChannelDisableThreshold
          );
        }
        if (
          originInputs['QuotaRemindThreshold'] !== inputs.QuotaRemindThreshold
        ) {
          await updateOption(
            'QuotaRemindThreshold',
            inputs.QuotaRemindThreshold
          );
        }
        break;
      case 'quota':
        {
          const quotaForNewUser = quotaInputToStoredValueByUnit(
            inputs.QuotaForNewUser,
            quotaUnits.QuotaForNewUser,
            billingCurrencyIndex
          );
          if (
            !Number.isFinite(quotaForNewUser) ||
            quotaForNewUser < 0
          ) {
            showError(t('setting.operation.quota.messages.amount_invalid'));
            break;
          }
          if (
            normalizeOptionValue(originInputs['QuotaForNewUser'], '0') !==
            `${Math.trunc(quotaForNewUser)}`
          ) {
            await updateOption('QuotaForNewUser', `${Math.trunc(quotaForNewUser)}`);
          }
        }
        if (originInputs['DefaultUserGroup'] !== inputs.DefaultUserGroup) {
          await updateOption('DefaultUserGroup', inputs.DefaultUserGroup);
        }
        {
          const quotaForInvitee = quotaInputToStoredValueByUnit(
            inputs.QuotaForInvitee,
            quotaUnits.QuotaForInvitee,
            billingCurrencyIndex
          );
          if (
            !Number.isFinite(quotaForInvitee) ||
            quotaForInvitee < 0
          ) {
            showError(t('setting.operation.quota.messages.amount_invalid'));
            break;
          }
          if (
            normalizeOptionValue(originInputs['QuotaForInvitee'], '0') !==
            `${Math.trunc(quotaForInvitee)}`
          ) {
            await updateOption('QuotaForInvitee', `${Math.trunc(quotaForInvitee)}`);
          }
        }
        {
          const quotaForInviter = quotaInputToStoredValueByUnit(
            inputs.QuotaForInviter,
            quotaUnits.QuotaForInviter,
            billingCurrencyIndex
          );
          if (
            !Number.isFinite(quotaForInviter) ||
            quotaForInviter < 0
          ) {
            showError(t('setting.operation.quota.messages.amount_invalid'));
            break;
          }
          if (
            normalizeOptionValue(originInputs['QuotaForInviter'], '0') !==
            `${Math.trunc(quotaForInviter)}`
          ) {
            await updateOption('QuotaForInviter', `${Math.trunc(quotaForInviter)}`);
          }
        }
        {
          const preConsumedQuota = quotaInputToStoredValueByUnit(
            inputs.PreConsumedQuota,
            quotaUnits.PreConsumedQuota,
            billingCurrencyIndex
          );
          if (
            !Number.isFinite(preConsumedQuota) ||
            preConsumedQuota < 0
          ) {
            showError(t('setting.operation.quota.messages.amount_invalid'));
            break;
          }
          if (
            normalizeOptionValue(originInputs['PreConsumedQuota'], '0') !==
            `${Math.trunc(preConsumedQuota)}`
          ) {
            await updateOption('PreConsumedQuota', `${Math.trunc(preConsumedQuota)}`);
          }
        }
        break;
      case 'general':
        if (originInputs['TopUpLink'] !== inputs.TopUpLink) {
          await updateOption('TopUpLink', inputs.TopUpLink);
        }
        if (originInputs['ChatLink'] !== inputs.ChatLink) {
          await updateOption('ChatLink', inputs.ChatLink);
        }
        if (originInputs['QuotaPerUnit'] !== inputs.QuotaPerUnit) {
          await updateOption('QuotaPerUnit', inputs.QuotaPerUnit);
        }
        if (originInputs['RetryTimes'] !== inputs.RetryTimes) {
          await updateOption('RetryTimes', inputs.RetryTimes);
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (quotaDisplayInitialized) {
      return;
    }
    if (!billingCurrenciesReady) {
      return;
    }
    if (Object.keys(originInputs || {}).length === 0) {
      return;
    }
    const defaultQuotaUnit = resolveDefaultQuotaUnit(billingCurrencyIndex);
    const nextQuotaUnits = quotaOptionKeys.reduce((result, key) => {
      const currentUnit = (quotaUnits?.[key] || '').toString().trim().toUpperCase();
      result[key] =
        currentUnit && billingCurrencyIndex[currentUnit]
          ? currentUnit
          : defaultQuotaUnit;
      return result;
    }, {});
    setQuotaUnits(nextQuotaUnits);
    setInputs((prev) => ({
      ...prev,
      ...applyQuotaDisplayValues(originInputs, nextQuotaUnits, billingCurrencyIndex),
    }));
    setQuotaDisplayInitialized(true);
  }, [
    billingCurrenciesReady,
    billingCurrencyIndex,
    originInputs,
    quotaDisplayInitialized,
    quotaUnits,
  ]);

  const renderQuotaInputField = (labelKey, inputKey, placeholderKey) => (
    <Form.Field>
      <label>{t(labelKey)}</label>
      <div className='router-section-input-with-unit'>
        <Form.Input
          className='router-section-input router-section-input-with-unit-field'
          autoComplete='new-password'
          value={inputs[inputKey] ?? '0'}
          type='number'
          min='0'
          step={resolveQuotaInputStep(quotaUnits[inputKey], billingCurrencyIndex)}
          placeholder={t(placeholderKey)}
          onChange={(e) => {
            setInputs((prev) => ({
              ...prev,
              [inputKey]: e.target.value || '0',
            }));
          }}
        />
        <select
          className='router-section-input-unit-native'
          value={quotaUnits[inputKey] || resolveDefaultQuotaUnit(billingCurrencyIndex)}
          onChange={(e) => {
            const nextUnit = (e.target.value || 'YYC').toString().trim().toUpperCase();
            setInputs((prev) => ({
              ...prev,
              [inputKey]: convertQuotaInputValueUnit(
                prev[inputKey],
                quotaUnits[inputKey],
                nextUnit,
                billingCurrencyIndex
              ),
            }));
            setQuotaUnits((prev) => ({
              ...prev,
              [inputKey]: nextUnit,
            }));
          }}
          aria-label={t(labelKey)}
        >
          {quotaUnitOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.text}
            </option>
          ))}
        </select>
      </div>
    </Form.Field>
  );

  const deleteHistoryLogs = async () => {
    console.log(inputs);
    const res = await API.delete(
      `/api/v1/admin/log/?target_timestamp=${Date.parse(historyTimestamp) / 1000}`
    );
    const { success, message, data } = res.data;
    if (success) {
      showSuccess(`${data} 条日志已清理！`);
      return;
    }
    showError('日志清理失败：' + message);
  };

  const addBillingCurrency = () => {
    setBillingCurrencies((prev) => {
      if (prev.some((item) => item._isNew)) {
        return prev;
      }
      return [createEmptyBillingCurrency(), ...prev];
    });
  };

  const removeNewBillingCurrency = (index) => {
    setBillingCurrencies((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const updateBillingCurrencyField = (index, name, value) => {
    setBillingCurrencies((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [name]: value } : row
      )
    );
  };

  const saveBillingCurrency = async (row, index) => {
    const code = (row.code || '').toString().trim().toUpperCase();
    const name = (row.name || '').toString().trim();
    const symbol = (row.symbol || '').toString().trim();
    const minorUnit = Number.parseInt(row.minor_unit ?? 2, 10);
    const yycPerUnit = Number.parseFloat(row.yyc_per_unit ?? '');
    const status = Number(row.status || 1);

    if (!code) {
      showError(t('setting.operation.billing.messages.code_required'));
      return;
    }
    if (!name) {
      showError(t('setting.operation.billing.messages.name_required'));
      return;
    }
    if (!Number.isFinite(minorUnit) || minorUnit < 0) {
      showError(t('setting.operation.billing.messages.minor_unit_invalid'));
      return;
    }
    if (!Number.isFinite(yycPerUnit) || yycPerUnit <= 0) {
      showError(t('setting.operation.billing.messages.yyc_per_unit_invalid'));
      return;
    }

    const payload = {
      code,
      name,
      symbol,
      minor_unit: minorUnit,
      yyc_per_unit: yycPerUnit,
      status,
      source: (row.source || '').toString().trim(),
    };
    const savingKey = row._isNew ? `new-${index}` : code;
    setBillingSavingKey(savingKey);
    try {
      const res = row._isNew
        ? await API.post('/api/v1/admin/billing/currencies', payload)
        : await API.put(`/api/v1/admin/billing/currencies/${encodeURIComponent(code)}`, payload);
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('setting.operation.billing.messages.save_failed'));
        return;
      }
      showSuccess(t('setting.operation.billing.messages.save_success'));
      await loadBillingCurrencies();
    } catch (error) {
      showError(
        error?.message || t('setting.operation.billing.messages.save_failed')
      );
    } finally {
      setBillingSavingKey('');
    }
  };

  return (
    <Grid columns={1}>
      <Grid.Column>
        <Form loading={loading}>
          {sectionVisible.quota ? (
            <>
              <Header as='h3' className='router-section-title'>{t('setting.operation.quota.title')}</Header>
              <Form.Group widths='equal'>
                {renderQuotaInputField(
                  'setting.operation.quota.new_user',
                  'QuotaForNewUser',
                  'setting.operation.quota.new_user_placeholder'
                )}
                <Form.Dropdown
                  className='router-section-input'
                  label={t('setting.operation.quota.default_group')}
                  name='DefaultUserGroup'
                  selection
                  clearable
                  search
                  options={groupOptions}
                  onChange={handleInputChange}
                  value={inputs.DefaultUserGroup || ''}
                  placeholder={t('setting.operation.quota.default_group_placeholder')}
                />
                {renderQuotaInputField(
                  'setting.operation.quota.pre_consume',
                  'PreConsumedQuota',
                  'setting.operation.quota.pre_consume_placeholder'
                )}
              </Form.Group>
              <Form.Group widths='equal'>
                {renderQuotaInputField(
                  'setting.operation.quota.inviter_reward',
                  'QuotaForInviter',
                  'setting.operation.quota.inviter_reward_placeholder'
                )}
                {renderQuotaInputField(
                  'setting.operation.quota.invitee_reward',
                  'QuotaForInvitee',
                  'setting.operation.quota.invitee_reward_placeholder'
                )}
              </Form.Group>
              <Form.Button
                className='router-section-button'
                onClick={() => {
                  submitConfig('quota').then();
                }}
              >
                {t('setting.operation.quota.buttons.save')}
              </Form.Button>
              {shouldRenderDividerAfter('quota') ? <Divider /> : null}
            </>
          ) : null}

          {sectionVisible.monitor ? (
            <>
              <Header as='h3' className='router-section-title'>{t('setting.operation.monitor.title')}</Header>
              <Form.Group widths={3}>
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.monitor.max_response_time')}
                  name='ChannelDisableThreshold'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.ChannelDisableThreshold}
                  type='number'
                  min='0'
                  placeholder={t(
                    'setting.operation.monitor.max_response_time_placeholder'
                  )}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.monitor.quota_reminder')}
                  name='QuotaRemindThreshold'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.QuotaRemindThreshold}
                  type='number'
                  min='0'
                  placeholder={t(
                    'setting.operation.monitor.quota_reminder_placeholder'
                  )}
                />
              </Form.Group>
              <Form.Group inline>
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.AutomaticDisableChannelEnabled === 'true'}
                  label={t('setting.operation.monitor.auto_disable')}
                  name='AutomaticDisableChannelEnabled'
                  onChange={handleInputChange}
                />
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.AutomaticEnableChannelEnabled === 'true'}
                  label={t('setting.operation.monitor.auto_enable')}
                  name='AutomaticEnableChannelEnabled'
                  onChange={handleInputChange}
                />
              </Form.Group>
              <Form.Button
                className='router-section-button'
                onClick={() => {
                  submitConfig('monitor').then();
                }}
              >
                {t('setting.operation.monitor.buttons.save')}
              </Form.Button>
              {shouldRenderDividerAfter('monitor') ? <Divider /> : null}
            </>
          ) : null}

          {sectionVisible.log ? (
            <>
              <Header as='h3' className='router-section-title'>{t('setting.operation.log.title')}</Header>
              <Form.Group inline>
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.LogConsumeEnabled === 'true'}
                  label={t('setting.operation.log.enable_consume')}
                  name='LogConsumeEnabled'
                  onChange={handleInputChange}
                />
              </Form.Group>
              <Form.Group widths={4}>
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.log.target_time')}
                  value={historyTimestamp}
                  type='datetime-local'
                  name='history_timestamp'
                  onChange={(e, { value }) => {
                    setHistoryTimestamp(value);
                  }}
                />
              </Form.Group>
              <Form.Button
                className='router-section-button'
                onClick={() => {
                  deleteHistoryLogs().then();
                }}
              >
                {t('setting.operation.log.buttons.clean')}
              </Form.Button>
              {shouldRenderDividerAfter('log') ? <Divider /> : null}
            </>
          ) : null}

          {sectionVisible.general ? (
            <>
              <Header as='h3' className='router-section-title'>{t('setting.operation.general.title')}</Header>
              <Form.Group widths={4}>
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.general.topup_link')}
                  name='TopUpLink'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.TopUpLink}
                  type='link'
                  placeholder={t(
                    'setting.operation.general.topup_link_placeholder'
                  )}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.general.chat_link')}
                  name='ChatLink'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.ChatLink}
                  type='link'
                  placeholder={t('setting.operation.general.chat_link_placeholder')}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.general.quota_per_unit')}
                  name='QuotaPerUnit'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.QuotaPerUnit}
                  type='number'
                  step='0.01'
                  placeholder={t(
                    'setting.operation.general.quota_per_unit_placeholder'
                  )}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.general.retry_times')}
                  name='RetryTimes'
                  type={'number'}
                  step='1'
                  min='0'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.RetryTimes}
                  placeholder={t(
                    'setting.operation.general.retry_times_placeholder'
                  )}
                />
              </Form.Group>
              <Form.Group inline>
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.DisplayInCurrencyEnabled === 'true'}
                  label={t('setting.operation.general.display_in_currency')}
                  name='DisplayInCurrencyEnabled'
                  onChange={handleInputChange}
                />
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.DisplayTokenStatEnabled === 'true'}
                  label={t('setting.operation.general.display_token_stat')}
                  name='DisplayTokenStatEnabled'
                  onChange={handleInputChange}
                />
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.ApproximateTokenEnabled === 'true'}
                  label={t('setting.operation.general.approximate_token')}
                  name='ApproximateTokenEnabled'
                  onChange={handleInputChange}
                />
              </Form.Group>
              <Form.Button
                className='router-section-button'
                onClick={() => {
                  submitConfig('general').then();
                }}
              >
                {t('setting.operation.general.buttons.save')}
              </Form.Button>
              {shouldRenderDividerAfter('general') ? <Divider /> : null}
            </>
          ) : null}

          {sectionVisible.billing ? (
            <>
              <Header as='h3' className='router-section-title'>
                {t('setting.operation.billing.title')}
              </Header>
              <div className='router-settings-note'>
                {t('setting.operation.billing.subtitle')}
              </div>
              <div className='router-toolbar router-block-gap-sm'>
                <div className='router-toolbar-start'>
                  <Button
                    className='router-page-button'
                    type='button'
                    onClick={addBillingCurrency}
                    disabled={billingLoading || billingCurrencies.some((item) => item._isNew)}
                  >
                    {t('setting.operation.billing.buttons.add')}
                  </Button>
                </div>
              </div>
              <div className='router-table-scroll-x'>
                <Table
                  compact
                  celled
                  className='router-detail-table router-billing-currency-table'
                >
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell collapsing className='router-billing-code-cell'>
                      {t('setting.operation.billing.columns.code')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('setting.operation.billing.columns.name')}
                    </Table.HeaderCell>
                    <Table.HeaderCell collapsing className='router-billing-symbol-cell'>
                      {t('setting.operation.billing.columns.symbol')}
                    </Table.HeaderCell>
                    <Table.HeaderCell collapsing>
                      {t('setting.operation.billing.columns.minor_unit')}
                    </Table.HeaderCell>
                    <Table.HeaderCell collapsing>
                      {t('setting.operation.billing.columns.yyc_per_unit')}
                    </Table.HeaderCell>
                    <Table.HeaderCell collapsing>
                      {t('setting.operation.billing.columns.status')}
                    </Table.HeaderCell>
                    <Table.HeaderCell collapsing>
                      {t('setting.operation.billing.columns.source')}
                    </Table.HeaderCell>
                    <Table.HeaderCell collapsing>
                      {t('setting.operation.billing.columns.updated_at')}
                    </Table.HeaderCell>
                    <Table.HeaderCell className='router-billing-action-cell'>
                      {t('setting.operation.billing.columns.action')}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {billingLoading ? (
                    <Table.Row>
                      <Table.Cell colSpan={9} textAlign='center' className='router-empty-cell'>
                        {t('common.loading')}
                      </Table.Cell>
                    </Table.Row>
                  ) : billingCurrencies.length === 0 ? (
                    <Table.Row>
                      <Table.Cell colSpan={9} textAlign='center' className='router-empty-cell'>
                        {t('setting.operation.billing.empty')}
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    billingCurrencies.map((row, index) => {
                      const savingKey = row._isNew ? `new-${index}` : row.code;
                      const isSaving = billingSavingKey === savingKey;
                      return (
                        <Table.Row key={row.code || `new-${index}`}>
                          <Table.Cell className='router-billing-code-cell'>
                            <Form.Input
                              className='router-section-input router-billing-code-input'
                              transparent
                              value={row.code || ''}
                              onChange={(e, { value }) =>
                                updateBillingCurrencyField(index, 'code', value)
                              }
                              readOnly={!row._isNew}
                              placeholder='USD'
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <Form.Input
                              className='router-section-input'
                              transparent
                              value={row.name || ''}
                              onChange={(e, { value }) =>
                                updateBillingCurrencyField(index, 'name', value)
                              }
                              placeholder={t('setting.operation.billing.placeholders.name')}
                            />
                          </Table.Cell>
                          <Table.Cell className='router-billing-symbol-cell'>
                            <Form.Input
                              className='router-section-input router-billing-symbol-input'
                              transparent
                              value={row.symbol || ''}
                              onChange={(e, { value }) =>
                                updateBillingCurrencyField(index, 'symbol', value)
                              }
                              placeholder='$'
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <Form.Input
                              className='router-section-input'
                              transparent
                              type='number'
                              min='0'
                              max='8'
                              step='1'
                              value={row.minor_unit}
                              onChange={(e, { value }) =>
                                updateBillingCurrencyField(index, 'minor_unit', value)
                              }
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <Form.Input
                              className='router-section-input'
                              transparent
                              type='number'
                              min='0'
                              step='0.000001'
                              value={row.yyc_per_unit}
                              onChange={(e, { value }) =>
                                updateBillingCurrencyField(index, 'yyc_per_unit', value)
                              }
                              placeholder={t(
                                'setting.operation.billing.placeholders.yyc_per_unit'
                              )}
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <Form.Dropdown
                              className='router-section-input'
                              compact
                              selection
                              options={billingStatusOptions}
                              value={Number(row.status || 1)}
                              onChange={(e, { value }) =>
                                updateBillingCurrencyField(index, 'status', value)
                              }
                            />
                          </Table.Cell>
                          <Table.Cell>{row.source || '-'}</Table.Cell>
                          <Table.Cell>
                            {row.updated_at ? timestamp2string(row.updated_at) : '-'}
                          </Table.Cell>
                          <Table.Cell className='router-billing-action-cell'>
                            <div className='router-action-group'>
                              {row._isNew ? (
                                <Button
                                  className='router-table-action-button'
                                  type='button'
                                  onClick={() => removeNewBillingCurrency(index)}
                                  disabled={isSaving}
                                >
                                  {t('setting.operation.billing.buttons.cancel')}
                                </Button>
                              ) : null}
                              <Button
                                className='router-table-action-button'
                                primary
                                type='button'
                                loading={isSaving}
                                disabled={isSaving}
                                onClick={() => saveBillingCurrency(row, index)}
                              >
                                {t('setting.operation.billing.buttons.save')}
                              </Button>
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })
                  )}
                </Table.Body>
              </Table>
              </div>
            </>
          ) : null}
        </Form>
      </Grid.Column>
    </Grid>
  );
};

export default OperationSetting;
