import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Divider, Form, Grid, Header, Table } from 'semantic-ui-react';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
} from '../helpers';

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
    FXAutoSyncEnabled: '',
    FXAutoSyncIntervalSeconds: 21600,
    FXAutoSyncProvider: 'frankfurter',
    RetryTimes: 0,
  });
  const [originInputs, setOriginInputs] = useState({});
  const [groupOptions, setGroupOptions] = useState([]);
  const [billingCurrencies, setBillingCurrencies] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSyncing, setBillingSyncing] = useState(false);
  const [billingSavingKey, setBillingSavingKey] = useState('');
  const [fxSyncStatus, setFxSyncStatus] = useState({
    last_run_at: 0,
    last_success_at: 0,
    last_error: '',
    min_interval: 60,
  });
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
    loadFXSyncStatus().then();
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
      setBillingCurrencies(rows);
    } catch (error) {
      showError(
        error?.message || t('setting.operation.billing.messages.load_failed')
      );
    } finally {
      setBillingLoading(false);
    }
  };

  const loadFXSyncStatus = async () => {
    try {
      const res = await API.get('/api/v1/admin/billing/fx/status');
      const { success, data } = res.data || {};
      if (!success || !data) {
        return;
      }
      setFxSyncStatus({
        last_run_at: Number(data.last_run_at || 0),
        last_success_at: Number(data.last_success_at || 0),
        last_error: (data.last_error || '').toString(),
        min_interval: Number(data.min_interval || 60),
      });
    } catch (error) {
      // ignore status loading failure to avoid interrupting normal settings flow
    }
  };

  const updateOption = async (key, value) => {
    setLoading(true);
    if (key.endsWith('Enabled')) {
      value = inputs[key] === 'true' ? 'false' : 'true';
    }
    const res = await API.put('/api/v1/admin/option/', {
      key,
      value,
    });
    const { success, message } = res.data;
    if (success) {
      setInputs((inputs) => ({ ...inputs, [key]: value }));
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
        if (originInputs['QuotaForNewUser'] !== inputs.QuotaForNewUser) {
          await updateOption('QuotaForNewUser', inputs.QuotaForNewUser);
        }
        if (originInputs['DefaultUserGroup'] !== inputs.DefaultUserGroup) {
          await updateOption('DefaultUserGroup', inputs.DefaultUserGroup);
        }
        if (originInputs['QuotaForInvitee'] !== inputs.QuotaForInvitee) {
          await updateOption('QuotaForInvitee', inputs.QuotaForInvitee);
        }
        if (originInputs['QuotaForInviter'] !== inputs.QuotaForInviter) {
          await updateOption('QuotaForInviter', inputs.QuotaForInviter);
        }
        if (originInputs['PreConsumedQuota'] !== inputs.PreConsumedQuota) {
          await updateOption('PreConsumedQuota', inputs.PreConsumedQuota);
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
      case 'billing':
        const intervalSeconds = Number.parseInt(
          inputs.FXAutoSyncIntervalSeconds ?? '',
          10
        );
        if (!Number.isFinite(intervalSeconds) || intervalSeconds < 60) {
          showError(t('setting.operation.billing.messages.sync_interval_invalid'));
          return;
        }
        if (
          `${originInputs['FXAutoSyncIntervalSeconds'] || ''}` !==
          `${intervalSeconds}`
        ) {
          await updateOption(
            'FXAutoSyncIntervalSeconds',
            `${intervalSeconds}`
          );
        }
        if (
          `${originInputs['FXAutoSyncProvider'] || ''}` !== 'frankfurter'
        ) {
          await updateOption('FXAutoSyncProvider', 'frankfurter');
        }
        await loadFXSyncStatus();
        break;
      default:
        break;
    }
  };

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

  const syncBillingCurrenciesFromFX = async () => {
    setBillingSyncing(true);
    try {
      const res = await API.post('/api/v1/admin/billing/fx/sync');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('setting.operation.billing.messages.sync_failed'));
        return;
      }
      const updatedCount = Number(data?.updated_count || 0);
      showSuccess(
        t('setting.operation.billing.messages.sync_success', {
          count: updatedCount,
        })
      );
      await loadBillingCurrencies();
      await loadFXSyncStatus();
      await getOptions();
    } catch (error) {
      showError(error?.message || t('setting.operation.billing.messages.sync_failed'));
    } finally {
      setBillingSyncing(false);
    }
  };

  const renderTimestampValue = (value) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) {
      return '-';
    }
    return timestamp2string(number);
  };

  return (
    <Grid columns={1}>
      <Grid.Column>
        <Form loading={loading}>
          {sectionVisible.quota ? (
            <>
              <Header as='h3' className='router-section-title'>{t('setting.operation.quota.title')}</Header>
              <Form.Group widths='equal'>
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.quota.new_user')}
                  name='QuotaForNewUser'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.QuotaForNewUser}
                  type='number'
                  min='0'
                  placeholder={t('setting.operation.quota.new_user_placeholder')}
                />
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
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.quota.pre_consume')}
                  name='PreConsumedQuota'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.PreConsumedQuota}
                  type='number'
                  min='0'
                  placeholder={t('setting.operation.quota.pre_consume_placeholder')}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.quota.inviter_reward')}
                  name='QuotaForInviter'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.QuotaForInviter}
                  type='number'
                  min='0'
                  placeholder={t(
                    'setting.operation.quota.inviter_reward_placeholder'
                  )}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.quota.invitee_reward')}
                  name='QuotaForInvitee'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.QuotaForInvitee}
                  type='number'
                  min='0'
                  placeholder={t(
                    'setting.operation.quota.invitee_reward_placeholder'
                  )}
                />
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
              <Form.Group widths='equal'>
                <Form.Checkbox
                  className='router-section-checkbox'
                  checked={inputs.FXAutoSyncEnabled === 'true'}
                  label={t('setting.operation.billing.auto_sync.enabled')}
                  name='FXAutoSyncEnabled'
                  onChange={handleInputChange}
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.billing.auto_sync.interval_seconds')}
                  name='FXAutoSyncIntervalSeconds'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.FXAutoSyncIntervalSeconds}
                  type='number'
                  min={fxSyncStatus.min_interval || 60}
                  step='1'
                  placeholder='21600'
                />
                <Form.Input
                  className='router-section-input'
                  label={t('setting.operation.billing.auto_sync.provider')}
                  name='FXAutoSyncProvider'
                  value='frankfurter'
                  readOnly
                />
              </Form.Group>
              <Form.Button
                className='router-section-button'
                onClick={() => {
                  submitConfig('billing').then();
                }}
              >
                {t('setting.operation.billing.buttons.save_auto_sync')}
              </Form.Button>
              <div className='router-settings-note'>
                {t('setting.operation.billing.auto_sync.last_run', {
                  value: renderTimestampValue(fxSyncStatus.last_run_at),
                })}
              </div>
              <div className='router-settings-note'>
                {t('setting.operation.billing.auto_sync.last_success', {
                  value: renderTimestampValue(fxSyncStatus.last_success_at),
                })}
              </div>
              {fxSyncStatus.last_error ? (
                <div className='router-settings-note'>
                  {t('setting.operation.billing.auto_sync.last_error', {
                    value: fxSyncStatus.last_error,
                  })}
                </div>
              ) : null}
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
                  <Button
                    className='router-page-button'
                    type='button'
                    onClick={syncBillingCurrenciesFromFX}
                    loading={billingSyncing}
                    disabled={
                      billingLoading ||
                      billingSyncing ||
                      billingCurrencies.some((item) => item._isNew)
                    }
                  >
                    {t('setting.operation.billing.buttons.sync_fx')}
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
