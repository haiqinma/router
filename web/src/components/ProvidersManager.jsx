import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showInfo,
  showSuccess,
  timestamp2string,
} from '../helpers';
import { AppButton, AppDetailSection, AppEmpty, AppErrorState, AppField, AppFilterHeader, AppFormActions, AppFormRow, AppIcon, AppInput, AppInputNumber, AppModal, AppPagination, AppSelect, AppSpin, AppTable, AppTableActionButton, AppTabs, AppTag, AppTextarea, AppToolbar } from '../router-ui';
import useUrlState from '../hooks/useUrlState';
import {
  PROVIDER_DETAIL_MODEL_PAGE_SIZE,
  PROVIDER_CATALOG_REQUEST_PAGE_SIZE,
  PROVIDER_MODEL_STATUS_FILTER_ALL,
  OFFICIAL_PROVIDER_BASE_URLS,
  MODEL_TAG_OPTIONS,
  PROVIDER_MODEL_STATUS_OPTIONS,
  PRICE_UNIT_OPTIONS,
  PRICE_COMPONENT_OPTIONS,
  SOURCE_OPTIONS,
  TEXT_ENDPOINT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  formatProviderModelUsageError,
  normalizeProvider,
  formatProviderDisplayId,
  formatProviderDisplayName,
  ProviderBrandMark,
  buildPriceComponentRowKey,
  defaultPriceUnitByType,
  defaultPriceUnitByComponent,
  normalizeProviderModelTags,
  providerModelTypeFromTags,
  normalizeSupportedEndpoints,
  createEmptyPriceComponent,
  createEmptyModelDetail,
  normalizeModelDetails,
  createEmptyRow,
  toEditableRows,
  cloneEditableRow,
  cloneModelDetail,
  providerEndpointOptionsForType,
  parseConditionString,
  buildConditionString,
  formatProviderPriceCellValue,
  renderProviderPriceCell,
  renderProviderSourceUrlCell,
} from './ProvidersManager.helpers';

const ProvidersManager = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [{ keyword: searchKeyword }, patchQuery] = useUrlState({
    keyword: { param: 'q', default: '' },
  });
  const [creating, setCreating] = useState(false);
  const [createRow, setCreateRow] = useState(createEmptyRow());
  const [viewingProvider, setViewingProvider] = useState('');
  const [viewRow, setViewRow] = useState(null);
  const [activeProviderDetailTab, setActiveProviderDetailTab] = useState('basic');
  const [viewModelSearchKeyword, setViewModelSearchKeyword] = useState('');
  const [viewModelStatusFilter, setViewModelStatusFilter] = useState(
    PROVIDER_MODEL_STATUS_FILTER_ALL,
  );
  const [viewModelPage, setViewModelPage] = useState(1);
  const [viewModelPageSize, setViewModelPageSize] = useState(
    PROVIDER_DETAIL_MODEL_PAGE_SIZE,
  );
  const [viewModelBatchDeleteMode, setViewModelBatchDeleteMode] = useState(false);
  const [viewModelBatchDeleteKeys, setViewModelBatchDeleteKeys] = useState([]);
  const [detailEditingSection, setDetailEditingSection] = useState('');
  const [detailBasicDraft, setDetailBasicDraft] = useState(createEmptyRow());
  const [detailModelsDraft, setDetailModelsDraft] = useState(createEmptyRow());
  const [detailEditingModelIndex, setDetailEditingModelIndex] = useState(-1);
  const [modelDetailEditorOpen, setModelDetailEditorOpen] = useState(false);
  const [modelDetailEditorMode, setModelDetailEditorMode] = useState('edit');
  const [pricingDetailOpen, setPricingDetailOpen] = useState(false);
  const [pricingDetailModel, setPricingDetailModel] = useState(null);
  const [modelDeleteConfirmOpen, setModelDeleteConfirmOpen] = useState(false);
  const [pendingModelDeleteIndex, setPendingModelDeleteIndex] = useState(-1);
  const [modelBatchDeleteConfirmOpen, setModelBatchDeleteConfirmOpen] = useState(false);
  const [pendingModelBatchDeleteIndexes, setPendingModelBatchDeleteIndexes] = useState([]);

  const normalizedSearchKeyword = useMemo(
    () => (typeof searchKeyword === 'string' ? searchKeyword.trim() : ''),
    [searchKeyword],
  );

  const loadCatalog = useCallback(
    async (keyword, options = {}) => {
      const withRefreshIndicator = options.withRefreshIndicator === true;
      setLoadError(false);
      setLoading(true);
      if (withRefreshIndicator) {
        setRefreshing(true);
      }
      try {
        const items = [];
        let page = 1;
        let total = 0;

        do {
          const res = await API.get('/api/v1/admin/providers', {
            params: {
              page,
              page_size: PROVIDER_CATALOG_REQUEST_PAGE_SIZE,
              keyword: keyword || undefined,
            },
          });
          const { success, message, data } = res.data || {};
          if (!success) {
            showError(message || t('channel.providers.messages.load_failed'));
            return;
          }
          const pageItems = Array.isArray(data?.items) ? data.items : [];
          items.push(...pageItems);
          total = Number(data?.total || items.length);
          page += 1;
          if (pageItems.length === 0) break;
        } while (items.length < total);

        setRows(
          toEditableRows(items).sort(
            (left, right) =>
              Number(right.created_at || 0) - Number(left.created_at || 0),
          ),
        );
      } catch (error) {
        setLoadError(true);
        showError(error);
      } finally {
        setLoading(false);
        if (withRefreshIndicator) {
          setRefreshing(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    loadCatalog(normalizedSearchKeyword).then();
  }, [normalizedSearchKeyword, loadCatalog]);

  const setCreateValue = (key, value) => {
    setCreateRow((prev) => ({
      ...prev,
      [key]: typeof value === 'function' ? value(prev[key], prev) : value,
    }));
  };

  const resetDetailEditingState = useCallback(() => {
    setDetailEditingSection('');
    setDetailBasicDraft(createEmptyRow());
    setDetailModelsDraft(createEmptyRow());
    setDetailEditingModelIndex(-1);
    setModelDetailEditorOpen(false);
    setModelDetailEditorMode('edit');
  }, []);

  const openCreatePanel = () => {
    if (creating || saving) return;
    setViewingProvider('');
    setViewRow(null);
    resetDetailEditingState();
    setCreateRow(createEmptyRow());
    setCreating(true);
  };

  const closeCreatePanel = () => {
    setCreating(false);
    setCreateRow(createEmptyRow());
  };

  const openViewer = (row) => {
    if (creating || saving) return;
    const normalized = normalizeProvider(row?.id || '');
    if (!normalized) return;
    setViewModelSearchKeyword('');
    setViewModelStatusFilter(PROVIDER_MODEL_STATUS_FILTER_ALL);
    setViewModelPage(1);
    setActiveProviderDetailTab('basic');
    resetDetailEditingState();
    setViewingProvider(normalized);
    setViewRow(cloneEditableRow(row));
  };

  const closeViewer = () => {
    setViewModelSearchKeyword('');
    setViewModelStatusFilter(PROVIDER_MODEL_STATUS_FILTER_ALL);
    setViewModelPage(1);
    setActiveProviderDetailTab('basic');
    setViewingProvider('');
    setViewRow(null);
    resetDetailEditingState();
  };

  const startDetailSectionEdit = useCallback(
    (section, row = null) => {
      const sourceRow = cloneEditableRow(row || viewRow);
      if (!sourceRow?.id || saving || creating) {
        return;
      }
      setDetailEditingSection(section);
      if (section === 'basic') {
        setDetailBasicDraft(sourceRow);
      }
    },
    [creating, saving, viewRow],
  );

  const cancelDetailSectionEdit = useCallback(() => {
    resetDetailEditingState();
  }, [resetDetailEditingState]);

  const setDetailBasicValue = (key, value) => {
    setDetailBasicDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const setDetailModelsValue = (key, value) => {
    setDetailModelsDraft((prev) => ({
      ...prev,
      [key]: typeof value === 'function' ? value(prev[key], prev) : value,
    }));
  };

  const openPricingDetail = useCallback((detail) => {
    setPricingDetailModel(detail || null);
    setPricingDetailOpen(true);
  }, []);

  const closePricingDetail = useCallback(() => {
    setPricingDetailOpen(false);
    setPricingDetailModel(null);
  }, []);

  const setModelDetailField = (setter, _row, index, key, value) => {
    setter('model_details', (currentDetails) => {
      const details = Array.isArray(currentDetails) ? [...currentDetails] : [];
      if (index < 0 || index >= details.length) return details;
      const next = { ...details[index] };
      if (key === 'input_price' || key === 'output_price') {
        next[key] = value === null || value === undefined ? '' : `${value}`;
      } else if (key === 'currency') {
        next[key] = (value || '').toUpperCase();
      } else if (key === 'source') {
        next[key] = (value || '').toLowerCase();
      } else if (key === 'tags') {
        next.tags = normalizeProviderModelTags(value, next.model || '');
        const normalizedType = providerModelTypeFromTags(
          next.tags,
          next.model || '',
        );
        next.supported_endpoints = normalizeSupportedEndpoints(
          next.supported_endpoints,
          normalizedType,
        );
        if (!next.price_unit) {
          next.price_unit = defaultPriceUnitByType(
            normalizedType,
            next.model || '',
          );
        }
      } else if (key === 'model') {
        next.model = value || '';
        next.tags = normalizeProviderModelTags(next.tags, next.model);
        const normalizedType = providerModelTypeFromTags(
          next.tags,
          next.model,
        );
        next.supported_endpoints = normalizeSupportedEndpoints(
          next.supported_endpoints,
          normalizedType,
        );
        if (!next.price_unit) {
          next.price_unit = defaultPriceUnitByType(normalizedType, next.model);
        }
      } else if (key === 'supported_endpoints') {
        next.supported_endpoints = normalizeSupportedEndpoints(
          value,
          providerModelTypeFromTags(next.tags, next.model),
        );
      } else {
        next[key] = value || '';
      }
      details[index] = next;
      return details;
    });
  };

  const setPriceComponentField = (
    setter,
    row,
    detailIndex,
    componentIndex,
    key,
    value,
  ) => {
    setter('model_details', (currentDetails) => {
      const details = Array.isArray(currentDetails) ? [...currentDetails] : [];
      if (detailIndex < 0 || detailIndex >= details.length) return details;
      const detail = { ...details[detailIndex] };
      const components = Array.isArray(detail.price_components)
        ? [...detail.price_components]
        : [];
      if (componentIndex < 0 || componentIndex >= components.length) {
        return details;
      }
      const next = { ...components[componentIndex] };
      if (key === 'input_price' || key === 'output_price') {
        next[key] = value === null || value === undefined ? '' : `${value}`;
      } else if (key === 'sort_order') {
        next[key] = value === null || value === undefined ? '' : `${value}`;
      } else if (key === 'currency') {
        next[key] = (value || '').toUpperCase();
      } else if (key === 'source') {
        next[key] = (value || '').toLowerCase();
      } else if (key === 'component') {
        next.component = (value || '').toLowerCase();
        next.condition = '';
        next.price_unit = defaultPriceUnitByComponent(next.component);
      } else {
        next[key] = value || '';
      }
      components[componentIndex] = next;
      detail.price_components = components;
      details[detailIndex] = detail;
      return details;
    });
  };

  const updatePriceComponentConditionTemplate = (
    setter,
    row,
    detailIndex,
    componentIndex,
    attrs,
    orderedKeys,
  ) => {
    const nextCondition = buildConditionString(attrs, orderedKeys);
    setPriceComponentField(
      setter,
      row,
      detailIndex,
      componentIndex,
      'condition',
      nextCondition,
    );
  };

  const renderPriceComponentConditionTemplate = (
    setter,
    row,
    detailIndex,
    componentIndex,
    component,
    disabled,
  ) => {
    const componentType = (component?.component || '')
      .toString()
      .trim()
      .toLowerCase();
    const attrs = parseConditionString(component?.condition || '');
    if (componentType === 'text') {
      return (
        <div className='router-block-top-sm'>
          <AppSelect
            className='router-inline-dropdown'
            options={TEXT_ENDPOINT_OPTIONS}
            placeholder={t(
              'channel.providers.price_component_table.template.endpoint',
            )}
            value={attrs.endpoint || ''}
            disabled={disabled}
            clearable
            onChange={(e, { value }) => {
              updatePriceComponentConditionTemplate(
                setter,
                row,
                detailIndex,
                componentIndex,
                { endpoint: value || '' },
                ['endpoint'],
              );
            }}
          />
        </div>
      );
    }
    if (componentType === 'image_generation') {
      return (
        <div className='router-block-top-sm'>
          <div className='router-provider-inline-grid'>
            <AppSelect
              className='router-inline-dropdown'
              options={IMAGE_QUALITY_OPTIONS}
              placeholder={t(
                'channel.providers.price_component_table.template.quality',
              )}
              value={attrs.quality || ''}
              disabled={disabled}
              clearable
              onChange={(e, { value }) => {
                updatePriceComponentConditionTemplate(
                  setter,
                  row,
                  detailIndex,
                  componentIndex,
                  { quality: value || '', size: attrs.size || '' },
                  ['quality', 'size'],
                );
              }}
            />
            <AppSelect
              className='router-inline-dropdown'
              options={IMAGE_SIZE_OPTIONS}
              placeholder={t(
                'channel.providers.price_component_table.template.size',
              )}
              value={attrs.size || ''}
              disabled={disabled}
              clearable
              onChange={(e, { value }) => {
                updatePriceComponentConditionTemplate(
                  setter,
                  row,
                  detailIndex,
                  componentIndex,
                  { quality: attrs.quality || '', size: value || '' },
                  ['quality', 'size'],
                );
              }}
            />
          </div>
        </div>
      );
    }
    if (
      componentType === 'audio_input' ||
      componentType === 'audio_output' ||
      componentType === 'video_generation' ||
      componentType === 'text_cache_read' ||
      componentType === 'text_cache_write' ||
      componentType === 'realtime_text' ||
      componentType === 'realtime_audio'
    ) {
      return (
        <div className='router-block-top-sm'>
          {t('channel.providers.price_component_table.template.no_condition')}
        </div>
      );
    }
    return null;
  };

  const addPriceComponentRow = (setter, _row, detailIndex) => {
    setter('model_details', (currentDetails) => {
      const details = Array.isArray(currentDetails) ? [...currentDetails] : [];
      if (detailIndex < 0 || detailIndex >= details.length) return details;
      const detail = { ...details[detailIndex] };
      const components = Array.isArray(detail.price_components)
        ? [...detail.price_components]
        : [];
      components.push(createEmptyPriceComponent('text'));
      detail.price_components = components;
      details[detailIndex] = detail;
      return details;
    });
  };

  const removePriceComponentRow = (
    setter,
    _row,
    detailIndex,
    componentIndex,
  ) => {
    setter('model_details', (currentDetails) => {
      const details = Array.isArray(currentDetails) ? [...currentDetails] : [];
      if (detailIndex < 0 || detailIndex >= details.length) return details;
      const detail = { ...details[detailIndex] };
      const components = Array.isArray(detail.price_components)
        ? [...detail.price_components]
        : [];
      if (componentIndex < 0 || componentIndex >= components.length) {
        return details;
      }
      components.splice(componentIndex, 1);
      detail.price_components = components;
      details[detailIndex] = detail;
      return details;
    });
  };

  const addModelDetailRow = (setter, _row) => {
    setter('model_details', (currentDetails) => {
      const details = Array.isArray(currentDetails) ? [...currentDetails] : [];
      details.unshift(createEmptyModelDetail(''));
      return details;
    });
  };

  const removeModelDetailRow = (setter, _row, index) => {
    setter('model_details', (currentDetails) => {
      const details = Array.isArray(currentDetails) ? [...currentDetails] : [];
      if (index < 0 || index >= details.length) return details;
      details.splice(index, 1);
      return details;
    });
  };

  const reloadCatalog = async () => {
    await loadCatalog(normalizedSearchKeyword, {
      withRefreshIndicator: true,
    });
  };

  const persistViewerModelDetails = useCallback(
    async (modelDetails) => {
      const sourceRow = cloneEditableRow(viewRow);
      const provider = normalizeProvider(sourceRow.id);
      if (!provider) {
        showInfo(t('channel.providers.messages.provider_required'));
        return null;
      }
      const saved = await saveProvider(
        'put',
        `/api/v1/admin/providers/${provider}`,
        {
          ...sourceRow,
          model_details: normalizeModelDetails(modelDetails || []),
          updated_at: Math.floor(Date.now() / 1000),
        },
      );
      if (saved) {
        setViewingProvider(saved.id || '');
        setViewRow(saved);
        resetDetailEditingState();
      }
      return saved;
    },
    [resetDetailEditingState, saveProvider, t, viewRow],
  );

  const closeModelDetailEditor = useCallback(() => {
    if (saving) {
      return;
    }
    resetDetailEditingState();
  }, [resetDetailEditingState, saving]);

  const startDetailModelEdit = useCallback(
    (index) => {
      const sourceRow = cloneEditableRow(viewRow);
      const details = Array.isArray(sourceRow.model_details)
        ? sourceRow.model_details
        : [];
      if (
        saving ||
        creating ||
        !sourceRow?.id ||
        index < 0 ||
        index >= details.length
      ) {
        return;
      }
      setDetailEditingSection('models');
      setDetailModelsDraft(sourceRow);
      setDetailEditingModelIndex(index);
      setModelDetailEditorMode('edit');
      setModelDetailEditorOpen(true);
    },
    [creating, saving, viewRow],
  );

  const startDetailModelCreate = useCallback(() => {
    const sourceRow = cloneEditableRow(viewRow);
    if (saving || creating || !sourceRow?.id) {
      return;
    }
    const nextDetails = [
      createEmptyModelDetail(''),
      ...(Array.isArray(sourceRow.model_details)
        ? sourceRow.model_details
        : []),
    ];
    setDetailEditingSection('models');
    setDetailModelsDraft({
      ...sourceRow,
      model_details: nextDetails,
    });
    setDetailEditingModelIndex(0);
    setModelDetailEditorMode('create');
    setModelDetailEditorOpen(true);
    setViewModelSearchKeyword('');
    setViewModelStatusFilter(PROVIDER_MODEL_STATUS_FILTER_ALL);
    setViewModelPage(1);
  }, [creating, saving, viewRow]);

  const saveDetailModelEdit = useCallback(async () => {
    const currentDetails = Array.isArray(detailModelsDraft.model_details)
      ? detailModelsDraft.model_details
      : [];
    const currentDetail =
      detailEditingModelIndex >= 0 &&
      detailEditingModelIndex < currentDetails.length
        ? cloneModelDetail(currentDetails[detailEditingModelIndex])
        : null;
    if (!currentDetail?.model) {
      showInfo(t('channel.providers.messages.model_required'));
      return;
    }
    await persistViewerModelDetails(currentDetails);
  }, [
    detailEditingModelIndex,
    detailModelsDraft.model_details,
    persistViewerModelDetails,
    t,
  ]);

  const requestDeleteDetailModel = useCallback(
    (index) => {
      if (saving || creating || index < 0) {
        return;
      }
      setPendingModelDeleteIndex(index);
      setModelDeleteConfirmOpen(true);
    },
    [creating, saving],
  );

  const performDeleteDetailModel = useCallback(async () => {
    const index = pendingModelDeleteIndex;
    if (saving || creating || index < 0) {
      setModelDeleteConfirmOpen(false);
      setPendingModelDeleteIndex(-1);
      return;
    }
    const sourceRow = cloneEditableRow(viewRow);
    const details = Array.isArray(sourceRow.model_details)
      ? [...sourceRow.model_details]
      : [];
    if (index >= details.length) {
      setModelDeleteConfirmOpen(false);
      setPendingModelDeleteIndex(-1);
      return;
    }
    details.splice(index, 1);
    try {
      await persistViewerModelDetails(details);
    } finally {
      setModelDeleteConfirmOpen(false);
      setPendingModelDeleteIndex(-1);
    }
  }, [
    creating,
    pendingModelDeleteIndex,
    persistViewerModelDetails,
    saving,
    viewRow,
  ]);

  const requestDeleteDetailModels = useCallback(
    (indexes) => {
      if (saving || creating) {
        return;
      }
      const normalizedIndexes = Array.from(
        new Set(
          (Array.isArray(indexes) ? indexes : [])
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item >= 0),
        ),
      );
      if (normalizedIndexes.length === 0) {
        return;
      }
      setPendingModelBatchDeleteIndexes(normalizedIndexes);
      setModelBatchDeleteConfirmOpen(true);
    },
    [creating, saving],
  );

  const performDeleteDetailModels = useCallback(async () => {
    const sourceRow = cloneEditableRow(viewRow);
    const details = Array.isArray(sourceRow.model_details)
      ? [...sourceRow.model_details]
      : [];
    const normalizedIndexes = Array.from(
      new Set(
        pendingModelBatchDeleteIndexes
          .map((item) => Number(item))
          .filter(
            (item) => Number.isInteger(item) && item >= 0 && item < details.length,
          ),
      ),
    ).sort((a, b) => b - a);
    if (normalizedIndexes.length === 0) {
      setModelBatchDeleteConfirmOpen(false);
      setPendingModelBatchDeleteIndexes([]);
      return false;
    }
    normalizedIndexes.forEach((index) => {
      details.splice(index, 1);
    });
    try {
      await persistViewerModelDetails(details);
      setViewModelBatchDeleteKeys([]);
      setViewModelBatchDeleteMode(false);
      return true;
    } finally {
      setModelBatchDeleteConfirmOpen(false);
      setPendingModelBatchDeleteIndexes([]);
    }
  }, [
    creating,
    pendingModelBatchDeleteIndexes,
    persistViewerModelDetails,
    saving,
    viewRow,
  ]);

  async function saveProvider(method, url, row, options = {}) {
    const provider = normalizeProvider(row.id);
    if (!provider) {
      showInfo(t('channel.providers.messages.provider_required'));
      return null;
    }
    const payload = {
      id: provider,
      name: (row.name || '').trim() || formatProviderDisplayName(provider, '') || provider,
      base_url:
        (row.base_url || '').trim() ||
        OFFICIAL_PROVIDER_BASE_URLS[provider] ||
        '',
      official_url: (row.official_url || '').trim(),
      pricing_url: (row.pricing_url || '').trim(),
      model_details: normalizeModelDetails(row.model_details || []),
      source: row.source || 'manual',
      updated_at: row.updated_at || 0,
    };
    setSaving(true);
    try {
      const res = await API({
        method,
        url,
        data: payload,
        skipErrorHandler: true,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('channel.providers.messages.save_failed'));
        return null;
      }
      const savedRow = toEditableRows([data])[0] || null;
      showSuccess(
        options.successMessage || t('channel.providers.messages.save_success'),
      );
      await reloadCatalog();
      return savedRow;
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        t('channel.providers.messages.save_failed');
      const formattedUsageError = formatProviderModelUsageError(message, t);
      showError(formattedUsageError || message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  const closeModelDeleteModal = () => {
    if (saving || creating) return;
    setModelDeleteConfirmOpen(false);
    setPendingModelDeleteIndex(-1);
  };

  const closeModelBatchDeleteModal = () => {
    if (saving || creating) return;
    setModelBatchDeleteConfirmOpen(false);
    setPendingModelBatchDeleteIndexes([]);
  };

  const saveViewerSection = async (section) => {
    const sourceRow = cloneEditableRow(viewRow);
    const provider = normalizeProvider(sourceRow.id);
    if (!provider) {
      showInfo(t('channel.providers.messages.provider_required'));
      return;
    }
    let normalizedRow = {
      ...sourceRow,
      id: provider,
      name: (sourceRow.name || '').trim() || provider,
      base_url:
        (sourceRow.base_url || '').trim() ||
        OFFICIAL_PROVIDER_BASE_URLS[provider] ||
        '',
      official_url: (sourceRow.official_url || '').trim(),
      pricing_url: (sourceRow.pricing_url || '').trim(),
      model_details: normalizeModelDetails(sourceRow.model_details || []),
      source: sourceRow.source || 'manual',
      updated_at: Math.floor(Date.now() / 1000),
    };
    if (section === 'basic') {
      normalizedRow = {
        ...normalizedRow,
        name:
          (detailBasicDraft.name || '').trim() ||
          formatProviderDisplayName(provider, '') ||
          provider,
        base_url:
          (detailBasicDraft.base_url || '').trim() ||
          OFFICIAL_PROVIDER_BASE_URLS[provider] ||
          '',
        official_url: (detailBasicDraft.official_url || '').trim(),
        pricing_url: (detailBasicDraft.pricing_url || '').trim(),
      };
    }
    if (section === 'models') {
      normalizedRow = {
        ...normalizedRow,
        model_details: normalizeModelDetails(
          detailModelsDraft.model_details || [],
        ),
      };
    }
    const saved = await saveProvider(
      'put',
      `/api/v1/admin/providers/${provider}`,
      normalizedRow,
    );
    if (saved) {
      setViewingProvider(saved.id || '');
      setViewRow(saved);
      resetDetailEditingState();
    }
  };

  const applyCreateToRows = async () => {
    const provider = normalizeProvider(createRow.id);
    if (!provider) {
      showInfo(t('channel.providers.messages.provider_required'));
      return;
    }
    const normalizedRow = {
      ...createRow,
      id: provider,
      name:
        (createRow.name || '').trim() ||
        formatProviderDisplayName(provider, '') ||
        provider,
      base_url:
        (createRow.base_url || '').trim() ||
        OFFICIAL_PROVIDER_BASE_URLS[provider] ||
        '',
      official_url: (createRow.official_url || '').trim(),
      pricing_url: (createRow.pricing_url || '').trim(),
      model_details: normalizeModelDetails(createRow.model_details || []),
      source: createRow.source || 'manual',
      updated_at: Math.floor(Date.now() / 1000),
    };
    const saved = await saveProvider(
      'post',
      '/api/v1/admin/providers',
      normalizedRow,
    );
    if (saved) {
      closeCreatePanel();
      setViewingProvider(saved.id || '');
      setViewRow(saved);
    }
  };

  const renderModelDetailsTable = (
    row,
    setValueFn,
    disabled = false,
    options = {},
  ) => {
    const details = Array.isArray(row.model_details) ? row.model_details : [];
    const searchable = options.searchable === true;
    const modelSearchKeyword =
      typeof options.searchKeyword === 'string' ? options.searchKeyword : '';
    const hideTitle = options.hideTitle === true;
    const showToolbar = options.showToolbar !== false;
    const normalizedModelSearchKeyword = modelSearchKeyword
      .trim()
      .toLowerCase();
    const detailRows = details.map((detail, index) => ({ detail, index }));
    let visibleDetailRows =
      normalizedModelSearchKeyword === ''
        ? detailRows
        : detailRows.filter(({ detail }) => {
            const haystack = [
              detail.model || '',
              detail.description || '',
              detail.status || '',
              (detail.tags || []).join(','),
              (detail.supported_endpoints || []).join(','),
              detail.price_unit || '',
              detail.currency || '',
            ]
              .join(' ')
              .toLowerCase();
            return haystack.includes(normalizedModelSearchKeyword);
          });
    const renderEditablePriceComponentsTable = (
      detail,
      detailIndex,
      setFieldValue,
      targetRow,
      isDisabled,
    ) => (
      <AppTable
        className='router-detail-subtable'
        size='small'
        pagination={false}
        rowKey={(component) =>
          buildPriceComponentRowKey(detail.model, component)
        }
        dataSource={detail.price_components || []}
        locale={{
          emptyText: t('channel.providers.price_component_table.empty'),
        }}
        scroll={{ x: 1320 }}
        columns={[
          {
            title: t('channel.providers.price_component_table.component'),
            key: 'component',
            width: 180,
            render: (_, component, componentIndex) => (
              <AppSelect
                className='router-inline-dropdown'
                options={PRICE_COMPONENT_OPTIONS}
                value={component.component || 'text'}
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'component',
                    value || '',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.condition'),
            key: 'condition',
            width: 320,
            render: (_, component, componentIndex) => (
              <div>
                <div className='router-provider-inline-field'>
                  <AppInput
                    className='router-inline-input'
                    placeholder='quality=hd;size=1024x1024'
                    value={component.condition || ''}
                    disabled={isDisabled}
                    onChange={(e, { value }) =>
                      setPriceComponentField(
                        setFieldValue,
                        targetRow,
                        detailIndex,
                        componentIndex,
                        'condition',
                        value || '',
                      )
                    }
                  />
                  <AppButton
                    type='button'
                    className='router-inline-button'
                    basic
                    disabled={isDisabled}
                    onClick={() =>
                      setPriceComponentField(
                        setFieldValue,
                        targetRow,
                        detailIndex,
                        componentIndex,
                        'condition',
                        '',
                      )
                    }
                  >
                    {t('common.clear')}
                  </AppButton>
                </div>
                {renderPriceComponentConditionTemplate(
                  setFieldValue,
                  targetRow,
                  detailIndex,
                  componentIndex,
                  component,
                  isDisabled,
                )}
              </div>
            ),
          },
          {
            title: t('channel.providers.price_component_table.input_price'),
            key: 'input_price',
            width: 180,
            render: (_, component, componentIndex) => (
              <AppInputNumber
                className='router-inline-input'
                step='0.000001'
                min={0}
                precision={6}
                value={component.input_price ?? ''}
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'input_price',
                    value ?? '',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.output_price'),
            key: 'output_price',
            width: 180,
            render: (_, component, componentIndex) => (
              <AppInputNumber
                className='router-inline-input'
                step='0.000001'
                min={0}
                precision={6}
                value={component.output_price ?? ''}
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'output_price',
                    value ?? '',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.price_unit'),
            key: 'price_unit',
            width: 180,
            render: (_, component, componentIndex) => (
              <AppSelect
                className='router-inline-dropdown'
                options={PRICE_UNIT_OPTIONS}
                value={
                  component.price_unit ??
                  defaultPriceUnitByComponent(component.component)
                }
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'price_unit',
                    value || '',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.currency'),
            key: 'currency',
            width: 120,
            render: (_, component, componentIndex) => (
              <AppInput
                className='router-inline-input'
                value={component.currency ?? ''}
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'currency',
                    value ?? '',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.source'),
            key: 'source',
            width: 160,
            render: (_, component, componentIndex) => (
              <AppSelect
                className='router-inline-dropdown'
                options={SOURCE_OPTIONS}
                value={component.source || 'manual'}
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'source',
                    value || 'manual',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.source_url'),
            key: 'source_url',
            width: 220,
            render: (_, component, componentIndex) => (
              <AppInput
                className='router-inline-input'
                value={component.source_url || ''}
                disabled={isDisabled}
                onChange={(e, { value }) =>
                  setPriceComponentField(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                    'source_url',
                    value || '',
                  )
                }
              />
            ),
          },
          {
            title: t('channel.providers.price_component_table.actions'),
            key: 'actions',
            width: 52,
            render: (_, component, componentIndex) => (
              <AppTableActionButton
                icon='trash'
                title={t('common.delete')}
                color='red'
                disabled={isDisabled}
                onClick={() =>
                  removePriceComponentRow(
                    setFieldValue,
                    targetRow,
                    detailIndex,
                    componentIndex,
                  )
                }
              />
            ),
          },
        ]}
      />
    );

    return (
      <div>
        {showToolbar ? (
          <AppFilterHeader
            className='router-toolbar-compact'
            title={
              hideTitle ? null : t('channel.providers.dialog.model_details')
            }
            actions={
              <>
                {searchable ? (
                  <AppInput
                    className='router-inline-input router-search-form-xs'
                    placeholder={t(
                      'channel.providers.model_detail_table.search_placeholder',
                    )}
                    value={modelSearchKeyword}
                    onChange={(e, { value }) => {
                      if (typeof options.onSearchChange === 'function') {
                        options.onSearchChange(value || '');
                      }
                    }}
                  />
                ) : null}
                <AppButton
                  type='button'
                  className='router-inline-button'
                  disabled={disabled}
                  onClick={() => addModelDetailRow(setValueFn, row)}
                >
                  {t('channel.providers.model_detail_table.add')}
                </AppButton>
              </>
            }
          />
        ) : null}
        <AppTable
          className='router-detail-table router-provider-model-detail-table'
          size='small'
          tableLayout='fixed'
          pagination={false}
          rowKey={(record) =>
            `${record?.detail?.model || 'model'}-${record?.index ?? '0'}`
          }
          dataSource={visibleDetailRows}
          locale={{
            emptyText: t('channel.providers.model_detail_table.empty'),
          }}
          expandable={{
            expandedRowKeys: visibleDetailRows.map(
              ({ detail, index }) => `${detail?.model || 'model'}-${index}`,
            ),
            showExpandColumn: false,
            expandedRowRender: ({ detail, index: detailIndex }) => (
              <div className='router-block-top-sm'>
                <AppFilterHeader
                  className='router-toolbar-compact'
                  title={t('channel.providers.model_detail_table.price_components')}
                />
                {renderEditablePriceComponentsTable(
                  detail,
                  detailIndex,
                  setValueFn,
                  row,
                  disabled,
                )}
              </div>
            ),
          }}
          columns={[
            {
              title: t('channel.providers.model_detail_table.model'),
              key: 'model',
              width: 128,
              render: (_, { detail, index: detailIndex }) => (
                <div>
                  <AppInput
                    className='router-inline-input router-machine-input'
                    value={detail.model || ''}
                    disabled={disabled}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'model',
                        value || '',
                      )
                    }
                  />
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.description'),
              key: 'description',
              width: 150,
              render: (_, { detail, index: detailIndex }) => (
                <div>
                  <AppTextarea
                    className='router-inline-input'
                    rows={2}
                    value={detail.description || ''}
                    disabled={disabled}
                    placeholder={t(
                      'channel.providers.model_detail_table.description',
                    )}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'description',
                        value || '',
                      )
                    }
                  />
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.status'),
              key: 'status',
              width: 92,
              render: (_, { detail, index: detailIndex }) => (
                <div>
                  <AppSelect
                    className='router-inline-dropdown'
                    options={PROVIDER_MODEL_STATUS_OPTIONS}
                    value={detail.status || 'active'}
                    disabled={disabled}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'status',
                        value || 'active',
                      )
                    }
                  />
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.tags'),
              key: 'tags',
              width: 150,
              render: (_, { detail, index: detailIndex }) => (
                <div>
                  <AppSelect
                    className='router-inline-dropdown'
                    multiple
                    options={MODEL_TAG_OPTIONS}
                    value={detail.tags || []}
                    disabled={disabled}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'tags',
                        Array.isArray(value) ? value : [],
                      )
                    }
                  />
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.supported_endpoints'),
              key: 'supported_endpoints',
              width: 170,
              render: (_, { detail, index: detailIndex }) => (
                <div>
                  <AppSelect
                    className='router-inline-dropdown'
                    multiple
                    clearable
                    options={providerEndpointOptionsForType(
                      providerModelTypeFromTags(detail.tags, detail.model),
                    )}
                    placeholder={t(
                      'channel.providers.model_detail_table.supported_endpoints',
                    )}
                    value={detail.supported_endpoints || []}
                    disabled={disabled}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'supported_endpoints',
                        Array.isArray(value) ? value : [],
                      )
                    }
                  />
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.price_compact'),
              key: 'price_compact',
              width: 188,
              render: (_, { detail, index: detailIndex }) => (
                <div className='router-block-gap-xs'>
                  <div className='router-muted'>
                    {t('channel.providers.model_detail_table.input_price')}
                  </div>
                  <AppInputNumber
                    className='router-inline-input router-inline-input-price'
                    step='0.000001'
                    min={0}
                    precision={6}
                    value={detail.input_price ?? ''}
                    disabled={disabled}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'input_price',
                        value ?? '',
                      )
                    }
                  />
                  <div className='router-muted router-block-top-xs'>
                    {t('channel.providers.model_detail_table.output_price')}
                  </div>
                  <AppInputNumber
                    className='router-inline-input router-inline-input-price'
                    step='0.000001'
                    min={0}
                    precision={6}
                    value={detail.output_price ?? ''}
                    disabled={disabled}
                    onChange={(e, { value }) =>
                      setModelDetailField(
                        setValueFn,
                        row,
                        detailIndex,
                        'output_price',
                        value ?? '',
                      )
                    }
                  />
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.price_unit'),
              key: 'price_unit',
              width: 96,
              render: (_, { detail, index: detailIndex }) => (
                <AppInput
                  className='router-inline-input'
                  value={detail.price_unit ?? ''}
                  disabled={disabled}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setValueFn,
                      row,
                      detailIndex,
                      'price_unit',
                      value || '',
                    )
                  }
                />
              ),
            },
            {
              title: t('channel.providers.model_detail_table.currency'),
              key: 'currency',
              width: 76,
              render: (_, { detail, index: detailIndex }) => (
                <AppInput
                  className='router-inline-input'
                  value={detail.currency ?? ''}
                  disabled={disabled}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setValueFn,
                      row,
                      detailIndex,
                      'currency',
                      value ?? '',
                    )
                  }
                />
              ),
            },
            {
              title: t('channel.providers.model_detail_table.price_components'),
              key: 'price_components',
              width: 96,
              render: (_, { index: detailIndex }) => (
                <AppButton
                  type='button'
                  className='router-inline-button'
                  disabled={disabled}
                  onClick={() => addPriceComponentRow(setValueFn, row, detailIndex)}
                >
                  {t(
                    'channel.providers.model_detail_table.add_price_component',
                  )}
                </AppButton>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.actions'),
              key: 'actions',
              width: 56,
              render: (_, { index: detailIndex }) => (
                <AppTableActionButton
                  icon='trash'
                  title={t('common.delete')}
                  color='red'
                  disabled={disabled}
                  onClick={() =>
                    removeModelDetailRow(setValueFn, row, detailIndex)
                  }
                />
              ),
            },
          ]}
        />
      </div>
    );
  };

  const renderModelDetailsReadonly = (row, options = {}) => {
    const details = Array.isArray(row?.model_details) ? row.model_details : [];
    const searchable = options.searchable === true;
    const hideTitle = options.hideTitle === true;
    const showToolbar = options.showToolbar !== false;
    const actions = options.actions || {};
    const actionsDisabled = Boolean(options.actionsDisabled) || saving;
    const pageSize =
      Number(options.pageSize || 0) > 0
        ? Number(options.pageSize)
        : PROVIDER_DETAIL_MODEL_PAGE_SIZE;
    const currentPage =
      Number(options.currentPage || 0) > 0 ? Number(options.currentPage) : 1;
    const selectedRowKeys = Array.isArray(options.selectedRowKeys)
      ? options.selectedRowKeys
      : [];
    const modelSearchKeyword =
      typeof options.searchKeyword === 'string' ? options.searchKeyword : '';
    const normalizedModelSearchKeyword = modelSearchKeyword
      .trim()
      .toLowerCase();
    const modelStatusFilter =
      typeof options.statusFilter === 'string'
        ? options.statusFilter.trim().toLowerCase()
        : PROVIDER_MODEL_STATUS_FILTER_ALL;
    const detailRows = details.map((detail, index) => ({ detail, index }));
    const visibleDetailRows = detailRows.filter(({ detail }) => {
      const detailStatus = String(detail.status || 'active')
        .trim()
        .toLowerCase();
      if (
        modelStatusFilter !== PROVIDER_MODEL_STATUS_FILTER_ALL &&
        detailStatus !== modelStatusFilter
      ) {
        return false;
      }
      if (normalizedModelSearchKeyword === '') {
        return true;
      }
      const haystack = [
        detail.model || '',
        detail.description || '',
        detailStatus,
        (detail.tags || []).join(','),
        (detail.supported_endpoints || []).join(','),
        detail.price_unit || '',
        detail.currency || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedModelSearchKeyword);
    });
    const totalPages = Math.max(
      1,
      Math.ceil(visibleDetailRows.length / pageSize),
    );
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const pageRows = visibleDetailRows.slice(
      (safeCurrentPage - 1) * pageSize,
      safeCurrentPage * pageSize,
    );
    const rowSelection =
      options.batchDeleteMode === true
        ? {
            selectedRowKeys,
            columnWidth: 48,
            getCheckboxProps: () => ({
              disabled: actionsDisabled,
            }),
            onSelect: (record, selected) => {
              if (typeof options.onSelectedRowKeysChange !== 'function') {
                return;
              }
              const rowKey = `${record?.detail?.model || 'model'}-${record?.index ?? '0'}`;
              const nextKeys = new Set(selectedRowKeys);
              if (selected) {
                nextKeys.add(rowKey);
              } else {
                nextKeys.delete(rowKey);
              }
              options.onSelectedRowKeysChange(Array.from(nextKeys));
            },
            onSelectAll: (selected, selectedRows, changeRows) => {
              if (typeof options.onSelectedRowKeysChange !== 'function') {
                return;
              }
              const nextKeys = new Set(selectedRowKeys);
              changeRows.forEach((record) => {
                const rowKey = `${record?.detail?.model || 'model'}-${record?.index ?? '0'}`;
                if (selected) {
                  nextKeys.add(rowKey);
                } else {
                  nextKeys.delete(rowKey);
                }
              });
              options.onSelectedRowKeysChange(Array.from(nextKeys));
            },
          }
        : undefined;
    return (
      <div className='router-block-top-sm'>
        {showToolbar ? (
          <AppFilterHeader
            className='router-block-gap-xs'
            title={hideTitle ? '' : t('channel.providers.dialog.model_details')}
            actions={
              searchable ? (
                <AppInput
                  className='router-inline-input router-search-form-xs'
                  placeholder={t(
                    'channel.providers.model_detail_table.search_placeholder',
                  )}
                  value={modelSearchKeyword}
                  onChange={(e, { value }) => {
                    if (typeof options.onSearchChange === 'function') {
                      options.onSearchChange(value || '');
                    }
                  }}
                />
              ) : null
            }
            />
        ) : null}
        <AppTable
          className='router-detail-table router-provider-model-detail-table'
          size='small'
          tableLayout='fixed'
          pagination={false}
          rowSelection={rowSelection}
          rowKey={(record) =>
            `${record?.detail?.model || 'model'}-${record?.index ?? '0'}`
          }
          dataSource={pageRows}
          locale={{
            emptyText: t('channel.providers.model_detail_table.empty'),
          }}
          columns={[
          {
            title: t('channel.providers.model_detail_table.model'),
            dataIndex: ['detail', 'model'],
            key: 'model',
            width: 180,
            render: (value, record) => (
                <div
                  className='router-model-title router-monospace-value'
                  title={record?.detail?.description || value || '-'}
                >
                  {value || '-'}
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.status'),
              dataIndex: ['detail', 'status'],
              key: 'status',
              width: 80,
              render: (value) => value || 'active',
            },
            {
              title: t('channel.providers.model_detail_table.tags'),
              dataIndex: ['detail', 'tags'],
              key: 'tags',
              width: 160,
              render: (tags, record) => (
                <div>
                  {normalizeProviderModelTags(tags, record?.detail?.model).map(
                    (tag) => (
                      <AppTag
                        key={`${record.detail?.model || 'model'}-${tag}`}
                        className='router-tag'
                      >
                        {tag}
                      </AppTag>
                    ),
                  )}
                </div>
              ),
            },
            {
              title: t('channel.providers.model_detail_table.input_price'),
              key: 'input_price',
              width: 124,
              render: (_, { detail }) =>
                renderProviderPriceCell(detail, 'input_price', t, openPricingDetail, row?.pricing_url),
            },
            {
              title: t('channel.providers.model_detail_table.output_price'),
              key: 'output_price',
              width: 124,
              render: (_, { detail }) =>
                renderProviderPriceCell(detail, 'output_price', t, openPricingDetail, row?.pricing_url),
            },
            {
              title: t('channel.providers.model_detail_table.actions'),
              key: 'actions',
              width: 84,
              render: (_, { index: detailIndex }) => (
                <div className='router-provider-model-detail-actions router-table-actions-icon-compact'>
                  <AppTableActionButton
                    icon='edit'
                    title={t('common.edit')}
                    disabled={actionsDisabled}
                    onClick={() =>
                      typeof actions.onStartEdit === 'function'
                        ? actions.onStartEdit(detailIndex)
                        : null
                    }
                  />
                  <AppTableActionButton
                    icon='trash'
                    title={t('common.delete')}
                    disabled={actionsDisabled}
                    onClick={() =>
                      typeof actions.onDelete === 'function'
                        ? actions.onDelete(detailIndex)
                        : null
                    }
                  />
                </div>
              ),
            },
          ]}
        />
        {totalPages > 1 || pageSize !== PROVIDER_DETAIL_MODEL_PAGE_SIZE ? (
          <div className='router-pagination-wrap'>
            <AppPagination
              className='router-section-pagination'
              current={safeCurrentPage}
              total={visibleDetailRows.length}
              pageSize={pageSize}
              onPageChange={(e, { activePage: nextActivePage, pageSize: nextPageSize }) => {
                const size =
                  Number(nextPageSize) > 0 ? Number(nextPageSize) : pageSize;
                if (
                  size !== pageSize &&
                  typeof options.onPageSizeChange === 'function'
                ) {
                  options.onPageSizeChange(size);
                  return;
                }
                if (typeof options.onPageChange === 'function') {
                  options.onPageChange(Number(nextActivePage) || 1);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const renderModelDetailEditorModal = () => {
    const details = Array.isArray(detailModelsDraft.model_details)
      ? detailModelsDraft.model_details
      : [];
    if (
      !modelDetailEditorOpen ||
      detailEditingModelIndex < 0 ||
      detailEditingModelIndex >= details.length
    ) {
      return null;
    }
    const detail = details[detailEditingModelIndex];
    return (
      <AppModal
        size='large'
        open={modelDetailEditorOpen}
        onClose={closeModelDetailEditor}
        closeOnDimmerClick={!saving}
        title={
          modelDetailEditorMode === 'create'
            ? t('channel.providers.model_detail_table.create_title')
            : t('channel.providers.model_detail_table.edit_title')
        }
        footer={null}
      >
        <div className='router-modal-scroll-body router-page-stack'>
          <div className='router-provider-model-detail-form'>
            <AppFormRow className='router-provider-model-detail-form-row router-provider-model-detail-form-row-2'>
              <AppField
                label={t('channel.providers.model_detail_table.model')}
                required
              >
                <AppInput
                  className='router-section-input router-machine-input'
                  value={detail.model || ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'model',
                      value || '',
                    )
                  }
                />
              </AppField>
              <AppField
                label={t('channel.providers.model_detail_table.status')}
                required
              >
                <AppSelect
                  className='router-section-dropdown'
                  fluid
                  options={PROVIDER_MODEL_STATUS_OPTIONS}
                  value={detail.status || 'active'}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'status',
                      value || 'active',
                    )
                  }
                />
              </AppField>
            </AppFormRow>
            <AppFormRow className='router-provider-model-detail-form-row router-provider-model-detail-form-row-2'>
              <AppField
                label={t('channel.providers.model_detail_table.tags')}
                required
              >
                <AppSelect
                  className='router-section-dropdown'
                  fluid
                  multiple
                  options={MODEL_TAG_OPTIONS}
                  value={detail.tags || []}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'tags',
                      Array.isArray(value) ? value : [],
                    )
                  }
                />
              </AppField>
              <AppField
                label={t('channel.providers.model_detail_table.source')}
                required
              >
                <AppSelect
                  className='router-section-dropdown'
                  fluid
                  options={SOURCE_OPTIONS}
                  value={detail.source || 'manual'}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'source',
                      value || 'manual',
                    )
                  }
                />
              </AppField>
            </AppFormRow>
            {detail.specification ? (
              <AppFormRow className='router-provider-model-detail-form-row'>
                <AppField
                  className='router-provider-model-detail-field-wide'
                  label={t('channel.providers.model_detail_table.specification')}
                >
                  <div className='router-provider-model-specification'>
                    {Object.entries(detail.specification.endpoints || {}).map(([endpoint, spec]) => (
                      <div className='router-provider-model-specification-row' key={endpoint}>
                        <strong className='router-monospace-value'>{endpoint}</strong>
                        {Array.isArray(spec?.input_modalities) && spec.input_modalities.length > 0 ? <span>{t('channel.providers.model_detail_table.input_modalities')}: {spec.input_modalities.join(' / ')}</span> : null}
                        {Array.isArray(spec?.file_types) && spec.file_types.length > 0 ? <span>{t('channel.providers.model_detail_table.file_types')}: {spec.file_types.join(' / ')}</span> : null}
                        {spec?.supports_upload || spec?.supports_url ? <span>{t('channel.providers.model_detail_table.file_transport')}: {[spec.supports_upload ? t('channel.providers.model_detail_table.file_upload') : '', spec.supports_url ? t('channel.providers.model_detail_table.file_url') : ''].filter(Boolean).join(' / ')}</span> : null}
                      </div>
                    ))}
                  </div>
                </AppField>
              </AppFormRow>
            ) : null}
            <AppFormRow className='router-provider-model-detail-form-row'>
              <AppField
                className='router-provider-model-detail-field-wide'
                label={t(
                  'channel.providers.model_detail_table.supported_endpoints',
                )}
              >
                <AppSelect
                  className='router-section-dropdown router-provider-endpoint-multi-select'
                  multiple
                  clearable
                  fluid
                  options={providerEndpointOptionsForType(
                    providerModelTypeFromTags(detail.tags, detail.model),
                  )}
                  value={detail.supported_endpoints || []}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'supported_endpoints',
                      Array.isArray(value) ? value : [],
                    )
                  }
                />
              </AppField>
            </AppFormRow>
            <AppFormRow className='router-provider-model-detail-form-row'>
              <AppField
                className='router-provider-model-detail-field-wide'
                label={t('channel.providers.model_detail_table.description')}
              >
                <AppTextarea
                  className='router-section-input'
                  value={detail.description || ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'description',
                      value || '',
                    )
                  }
                />
              </AppField>
            </AppFormRow>
            <AppFormRow className='router-provider-model-detail-form-row router-provider-model-detail-form-row-2'>
              <AppField label={t('channel.providers.model_detail_table.input_price')}>
                <AppInputNumber
                  className='router-section-input'
                  min={0}
                  step={0.000001}
                  precision={6}
                  fluid
                  value={detail.input_price ?? ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'input_price',
                      value ?? '',
                    )
                  }
                />
              </AppField>
              <AppField label={t('channel.providers.model_detail_table.output_price')}>
                <AppInputNumber
                  className='router-section-input'
                  min={0}
                  step={0.000001}
                  precision={6}
                  fluid
                  value={detail.output_price ?? ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'output_price',
                      value ?? '',
                    )
                  }
                />
              </AppField>
            </AppFormRow>
            <AppFormRow className='router-provider-model-detail-form-row router-provider-model-detail-form-row-2'>
              <AppField label={t('channel.providers.model_detail_table.price_unit')}>
                <AppInput
                  className='router-section-input'
                  value={detail.price_unit ?? ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'price_unit',
                      value || '',
                    )
                  }
                />
              </AppField>
              <AppField label={t('channel.providers.model_detail_table.currency')}>
                <AppInput
                  className='router-section-input'
                  value={detail.currency ?? ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'currency',
                      value ?? '',
                    )
                  }
                />
              </AppField>
            </AppFormRow>
            <AppFormRow className='router-provider-model-detail-form-row'>
              <AppField
                className='router-provider-model-detail-field-wide'
                label={t('channel.providers.dialog.source_url_override')}
              >
                <AppInput
                  className='router-section-input'
                  placeholder={
                    (detailModelsDraft.pricing_url || '').trim() ||
                    t('channel.providers.dialog.source_url_inherit_placeholder')
                  }
                  value={detail.source_url ?? ''}
                  onChange={(e, { value }) =>
                    setModelDetailField(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                      'source_url',
                      value || '',
                    )
                  }
                />
              </AppField>
            </AppFormRow>
          </div>
          <div className='router-block-top-md'>
            <AppFilterHeader
              className='router-toolbar-compact'
              title={t('channel.providers.model_detail_table.price_components')}
              actions={
                <AppButton
                  type='button'
                  className='router-inline-button'
                  disabled={saving}
                  onClick={() =>
                    addPriceComponentRow(
                      setDetailModelsValue,
                      detailModelsDraft,
                      detailEditingModelIndex,
                    )
                  }
                >
                  {t(
                    'channel.providers.model_detail_table.add_price_component',
                  )}
                </AppButton>
              }
            />
            <AppTable
              className='router-detail-subtable'
              size='small'
              pagination={false}
              rowKey={(component) =>
                buildPriceComponentRowKey(detail.model, component)
              }
              dataSource={detail.price_components || []}
              locale={{
                emptyText: t('channel.providers.price_component_table.empty'),
              }}
              scroll={{ x: 1320 }}
              columns={[
                {
                  title: t('channel.providers.price_component_table.component'),
                  key: 'component',
                  width: 180,
                  render: (_, component, componentIndex) => (
                    <AppSelect
                      className='router-inline-dropdown'
                      options={PRICE_COMPONENT_OPTIONS}
                      value={component.component || 'text'}
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'component',
                          value || '',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.condition'),
                  key: 'condition',
                  width: 320,
                  render: (_, component, componentIndex) => (
                    <div>
                      <div className='router-provider-inline-field'>
                        <AppInput
                          className='router-inline-input'
                          placeholder='quality=hd;size=1024x1024'
                          value={component.condition || ''}
                          disabled={saving}
                          onChange={(e, { value }) =>
                            setPriceComponentField(
                              setDetailModelsValue,
                              detailModelsDraft,
                              detailEditingModelIndex,
                              componentIndex,
                              'condition',
                              value || '',
                            )
                          }
                        />
                        <AppButton
                          type='button'
                          className='router-inline-button'
                          basic
                          disabled={saving}
                          onClick={() =>
                            setPriceComponentField(
                              setDetailModelsValue,
                              detailModelsDraft,
                              detailEditingModelIndex,
                              componentIndex,
                              'condition',
                              '',
                            )
                          }
                        >
                          {t('common.clear')}
                        </AppButton>
                      </div>
                      {renderPriceComponentConditionTemplate(
                        setDetailModelsValue,
                        detailModelsDraft,
                        detailEditingModelIndex,
                        componentIndex,
                        component,
                        saving,
                      )}
                    </div>
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.input_price'),
                  key: 'input_price',
                  width: 180,
                  render: (_, component, componentIndex) => (
                    <AppInputNumber
                      className='router-inline-input'
                      step='0.000001'
                      min={0}
                      precision={6}
                      value={component.input_price ?? ''}
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'input_price',
                          value ?? '',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.output_price'),
                  key: 'output_price',
                  width: 180,
                  render: (_, component, componentIndex) => (
                    <AppInputNumber
                      className='router-inline-input'
                      step='0.000001'
                      min={0}
                      precision={6}
                      value={component.output_price ?? ''}
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'output_price',
                          value ?? '',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.price_unit'),
                  key: 'price_unit',
                  width: 180,
                  render: (_, component, componentIndex) => (
                    <AppSelect
                      className='router-inline-dropdown'
                      options={PRICE_UNIT_OPTIONS}
                      value={
                        component.price_unit ??
                        defaultPriceUnitByComponent(component.component)
                      }
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'price_unit',
                          value || '',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.currency'),
                  key: 'currency',
                  width: 120,
                  render: (_, component, componentIndex) => (
                    <AppInput
                      className='router-inline-input'
                      value={component.currency ?? ''}
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'currency',
                          value ?? '',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.source'),
                  key: 'source',
                  width: 160,
                  render: (_, component, componentIndex) => (
                    <AppSelect
                      className='router-inline-dropdown'
                      options={SOURCE_OPTIONS}
                      value={component.source || 'manual'}
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'source',
                          value || 'manual',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.source_url'),
                  key: 'source_url',
                  width: 220,
                  render: (_, component, componentIndex) => (
                    <AppInput
                      className='router-inline-input'
                      value={component.source_url || ''}
                      disabled={saving}
                      onChange={(e, { value }) =>
                        setPriceComponentField(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                          'source_url',
                          value || '',
                        )
                      }
                    />
                  ),
                },
                {
                  title: t('channel.providers.price_component_table.actions'),
                  key: 'actions',
                  width: 52,
                  render: (_, component, componentIndex) => (
                    <AppTableActionButton
                      icon='trash'
                      title={t('common.delete')}
                      disabled={saving}
                      onClick={() =>
                        removePriceComponentRow(
                          setDetailModelsValue,
                          detailModelsDraft,
                          detailEditingModelIndex,
                          componentIndex,
                        )
                      }
                    />
                  ),
                },
              ]}
            />
          </div>
          <AppFormActions>
            <AppButton
              type='button'
              className='router-page-button'
              onClick={closeModelDetailEditor}
              disabled={saving}
            >
              {t('common.cancel')}
            </AppButton>
            <AppButton
              type='button'
              className='router-page-button'
              color='blue'
              loading={saving}
              disabled={saving}
              onClick={saveDetailModelEdit}
            >
              {t('common.confirm')}
            </AppButton>
          </AppFormActions>
        </div>
      </AppModal>
    );
  };

  const renderRows = () => (
    <div>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          { key: 'providers', label: t('header.providers'), active: true },
        ]}
        title={t('header.providers')}
        actions={
          <div className='router-list-toolbar-actions'>
          <AppButton
            type='button'
            className='router-page-button'
            color='blue'
            disabled={saving}
            onClick={openCreatePanel}
          >
            {t('channel.providers.buttons.add_provider')}
          </AppButton>
          <AppButton
            type='button'
            className='router-page-button'
            disabled={saving || refreshing}
            loading={refreshing}
            onClick={reloadCatalog}
          >
            {t('channel.providers.buttons.refresh')}
          </AppButton>
          </div>
        }
        query={
          <div className='router-list-toolbar-query'>
            <AppInput
              className='router-section-input router-search-form-sm'
              placeholder={t('channel.providers.search')}
              value={searchKeyword}
              onChange={(e, { value }) => {
                patchQuery({ keyword: value || '' });
              }}
            />
            <AppButton
              className='router-section-button'
              disabled={searchKeyword === ''}
              onClick={() => patchQuery({ keyword: '' })}
            >
              {t('common.clear_filters')}
            </AppButton>
          </div>
        }
      />
      <AppSpin spinning={loading}>
        {loadError ? (
          <AppErrorState
            message={t('common.load_failed')}
            onRetry={() => loadCatalog(normalizedSearchKeyword)}
            retryText={t('common.retry')}
          />
        ) : rows.length > 0 ? (
          <div className='router-provider-card-grid'>
            {rows.map((row) => {
            const displayName =
              formatProviderDisplayName(row.id, row.name) ||
              formatProviderDisplayId(row.id) ||
              '-';
            const modelDetails = Array.isArray(row.model_details)
              ? row.model_details
              : [];
            const modelTypes = Array.from(
              new Set(
                modelDetails
                  .map((detail) =>
                    providerModelTypeFromTags(detail?.tags, detail?.model),
                  )
                  .filter(Boolean),
              ),
            ).slice(0, 3);

            return (
              <button
                type='button'
                className='router-provider-card'
                key={
                  row?.id ||
                  `${row?.name || 'provider'}-${row?.created_at || 0}-${row?.updated_at || 0}`
                }
                disabled={creating || saving}
                onClick={() => openViewer(row)}
              >
                <span className='router-provider-card-header'>
                  <ProviderBrandMark provider={row.id} name={row.name} />
                  <AppIcon
                    name='right chevron'
                    className='router-provider-card-arrow'
                    aria-hidden='true'
                  />
                </span>
                <span className='router-provider-card-name'>{displayName}</span>
                <span className='router-provider-card-id'>
                  {formatProviderDisplayId(row.id)}
                </span>
                <span className='router-provider-card-footer'>
                  <span>
                    {t('channel.providers.table.model_count', {
                      count: modelDetails.length,
                    })}
                  </span>
                  {modelTypes.length > 0 ? (
                    <span className='router-provider-card-types'>
                      {modelTypes.join(' / ')}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <AppEmpty>
          {t('channel.providers.table.empty')}
        </AppEmpty>
        )}
      </AppSpin>
    </div>
  );

  const renderViewer = () => {
    if (!viewRow) return null;
    const basicEditing = detailEditingSection === 'basic';
    const modelsEditing = detailEditingSection === 'models';
    const basicSourceRow = basicEditing ? detailBasicDraft : viewRow;
    const providerDetailTabItems = [
      {
        key: 'basic',
        label: t('channel.providers.dialog.detail_basic_title'),
        disabled: modelsEditing,
      },
      {
        key: 'models',
        label: t('channel.providers.dialog.model_details'),
        disabled: basicEditing,
      },
    ];
    return (
      <>
        <AppFilterHeader
          breadcrumbs={[
            { key: 'admin', label: t('header.admin_workspace') },
            {
              key: 'provider-list',
              label: t('header.providers'),
              onClick: closeViewer,
            },
            {
              key: 'provider-current',
              label: formatProviderDisplayName(viewRow.id, viewRow.name) || formatProviderDisplayId(viewRow.id) || '-',
              active: true,
            },
          ]}
          title={t('header.providers')}
        />
        <div className='router-tab-detail-page router-provider-detail-page'>
          <div className='router-entity-detail-tabs router-block-gap-sm'>
            <AppTabs
              className='router-detail-tab-menu'
              activeKey={activeProviderDetailTab}
              items={providerDetailTabItems}
              onChange={setActiveProviderDetailTab}
            />
          </div>
          {activeProviderDetailTab === 'basic' ? (
          <AppDetailSection
            className='router-provider-detail-section'
            title={t('channel.providers.dialog.detail_basic_title')}
            titleClassName='router-provider-detail-section-title'
            headerEnd={
              basicEditing ? (
                <>
                  <AppButton
                    type='button'
                    className='router-page-button'
                    onClick={cancelDetailSectionEdit}
                    disabled={saving}
                  >
                    {t('common.cancel')}
                  </AppButton>
                  <AppButton
                    type='button'
                    className='router-page-button'
                    color='blue'
                    loading={saving}
                    disabled={saving}
                    onClick={() => saveViewerSection('basic')}
                  >
                    {t('common.save')}
                  </AppButton>
                </>
              ) : (
                <AppButton
                  type='button'
                  className='router-page-button'
                  disabled={saving || modelsEditing}
                  onClick={() => startDetailSectionEdit('basic')}
                >
                  {t('common.edit')}
                </AppButton>
              )
            }
          >
              <AppFormRow>
                <AppField
                  label={t('channel.providers.dialog.provider')}
                  readOnly
                >
                  <AppInput
                    className='router-section-input'
                    value={formatProviderDisplayId(basicSourceRow.id) || ''}
                    readOnly
                  />
                </AppField>
                {basicEditing ? (
                  <AppField
                    label={t('channel.providers.dialog.name')}
                    required
                  >
                    <AppInput
                      className='router-section-input'
                      placeholder={t(
                        'channel.providers.dialog.name_placeholder',
                      )}
                      value={detailBasicDraft.name}
                      onChange={(e, { value }) =>
                        setDetailBasicValue('name', value || '')
                      }
                    />
                  </AppField>
                ) : (
                  <AppField
                    label={t('channel.providers.dialog.name')}
                    readOnly
                  >
                    <AppInput
                      className='router-section-input'
                      value={formatProviderDisplayName(basicSourceRow.id, basicSourceRow.name) || ''}
                      readOnly
                    />
                  </AppField>
                )}
              </AppFormRow>
              <AppFormRow>
                {basicEditing ? (
                  <AppField
                    label={t('channel.providers.dialog.base_url')}
                    required
                  >
                    <AppInput
                      className='router-section-input'
                      placeholder={t(
                        'channel.providers.dialog.base_url_placeholder',
                      )}
                      value={detailBasicDraft.base_url}
                      onChange={(e, { value }) =>
                        setDetailBasicValue('base_url', value || '')
                      }
                    />
                  </AppField>
                ) : (
                  <AppField
                    label={t('channel.providers.dialog.base_url')}
                    readOnly
                  >
                    <AppInput
                      className='router-section-input'
                      value={basicSourceRow.base_url || ''}
                      readOnly
                    />
                  </AppField>
                )}
                {basicEditing ? (
                  <AppField label={t('channel.providers.dialog.official_url')}>
                    <AppInput
                      className='router-section-input'
                      placeholder={t(
                        'channel.providers.dialog.official_url_placeholder',
                      )}
                      value={detailBasicDraft.official_url}
                      onChange={(e, { value }) =>
                        setDetailBasicValue('official_url', value || '')
                      }
                    />
                  </AppField>
                ) : (
                  <AppField
                    label={t('channel.providers.dialog.official_url')}
                    readOnly
                  >
                    <AppInput
                      className='router-section-input'
                      value={basicSourceRow.official_url || ''}
                      readOnly
                    />
                  </AppField>
                )}
              </AppFormRow>
              <AppFormRow>
                {basicEditing ? (
                  <AppField label={t('channel.providers.dialog.pricing_url')}>
                    <AppInput
                      className='router-section-input'
                      placeholder={t(
                        'channel.providers.dialog.pricing_url_placeholder',
                      )}
                      value={detailBasicDraft.pricing_url}
                      onChange={(e, { value }) =>
                        setDetailBasicValue('pricing_url', value || '')
                      }
                    />
                  </AppField>
                ) : (
                  <AppField
                    label={t('channel.providers.dialog.pricing_url')}
                    readOnly
                  >
                    <AppInput
                      className='router-section-input'
                      value={basicSourceRow.pricing_url || ''}
                      readOnly
                    />
                  </AppField>
                )}
              </AppFormRow>
              <AppFormRow>
                <AppField label={t('channel.providers.table.source')} readOnly>
                  <AppInput
                    className='router-section-input'
                    value={viewRow.source || '-'}
                    readOnly
                  />
                </AppField>
                <AppField
                  label={t('channel.providers.table.created_at')}
                  readOnly
                >
                  <AppInput
                    className='router-section-input'
                    value={
                      viewRow.created_at
                        ? timestamp2string(viewRow.created_at)
                        : '-'
                    }
                    readOnly
                  />
                </AppField>
                <AppField
                  label={t('channel.providers.table.updated_at')}
                  readOnly
                >
                  <AppInput
                    className='router-section-input'
                    value={
                      viewRow.updated_at
                        ? timestamp2string(viewRow.updated_at)
                        : '-'
                    }
                    readOnly
                  />
                </AppField>
              </AppFormRow>
          </AppDetailSection>
          ) : null}
          {activeProviderDetailTab === 'models' ? (
          <AppDetailSection
            className='router-provider-detail-section'
            title={t('channel.providers.dialog.model_details')}
            titleClassName='router-provider-detail-section-title'
            headerStart={
              <span className='router-toolbar-meta'>
                ({t('channel.providers.table.model_count', {
                  count: Array.isArray(viewRow?.model_details)
                    ? viewRow.model_details.length
                    : 0,
                })})
              </span>
            }
          >
            <AppFilterHeader
              className='router-toolbar-compact'
              picker={
                <>
                <AppSelect
                  className='router-section-dropdown router-detail-filter-dropdown router-dropdown-min-170'
                  options={[
                    {
                      key: PROVIDER_MODEL_STATUS_FILTER_ALL,
                      value: PROVIDER_MODEL_STATUS_FILTER_ALL,
                      text: t(
                        'channel.providers.model_detail_table.status_all',
                      ),
                    },
                    {
                      key: 'active',
                      value: 'active',
                      text: t(
                        'channel.providers.model_detail_table.status_active',
                      ),
                    },
                    {
                      key: 'deprecated',
                      value: 'deprecated',
                      text: t(
                        'channel.providers.model_detail_table.status_deprecated',
                      ),
                    },
                  ]}
                  value={viewModelStatusFilter}
                  onChange={(e, { value }) => {
                    setViewModelStatusFilter(
                      value || PROVIDER_MODEL_STATUS_FILTER_ALL,
                    );
                    setViewModelPage(1);
                  }}
                />
                <AppInput
                  className='router-section-input router-search-form-sm'
                  placeholder={t(
                    'channel.providers.model_detail_table.search_placeholder',
                  )}
                  value={viewModelSearchKeyword}
                  onChange={(e, { value }) => {
                    setViewModelSearchKeyword(value || '');
                    setViewModelPage(1);
                  }}
                />
                </>
              }
              actions={
                <>
                <AppButton
                  type='button'
                  className='router-page-button'
                  disabled={saving || basicEditing || modelsEditing}
                  onClick={startDetailModelCreate}
                >
                  {t('channel.providers.model_detail_table.add')}
                </AppButton>
                {viewModelBatchDeleteMode ? (
                  <>
                    <AppButton
                      type='button'
                      color='red'
                      className='router-page-button'
                      disabled={
                        saving ||
                        basicEditing ||
                        modelsEditing ||
                        viewModelBatchDeleteKeys.length === 0
                      }
                      onClick={() => {
                        const selectedIndexByKey = new Map(
                          (Array.isArray(viewRow?.model_details)
                            ? viewRow.model_details
                            : []
                          ).map((detail, index) => [
                            `${detail?.model || 'model'}-${index}`,
                            index,
                          ]),
                        );
                        requestDeleteDetailModels(
                          viewModelBatchDeleteKeys
                            .map((key) => selectedIndexByKey.get(key))
                            .filter((index) => Number.isInteger(index)),
                        );
                      }}
                    >
                      {t('channel.providers.model_detail_table.batch_delete_selected', {
                        count: viewModelBatchDeleteKeys.length,
                      })}
                    </AppButton>
                    <AppButton
                      type='button'
                      className='router-page-button'
                      disabled={saving}
                      onClick={() => {
                        setViewModelBatchDeleteMode(false);
                        setViewModelBatchDeleteKeys([]);
                      }}
                    >
                      {t('common.cancel')}
                    </AppButton>
                  </>
                ) : (
                  <AppButton
                    type='button'
                    className='router-page-button'
                    disabled={
                      saving ||
                      basicEditing ||
                      modelsEditing ||
                      !Array.isArray(viewRow?.model_details) ||
                      viewRow.model_details.length === 0
                    }
                    onClick={() => {
                      setViewModelBatchDeleteMode(true);
                      setViewModelBatchDeleteKeys([]);
                    }}
                  >
                    {t('channel.providers.model_detail_table.batch_delete')}
                  </AppButton>
                )}
                </>
              }
            />
            {renderModelDetailsReadonly(viewRow, {
              searchable: false,
              hideTitle: true,
              showToolbar: false,
              batchDeleteMode: viewModelBatchDeleteMode,
              selectedRowKeys: viewModelBatchDeleteKeys,
              onSelectedRowKeysChange: setViewModelBatchDeleteKeys,
              searchKeyword: viewModelSearchKeyword,
              statusFilter: viewModelStatusFilter,
              currentPage: viewModelPage,
              pageSize: viewModelPageSize,
              onPageChange: setViewModelPage,
              onPageSizeChange: (size) => {
                setViewModelPageSize(size);
                setViewModelPage(1);
              },
              actions: {
                onStartEdit: startDetailModelEdit,
                onDelete: requestDeleteDetailModel,
              },
              actionsDisabled: basicEditing || modelsEditing,
            })}
          </AppDetailSection>
          ) : null}
        </div>
      </>
    );
  };

  const renderCreatePanel = () => (
    <div>
      <AppFormActions align='start' className='router-block-gap-sm'>
        <AppButton
          type='button'
          className='router-page-button'
          onClick={closeCreatePanel}
          disabled={saving}
        >
          {t('channel.providers.dialog.cancel_create')}
        </AppButton>
        <AppButton
          type='button'
          className='router-page-button'
          color='blue'
          loading={saving}
          disabled={saving}
          onClick={applyCreateToRows}
        >
          {t('channel.providers.dialog.confirm')}
        </AppButton>
      </AppFormActions>
      <div>
        <AppFormRow>
          <AppField
            label={t('channel.providers.dialog.provider')}
            required
          >
            <AppInput
              className='router-section-input'
              placeholder={t('channel.providers.dialog.provider_placeholder')}
              value={createRow.id}
              onChange={(e, { value }) =>
                setCreateValue('id', normalizeProvider(value || ''))
              }
            />
          </AppField>
          <AppField label={t('channel.providers.dialog.name')} required>
            <AppInput
              className='router-section-input'
              placeholder={t('channel.providers.dialog.name_placeholder')}
              value={createRow.name}
              onChange={(e, { value }) => setCreateValue('name', value || '')}
            />
          </AppField>
        </AppFormRow>
        <AppFormRow>
          <AppField label={t('channel.providers.dialog.base_url')} required>
            <AppInput
              className='router-section-input'
              placeholder={t('channel.providers.dialog.base_url_placeholder')}
              value={createRow.base_url}
              onChange={(e, { value }) =>
                setCreateValue('base_url', value || '')
              }
            />
          </AppField>
          <AppField label={t('channel.providers.dialog.official_url')}>
            <AppInput
              className='router-section-input'
              placeholder={t(
                'channel.providers.dialog.official_url_placeholder',
              )}
              value={createRow.official_url}
              onChange={(e, { value }) =>
                setCreateValue('official_url', value || '')
              }
            />
          </AppField>
          <AppField label={t('channel.providers.dialog.pricing_url')}>
            <AppInput
              className='router-section-input'
              placeholder={t(
                'channel.providers.dialog.pricing_url_placeholder',
              )}
              value={createRow.pricing_url}
              onChange={(e, { value }) =>
                setCreateValue('pricing_url', value || '')
              }
            />
          </AppField>
        </AppFormRow>
      </div>

      {renderModelDetailsTable(createRow, setCreateValue, saving)}
    </div>
  );

  const renderModelDeleteModal = () => {
    const sourceRow = cloneEditableRow(viewRow);
    const details = Array.isArray(sourceRow?.model_details)
      ? sourceRow.model_details
      : [];
    const target =
      pendingModelDeleteIndex >= 0 && pendingModelDeleteIndex < details.length
        ? details[pendingModelDeleteIndex]
        : null;
    const label =
      target?.model || target?.upstream_model || `model #${pendingModelDeleteIndex + 1}`;
    return (
      <AppModal
        open={modelDeleteConfirmOpen}
        onClose={closeModelDeleteModal}
        size='tiny'
        closeOnDimmerClick={!(saving || creating)}
        title={t('channel.providers.dialog.delete_model_title')}
        footer={[
          <AppButton
            key='cancel'
            type='button'
            className='router-modal-button'
            onClick={closeModelDeleteModal}
            disabled={saving || creating}
          >
            {t('channel.providers.dialog.cancel_create')}
          </AppButton>,
          <AppButton
            key='confirm'
            type='button'
            className='router-modal-button'
            color='red'
            loading={saving}
            disabled={saving || creating}
            onClick={performDeleteDetailModel}
          >
            {t('channel.providers.dialog.delete_confirm')}
          </AppButton>,
        ]}
      >
        <div>
          {t('channel.providers.dialog.delete_model_content', { model: label })}
        </div>
      </AppModal>
    );
  };

  const renderModelBatchDeleteModal = () => {
    const count = pendingModelBatchDeleteIndexes.length;
    return (
      <AppModal
        open={modelBatchDeleteConfirmOpen}
        onClose={closeModelBatchDeleteModal}
        size='tiny'
        closeOnDimmerClick={!(saving || creating)}
        title={t('channel.providers.dialog.delete_model_batch_title')}
        footer={[
          <AppButton
            key='cancel'
            type='button'
            className='router-modal-button'
            onClick={closeModelBatchDeleteModal}
            disabled={saving || creating}
          >
            {t('channel.providers.dialog.cancel_create')}
          </AppButton>,
          <AppButton
            key='confirm'
            type='button'
            className='router-modal-button'
            color='red'
            loading={saving}
            disabled={saving || creating || count === 0}
            onClick={performDeleteDetailModels}
          >
            {t('channel.providers.dialog.delete_confirm')}
          </AppButton>,
        ]}
      >
        <div>
          {t('channel.providers.dialog.delete_model_batch_content', { count })}
        </div>
      </AppModal>
    );
  };

  const renderPricingDetailModal = () => (
    <AppModal
      size='large'
      open={pricingDetailOpen}
      onClose={closePricingDetail}
      title={t('channel.providers.dialog.pricing_detail_title')}
      footer={[
        <AppButton
          key='close'
          type='button'
          className='router-modal-button'
          onClick={closePricingDetail}
        >
          {t('channel.providers.dialog.cancel')}
        </AppButton>,
      ]}
    >
      <div className='router-modal-scroll-body'>
        <div className='router-block-gap-sm'>
          <AppToolbar
            className='router-block-gap-sm'
            start={
              <>
                <AppTag className='router-tag'>
                  <span className='router-monospace-value'>
                    {pricingDetailModel?.model || '-'}
                  </span>
                </AppTag>
                <AppTag className='router-tag'>
                  {pricingDetailModel?.type || 'text'}
                </AppTag>
              </>
            }
          />
        </div>
        <div className='router-detail-subtable-caption router-muted'>
          {t('channel.providers.dialog.pricing_detail_base_caption')}
        </div>
        <AppTable
          className='router-detail-subtable'
          size='small'
          pagination={false}
          rowKey={() => `${pricingDetailModel?.model || 'model'}-summary`}
          dataSource={[pricingDetailModel || {}]}
          columns={[
            {
              title: t('channel.providers.model_detail_table.input_price'),
              key: 'input_price',
              render: (_, record) =>
                formatProviderPriceCellValue(record?.input_price),
            },
            {
              title: t('channel.providers.model_detail_table.output_price'),
              key: 'output_price',
              render: (_, record) =>
                formatProviderPriceCellValue(record?.output_price),
            },
            {
              title: t('channel.providers.model_detail_table.price_unit'),
              key: 'price_unit',
              render: (_, record) => record?.price_unit || '-',
            },
            {
              title: t('channel.providers.model_detail_table.currency'),
              dataIndex: 'currency',
              key: 'currency',
              render: (value) => value || 'USD',
            },
            {
              title: t('channel.providers.price_component_table.source_url'),
              dataIndex: 'source_url',
              key: 'source_url',
              render: (value) => renderProviderSourceUrlCell(value),
            },
          ]}
        />
        <div className='router-detail-subtable-caption router-muted'>
          {t('channel.providers.dialog.pricing_detail_components_caption')}
        </div>
        <AppTable
          className='router-detail-subtable'
          size='small'
          pagination={false}
          rowKey={(component) =>
            buildPriceComponentRowKey(pricingDetailModel?.model, component)
          }
          dataSource={pricingDetailModel?.price_components || []}
          locale={{
            emptyText: t('channel.providers.price_component_table.empty'),
          }}
          scroll={{ x: 1080 }}
          columns={[
            {
              title: t('channel.providers.price_component_table.component'),
              dataIndex: 'component',
              key: 'component',
              render: (value) => value || '-',
            },
            {
              title: t('channel.providers.price_component_table.condition'),
              dataIndex: 'condition',
              key: 'condition',
              render: (value) => value || '-',
            },
            {
              title: t('channel.providers.price_component_table.input_price'),
              dataIndex: 'input_price',
              key: 'input_price',
              render: (value) => formatProviderPriceCellValue(value),
            },
            {
              title: t('channel.providers.price_component_table.output_price'),
              dataIndex: 'output_price',
              key: 'output_price',
              render: (value) => formatProviderPriceCellValue(value),
            },
            {
              title: t('channel.providers.price_component_table.price_unit'),
              dataIndex: 'price_unit',
              key: 'price_unit',
              render: (value) => value || '-',
            },
            {
              title: t('channel.providers.price_component_table.currency'),
              dataIndex: 'currency',
              key: 'currency',
              render: (value) => value || 'USD',
            },
            {
              title: t('channel.providers.price_component_table.source'),
              dataIndex: 'source',
              key: 'source',
              render: (value) => value || 'manual',
            },
            {
              title: t('channel.providers.price_component_table.source_url'),
              dataIndex: 'source_url',
              key: 'source_url',
              render: (value) => renderProviderSourceUrlCell(value),
            },
          ]}
        />
      </div>
    </AppModal>
  );

  return (
    <div>
      {renderModelDetailEditorModal()}
      {renderModelDeleteModal()}
      {renderModelBatchDeleteModal()}
      {renderPricingDetailModal()}
      {creating
        ? renderCreatePanel()
        : viewingProvider && viewRow
          ? renderViewer()
          : renderRows()}
    </div>
  );
};

export default ProvidersManager;
