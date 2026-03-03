import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, Icon, Input, Label, Segment, Table } from 'semantic-ui-react';
import { API, showError, showInfo, showSuccess, timestamp2string } from '../helpers';

const normalizeProvider = (provider) => {
  if (typeof provider !== 'string') return '';
  const trimmed = provider.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  switch (lower) {
    case 'gpt':
    case 'openai':
      return 'openai';
    case 'gemini':
    case 'google':
      return 'google';
    case 'claude':
    case 'anthropic':
      return 'anthropic';
    case 'deepseek':
      return 'deepseek';
    case 'qwen':
    case 'qwq':
    case 'qvq':
      return 'qwen';
    default:
      if (trimmed === '千问') return 'qwen';
      return lower;
  }
};

const textToModels = (text) => {
  if (typeof text !== 'string') return [];
  const parts = text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
  const seen = new Set();
  const models = [];
  parts.forEach((item) => {
    if (seen.has(item)) return;
    seen.add(item);
    models.push(item);
  });
  return models;
};

const modelsToText = (models) => {
  if (!Array.isArray(models)) return '';
  return models.join('\n');
};

const createEmptyRow = () => ({
  provider: '',
  name: '',
  modelsText: '',
  source: 'manual',
  updated_at: 0,
});

const toEditableRows = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    provider: normalizeProvider(item?.provider || item?.name || ''),
    name: item?.name || '',
    modelsText: modelsToText(item?.models || []),
    source: item?.source || 'manual',
    updated_at: item?.updated_at || 0,
  }));
};

const KNOWN_PROVIDER_OPTIONS = [
  { key: 'openai', text: 'OpenAI', value: 'openai' },
  { key: 'google', text: 'Google Gemini', value: 'google' },
  { key: 'anthropic', text: 'Anthropic Claude', value: 'anthropic' },
  { key: 'deepseek', text: 'DeepSeek', value: 'deepseek' },
  { key: 'qwen', text: 'Qwen', value: 'qwen' },
];

const OFFICIAL_PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
};

const ModelProvidersManager = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [fetchingFromApi, setFetchingFromApi] = useState(false);
  const [fetchForm, setFetchForm] = useState({
    provider: '',
    base_url: '',
    key: '',
  });

  const providerOptions = useMemo(() => {
    const options = [...KNOWN_PROVIDER_OPTIONS];
    const seen = new Set(options.map((item) => item.value));
    rows.forEach((row) => {
      const provider = normalizeProvider(row.provider);
      if (!provider || seen.has(provider)) return;
      seen.add(provider);
      options.push({
        key: provider,
        text: provider,
        value: provider,
      });
    });
    return options;
  }, [rows]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/v1/admin/model-provider');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('channel.providers.messages.load_failed'));
        return;
      }
      setRows(toEditableRows(data));
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCatalog().then();
  }, [loadCatalog]);

  const setRowValue = (index, key, value) => {
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        return {
          ...row,
          [key]: value,
        };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const loadDefaults = async () => {
    setLoadingDefaults(true);
    try {
      const res = await API.get('/api/v1/admin/model-provider/defaults');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('channel.providers.messages.load_defaults_failed'));
        return;
      }
      setRows(toEditableRows(data));
      showSuccess(t('channel.providers.messages.defaults_loaded'));
    } catch (error) {
      showError(error);
    } finally {
      setLoadingDefaults(false);
    }
  };

  const saveCatalog = async () => {
    const providers = [];
    for (const row of rows) {
      const provider = normalizeProvider(row.provider);
      const name = (row.name || '').trim();
      const models = textToModels(row.modelsText);
      const hasContent = provider || name || models.length > 0;
      if (!hasContent) continue;
      if (!provider) {
        showInfo(t('channel.providers.messages.provider_required'));
        return;
      }
      providers.push({
        provider,
        name: name || provider,
        models,
        source: row.source || 'manual',
        updated_at: row.updated_at || 0,
      });
    }

    setSaving(true);
    try {
      const res = await API.put('/api/v1/admin/model-provider', {
        providers,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('channel.providers.messages.save_failed'));
        return;
      }
      setRows(toEditableRows(data));
      showSuccess(t('channel.providers.messages.save_success'));
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const fetchModelsFromProviderApi = async () => {
    const provider = normalizeProvider(fetchForm.provider);
    if (!provider) {
      showInfo(t('channel.providers.messages.fetch_provider_required'));
      return;
    }
    if (!fetchForm.key || fetchForm.key.trim() === '') {
      showInfo(t('channel.providers.messages.fetch_key_required'));
      return;
    }
    setFetchingFromApi(true);
    try {
      const res = await API.post('/api/v1/admin/model-provider/fetch', {
        provider,
        base_url: fetchForm.base_url,
        key: fetchForm.key,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('channel.providers.messages.fetch_failed'));
        return;
      }
      const modelText = modelsToText(Array.isArray(data) ? data : []);
      const now = Math.floor(Date.now() / 1000);
      setRows((prev) => {
        const idx = prev.findIndex(
          (row) => normalizeProvider(row.provider) === provider
        );
        if (idx === -1) {
          return [
            ...prev,
            {
              provider,
              name: provider,
              modelsText: modelText,
              source: 'api',
              updated_at: now,
            },
          ];
        }
        return prev.map((row, rowIdx) => {
          if (rowIdx !== idx) return row;
          return {
            ...row,
            provider,
            name: row.name || provider,
            modelsText: modelText,
            source: 'api',
            updated_at: now,
          };
        });
      });
      showSuccess(t('channel.providers.messages.fetch_success'));
    } catch (error) {
      showError(error);
    } finally {
      setFetchingFromApi(false);
    }
  };

  return (
    <div>
      <Segment loading={loading} style={{ marginBottom: '12px' }}>
        <Form>
          <Form.Group widths='equal'>
            <Form.Select
              label={t('channel.providers.fetch.provider')}
              options={providerOptions}
              search
              clearable
              value={fetchForm.provider}
              onChange={(e, { value }) =>
                setFetchForm((prev) => ({
                  ...prev,
                  provider: value || '',
                  base_url: value
                    ? OFFICIAL_PROVIDER_BASE_URLS[normalizeProvider(value)] || ''
                    : '',
                }))
              }
            />
            <Form.Input
              label={t('channel.providers.fetch.base_url')}
              placeholder={t('channel.providers.fetch.base_url_placeholder')}
              value={fetchForm.base_url}
              onChange={(e, { value }) =>
                setFetchForm((prev) => ({
                  ...prev,
                  base_url: value || '',
                }))
              }
            />
          </Form.Group>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('channel.providers.fetch.key')}
              placeholder={t('channel.providers.fetch.key_placeholder')}
              type='password'
              autoComplete='new-password'
              value={fetchForm.key}
              onChange={(e, { value }) =>
                setFetchForm((prev) => ({
                  ...prev,
                  key: value || '',
                }))
              }
            />
          </Form.Group>
          <Button
            type='button'
            color='green'
            loading={fetchingFromApi}
            disabled={fetchingFromApi}
            onClick={fetchModelsFromProviderApi}
          >
            {t('channel.providers.buttons.fetch_from_api')}
          </Button>
        </Form>
      </Segment>

      <div style={{ marginBottom: '12px' }}>
        <Button type='button' onClick={loadCatalog} loading={loading}>
          {t('channel.providers.buttons.reload')}
        </Button>
        <Button
          type='button'
          onClick={loadDefaults}
          loading={loadingDefaults}
          disabled={loadingDefaults}
        >
          {t('channel.providers.buttons.load_defaults')}
        </Button>
        <Button type='button' onClick={addRow}>
          {t('channel.providers.buttons.add_provider')}
        </Button>
        <Button
          type='button'
          color='blue'
          loading={saving}
          disabled={saving}
          onClick={saveCatalog}
        >
          {t('channel.providers.buttons.save')}
        </Button>
      </div>

      <Table celled stackable>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell width={2}>
              {t('channel.providers.table.provider')}
            </Table.HeaderCell>
            <Table.HeaderCell width={2}>
              {t('channel.providers.table.name')}
            </Table.HeaderCell>
            <Table.HeaderCell width={8}>
              {t('channel.providers.table.models')}
            </Table.HeaderCell>
            <Table.HeaderCell width={1}>
              {t('channel.providers.table.source')}
            </Table.HeaderCell>
            <Table.HeaderCell width={2}>
              {t('channel.providers.table.updated_at')}
            </Table.HeaderCell>
            <Table.HeaderCell width={1}>
              {t('channel.providers.table.actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={6} textAlign='center'>
                {t('channel.providers.table.empty')}
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row, index) => {
              const modelCount = textToModels(row.modelsText).length;
              return (
                <Table.Row key={`${row.provider}-${index}`}>
                  <Table.Cell>
                    <Input
                      fluid
                      value={row.provider}
                      placeholder='openai'
                      onChange={(e, { value }) =>
                        setRowValue(index, 'provider', value || '')
                      }
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Input
                      fluid
                      value={row.name}
                      placeholder={t('channel.providers.table.name_placeholder')}
                      onChange={(e, { value }) =>
                        setRowValue(index, 'name', value || '')
                      }
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Form.TextArea
                      style={{
                        minHeight: 110,
                        fontFamily: 'JetBrains Mono, Consolas',
                      }}
                      placeholder={t('channel.providers.table.models_placeholder')}
                      value={row.modelsText}
                      onChange={(e, { value }) =>
                        setRowValue(index, 'modelsText', value || '')
                      }
                    />
                    <Label basic size='tiny'>
                      {t('channel.providers.table.model_count', { count: modelCount })}
                    </Label>
                  </Table.Cell>
                  <Table.Cell textAlign='center'>
                    <Label>{row.source || '-'}</Label>
                  </Table.Cell>
                  <Table.Cell textAlign='center'>
                    {row.updated_at ? timestamp2string(row.updated_at) : '-'}
                  </Table.Cell>
                  <Table.Cell textAlign='center'>
                    <Button
                      type='button'
                      icon
                      size='tiny'
                      color='red'
                      onClick={() => removeRow(index)}
                    >
                      <Icon name='trash' />
                    </Button>
                  </Table.Cell>
                </Table.Row>
              );
            })
          )}
        </Table.Body>
      </Table>
    </div>
  );
};

export default ModelProvidersManager;
