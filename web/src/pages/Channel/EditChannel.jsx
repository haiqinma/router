import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Card, Checkbox, Form, Message} from 'semantic-ui-react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {API, showError, showInfo, showSuccess, verifyJSON,} from '../../helpers';
import {getChannelOptions, loadChannelOptions} from '../../helpers/helper';

const MODEL_MAPPING_EXAMPLE = {
  'gpt-3.5-turbo-0301': 'gpt-3.5-turbo',
  'gpt-4-0314': 'gpt-4',
  'gpt-4-32k-0314': 'gpt-4-32k',
};

const normalizeModelId = (model) => {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object') {
    if (typeof model.id === 'string') return model.id;
    if (typeof model.name === 'string') return model.name;
    if (typeof model.model === 'string') return model.model;
  }
  return null;
};

const buildModelOptions = (models) => {
  const seen = new Set();
  const options = [];
  const ids = [];
  models.forEach((model) => {
    const id = normalizeModelId(model);
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({
      key: id,
      text: id,
      value: id,
    });
    ids.push(id);
  });
  return { options, ids };
};

const normalizeModelIDs = (models) => {
  if (!Array.isArray(models)) {
    return [];
  }
  const seen = new Set();
  const result = [];
  models.forEach((item) => {
    const id = (item || '').toString().trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  result.sort();
  return result;
};

const normalizeBaseURL = (baseURL) =>
  (baseURL || '').trim().replace(/\/+$/, '');

const buildChannelConnectionSignature = ({ type, key, baseURL, draftID }) => {
  const normalizedKey = (key || '').trim();
  const normalizedDraftID = (draftID || '').trim();
  const keyPart = normalizedKey !== '' ? normalizedKey : `@draft:${normalizedDraftID}`;
  return `${type}|${normalizeBaseURL(baseURL)}|${keyPart}`;
};

const sanitizeDraftInputsForLocalStorage = (inputs) => {
  if (!inputs || typeof inputs !== 'object') {
    return CHANNEL_ORIGIN_INPUTS;
  }
  return {
    ...inputs,
    key: '',
  };
};

const sanitizeDraftConfigForLocalStorage = (config) => {
  if (!config || typeof config !== 'object') {
    return CHANNEL_DEFAULT_CONFIG;
  }
  return {
    ...config,
    ak: '',
    sk: '',
    vertex_ai_adc: '',
  };
};

const CHANNEL_CREATE_DRAFT_KEY = 'router.channel.create.draft.v1';
const CREATE_CHANNEL_STEP_MIN = 1;
const CREATE_CHANNEL_STEP_MAX = 3;

const parseCreateStep = (rawStep) => {
  const step = Number(rawStep);
  if (!Number.isInteger(step)) {
    return CREATE_CHANNEL_STEP_MIN;
  }
  if (step < CREATE_CHANNEL_STEP_MIN) {
    return CREATE_CHANNEL_STEP_MIN;
  }
  if (step > CREATE_CHANNEL_STEP_MAX) {
    return CREATE_CHANNEL_STEP_MAX;
  }
  return step;
};

const CHANNEL_ORIGIN_INPUTS = {
  name: '',
  type: 1,
  key: '',
  base_url: '',
  other: '',
  model_mapping: '',
  model_ratio: '',
  completion_ratio: '',
  system_prompt: '',
  models: [],
};

const CHANNEL_DEFAULT_CONFIG = {
  region: '',
  sk: '',
  ak: '',
  user_id: '',
  vertex_ai_project_id: '',
  vertex_ai_adc: '',
};

function type2secretPrompt(type, t) {
  switch (type) {
    case 15:
      return t('channel.edit.key_prompts.zhipu');
    case 18:
      return t('channel.edit.key_prompts.spark');
    case 22:
      return t('channel.edit.key_prompts.fastgpt');
    case 23:
      return t('channel.edit.key_prompts.tencent');
    default:
      return t('channel.edit.key_prompts.default');
  }
}

const EditChannel = () => {
  const { t } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const channelId = params.id;
  const isEdit = channelId !== undefined;
  const copyFromId = useMemo(() => {
    if (isEdit) return 0;
    const query = new URLSearchParams(location.search);
    const id = Number(query.get('copy_from') || 0);
    return Number.isInteger(id) && id > 0 ? id : 0;
  }, [isEdit, location.search]);
  const draftIdFromQuery = useMemo(() => {
    if (isEdit) return '';
    const query = new URLSearchParams(location.search);
    return (query.get('draft_id') || '').trim();
  }, [isEdit, location.search]);
  const [loading, setLoading] = useState(isEdit || copyFromId > 0);
  const [createStep, setCreateStep] = useState(() => {
    const query = new URLSearchParams(location.search);
    return parseCreateStep(query.get('step'));
  });
  const [draftChannelId, setDraftChannelId] = useState(draftIdFromQuery);
  const [channelKeySet, setChannelKeySet] = useState(false);
  const handleCancel = () => {
    navigate('/admin/channel');
  };

  const [inputs, setInputs] = useState(CHANNEL_ORIGIN_INPUTS);
  const [originModelOptions, setOriginModelOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [channelTypeOptions, setChannelTypeOptions] = useState(() =>
    getChannelOptions()
  );
  const [fetchModelsLoading, setFetchModelsLoading] = useState(false);
  const [modelsSyncError, setModelsSyncError] = useState('');
  const [modelsLastSyncedAt, setModelsLastSyncedAt] = useState(0);
  const [verifiedModelSignature, setVerifiedModelSignature] = useState('');
  const [config, setConfig] = useState(CHANNEL_DEFAULT_CONFIG);
  const fetchingModelsRef = useRef(false);
  const draftChannelIdRef = useRef(draftIdFromQuery);

  const buildEffectiveKey = useCallback(() => {
    let effectiveKey = inputs.key || '';
    if (effectiveKey === '') {
      if (config.ak !== '' && config.sk !== '' && config.region !== '') {
        effectiveKey = `${config.ak}|${config.sk}|${config.region}`;
      } else if (
        config.region !== '' &&
        config.vertex_ai_project_id !== '' &&
        config.vertex_ai_adc !== ''
      ) {
        effectiveKey = `${config.region}|${config.vertex_ai_project_id}|${config.vertex_ai_adc}`;
      }
    }
    return effectiveKey;
  }, [config.ak, config.region, config.sk, config.vertex_ai_adc, config.vertex_ai_project_id, inputs.key]);

  const effectivePreviewKey = useMemo(
    () => buildEffectiveKey().trim(),
    [buildEffectiveKey]
  );
  const previewChannelID = useMemo(
    () => ((isEdit ? channelId : draftChannelId) || '').trim(),
    [channelId, draftChannelId, isEdit]
  );
  const isCreateMode = !isEdit;
  const hasModelPreviewCredentials =
    effectivePreviewKey !== '' || (previewChannelID !== '' && channelKeySet);
  const canReuseStoredKeyForCreate =
    isCreateMode && previewChannelID !== '' && channelKeySet;
  const currentModelSignature = useMemo(
    () =>
      buildChannelConnectionSignature({
        type: inputs.type,
        key: effectivePreviewKey,
        baseURL: inputs.base_url,
        draftID: previewChannelID,
      }),
    [effectivePreviewKey, inputs.base_url, inputs.type, previewChannelID]
  );
  const requiresConnectionVerification = !isEdit && inputs.type !== 43;
  const showStepOne = isEdit || createStep === 1;
  const showStepTwo = isEdit || createStep === 2;
  const showStepThree = isEdit || createStep === 3;
  const isCurrentSignatureVerified =
    requiresConnectionVerification &&
    verifiedModelSignature !== '' &&
    currentModelSignature === verifiedModelSignature;
  const requireVerificationBeforeProceed =
    requiresConnectionVerification && inputs.models.length === 0;
  const visibleModelOptions = modelOptions;
  const fetchModelsButtonText = t('channel.edit.buttons.fetch_models');

  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  const handleConfigChange = (e, { name, value }) => {
    setConfig((inputs) => ({ ...inputs, [name]: value }));
  };

  const clearCreateDraft = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(CHANNEL_CREATE_DRAFT_KEY);
  }, []);

  const restoreCreateDraft = useCallback(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const raw = localStorage.getItem(CHANNEL_CREATE_DRAFT_KEY);
    if (!raw) {
      return false;
    }
    try {
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') {
        return false;
      }
      if (!draft.inputs || typeof draft.inputs !== 'object') {
        return false;
      }

      setInputs({
        ...CHANNEL_ORIGIN_INPUTS,
        ...sanitizeDraftInputsForLocalStorage(draft.inputs),
      });
      if (draft.config && typeof draft.config === 'object') {
        setConfig({
          ...CHANNEL_DEFAULT_CONFIG,
          ...sanitizeDraftConfigForLocalStorage(draft.config),
        });
      }
      if (Array.isArray(draft.originModelOptions)) {
        setOriginModelOptions(
          draft.originModelOptions.filter(
            (option) =>
              option &&
              typeof option === 'object' &&
              typeof option.key === 'string' &&
              typeof option.value === 'string'
          )
        );
      }
      if (typeof draft.modelsSyncError === 'string') {
        setModelsSyncError(draft.modelsSyncError);
      }
      if (Number.isFinite(draft.modelsLastSyncedAt)) {
        setModelsLastSyncedAt(draft.modelsLastSyncedAt);
      }
      if (typeof draft.verifiedModelSignature === 'string') {
        setVerifiedModelSignature(draft.verifiedModelSignature);
      }
      if (typeof draft.draft_channel_id === 'string') {
        const restoredDraftID = draft.draft_channel_id.trim();
        setDraftChannelId(restoredDraftID);
        draftChannelIdRef.current = restoredDraftID;
      }
      if (typeof draft.channel_key_set === 'boolean') {
        setChannelKeySet(draft.channel_key_set);
      } else {
        setChannelKeySet(false);
      }
      setCreateStep(parseCreateStep(draft.step));
      return true;
    } catch {
      return false;
    }
  }, []);

  const goToCreateStep = useCallback(
    (targetStep) => {
      if (isEdit) {
        return;
      }
      setCreateStep(parseCreateStep(targetStep));
    },
    [isEdit]
  );

  const moveToPreviousCreateStep = useCallback(() => {
    goToCreateStep(createStep - 1);
  }, [createStep, goToCreateStep]);

  const buildChannelPayload = useCallback(() => {
    const effectiveKey = buildEffectiveKey();
    let localInputs = { ...inputs, key: effectiveKey };
    if (localInputs.key === 'undefined|undefined|undefined') {
      localInputs.key = '';
    }
    if (localInputs.base_url && localInputs.base_url.endsWith('/')) {
      localInputs.base_url = localInputs.base_url.slice(
        0,
        localInputs.base_url.length - 1
      );
    }
    if (localInputs.type === 3 && localInputs.other === '') {
      localInputs.other = '2024-03-01-preview';
    }
    localInputs.models = (localInputs.models || []).join(',');
    const submitConfig = { ...config };
    delete submitConfig.use_responses;
    delete submitConfig.user_agent;
    localInputs.config = JSON.stringify(submitConfig);
    return localInputs;
  }, [buildEffectiveKey, config, inputs]);

  const createDraftChannel = useCallback(async () => {
    const payload = buildChannelPayload();
    const res = await API.post('/api/v1/admin/channel/draft', {
      name: payload.name,
      type: payload.type,
      key: payload.key,
      base_url: payload.base_url,
      config: payload.config,
    });
    const { success, message, data } = res.data || {};
    if (!success) {
      showError(message || t('channel.edit.messages.create_draft_failed'));
      return '';
    }
    const id = (data?.id || '').toString();
    if (id === '') {
      showError(t('channel.edit.messages.create_draft_failed'));
      return '';
    }
    setDraftChannelId(id);
    draftChannelIdRef.current = id;
    if ((payload.key || '').trim() !== '') {
      setChannelKeySet(true);
    }
    return id;
  }, [buildChannelPayload, t]);

  const saveDraftChannel = useCallback(async () => {
    let targetDraftID = (draftChannelIdRef.current || draftChannelId || '').trim();
    if (targetDraftID === '') {
      if (!isCreateMode) {
        return true;
      }
      const createdID = await createDraftChannel();
      if (createdID === '') {
        return false;
      }
      targetDraftID = createdID;
    }
    const payload = buildChannelPayload();
    const res = await API.put('/api/v1/admin/channel/', {
      ...payload,
      id: targetDraftID,
      status: 4,
    });
    const { success, message } = res.data || {};
    if (!success) {
      showError(message || t('channel.edit.messages.update_draft_failed'));
      return false;
    }
    if ((payload.key || '').trim() !== '') {
      setChannelKeySet(true);
    }
    return true;
  }, [buildChannelPayload, createDraftChannel, draftChannelId, isCreateMode, t]);

  const verifyDraftModelsPersisted = useCallback(async (expectedModels) => {
    const targetDraftID = (draftChannelIdRef.current || draftChannelId || '').trim();
    if (targetDraftID === '') {
      return false;
    }
    try {
      const checkRes = await API.get(`/api/v1/admin/channel/${targetDraftID}?select_all=1`);
      const { success, data } = checkRes.data || {};
      if (!success || !data) {
        return false;
      }
      const remoteModels = normalizeModelIDs(
        (data.models || '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '')
      );
      const localModels = normalizeModelIDs(expectedModels);
      if (remoteModels.length !== localModels.length) {
        return false;
      }
      for (let i = 0; i < localModels.length; i += 1) {
        if (localModels[i] !== remoteModels[i]) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }, [draftChannelId]);

  const ensureDraftChannel = useCallback(async () => {
    if (!isCreateMode) {
      return true;
    }
    if (draftChannelId) {
      return saveDraftChannel();
    }
    const createdID = await createDraftChannel();
    return createdID !== '';
  }, [createDraftChannel, draftChannelId, isCreateMode, saveDraftChannel]);

  const moveToStepTwo = useCallback(async () => {
    const effectiveKey = buildEffectiveKey();
    if (
      inputs.name.trim() === '' ||
      (effectiveKey.trim() === '' && !canReuseStoredKeyForCreate)
    ) {
      showInfo(t('channel.edit.messages.name_required'));
      return;
    }
    if (isCreateMode) {
      const ok = await ensureDraftChannel();
      if (!ok) {
        return;
      }
    }
    goToCreateStep(2);
  }, [
    buildEffectiveKey,
    canReuseStoredKeyForCreate,
    ensureDraftChannel,
    goToCreateStep,
    inputs.name,
    isCreateMode,
    t,
  ]);

  const moveToStepThree = useCallback(async () => {
    if (requireVerificationBeforeProceed) {
      if (!hasModelPreviewCredentials) {
        showInfo(t('channel.edit.model_selector.verify_prerequisite'));
        return;
      }
      if (!isCurrentSignatureVerified) {
        showInfo(t('channel.edit.model_selector.verify_required'));
        return;
      }
    }
    if (inputs.type !== 43 && inputs.models.length === 0) {
      showInfo(t('channel.edit.messages.models_required'));
      return;
    }
    if (isCreateMode) {
      const ok = await saveDraftChannel();
      if (!ok) {
        return;
      }
      const expectedModels = [...inputs.models];
      let persisted = await verifyDraftModelsPersisted(expectedModels);
      if (!persisted) {
        // Retry once with a minimal payload to force model persistence.
        const targetDraftID = (draftChannelIdRef.current || draftChannelId || '').trim();
        if (targetDraftID !== '') {
          try {
            const retryRes = await API.put('/api/v1/admin/channel/', {
              id: targetDraftID,
              status: 4,
              models: expectedModels.join(','),
            });
            if (retryRes?.data?.success) {
              persisted = await verifyDraftModelsPersisted(expectedModels);
            }
          } catch {
            persisted = false;
          }
        }
      }
      if (!persisted) {
        showError(t('channel.edit.messages.update_draft_failed'));
        return;
      }
    }
    goToCreateStep(3);
  }, [
    draftChannelId,
    goToCreateStep,
    hasModelPreviewCredentials,
    inputs.models.length,
    inputs.models,
    inputs.type,
    isCreateMode,
    isCurrentSignatureVerified,
    requireVerificationBeforeProceed,
    requiresConnectionVerification,
    saveDraftChannel,
    t,
    verifyDraftModelsPersisted,
  ]);

  const loadChannelById = useCallback(
    async (targetId, forCopy = false, selectAll = true, fromDraft = false) => {
    const query = selectAll ? '?select_all=1' : '';
    let res = await API.get(`/api/v1/admin/channel/${targetId}${query}`);
    const { success, message, data } = res.data;
    if (success) {
      const keySet = !!data.key_set;
      if (data.models === '') {
        data.models = [];
      } else {
        data.models = data.models.split(',');
      }
      if (data.model_mapping !== '') {
        data.model_mapping = JSON.stringify(
          JSON.parse(data.model_mapping),
          null,
          2
        );
      }
      if (data.model_ratio) {
        data.model_ratio = JSON.stringify(JSON.parse(data.model_ratio), null, 2);
      } else {
        data.model_ratio = '';
      }
      if (data.completion_ratio) {
        data.completion_ratio = JSON.stringify(
          JSON.parse(data.completion_ratio),
          null,
          2
        );
      } else {
        data.completion_ratio = '';
      }
      let parsedConfig = {};
      if (data.config !== '') {
        parsedConfig = JSON.parse(data.config);
        delete parsedConfig.use_responses;
      }
      const normalizedType = data.type || 1;

      if (forCopy) {
        setInputs({
          name: data.name || '',
          type: normalizedType,
          key: '',
          base_url: data.base_url || '',
          other: data.other || '',
          model_mapping: data.model_mapping || '',
          model_ratio: data.model_ratio || '',
          completion_ratio: data.completion_ratio || '',
          system_prompt: data.system_prompt || '',
          models: data.models || [],
        });
      } else {
        setInputs({ ...data, key: '', type: normalizedType });
      }
      setConfig((prev) => ({
        ...prev,
        ...parsedConfig,
      }));
      if (fromDraft || isEdit) {
        setChannelKeySet(keySet);
      } else {
        setChannelKeySet(false);
      }
    } else {
      showError(message);
    }
    setLoading(false);
  }, [isEdit]);

  const applyModelCandidates = useCallback((models, selectAll = false) => {
    const { options, ids } = buildModelOptions(models);
    setOriginModelOptions(options);
    setInputs((prev) => {
      const selected = selectAll
        ? ids
        : prev.models.filter((model) => ids.includes(model));
      return { ...prev, models: selected };
    });
    return ids;
  }, []);

  const handleFetchModels = useCallback(
    async ({ silent = false, selectAll = true } = {}) => {
      if (fetchingModelsRef.current) {
        return false;
      }
      fetchingModelsRef.current = true;
      setFetchModelsLoading(true);
      try {
        let models = [];
        const normalizedBaseURL = normalizeBaseURL(inputs.base_url);
        const key = buildEffectiveKey().trim();
        const requestSignature = buildChannelConnectionSignature({
          type: inputs.type,
          key,
          baseURL: normalizedBaseURL,
          draftID: previewChannelID,
        });
        const res = await API.post(`/api/v1/admin/channel/preview/models`, {
          type: inputs.type,
          key,
          base_url: normalizedBaseURL,
          draft_id: previewChannelID,
          config,
        });
        const { success, message, data } = res.data || {};
        if (!success) {
          const errorMessage = message || t('channel.edit.messages.fetch_models_failed');
          setModelsSyncError(errorMessage);
          setVerifiedModelSignature('');
          if (!silent) {
            showError(errorMessage);
          }
          return false;
        }
        models = Array.isArray(data) ? data.filter((model) => model) : [];

        const ids = applyModelCandidates(models, selectAll);
        if (ids.length === 0) {
          const message = t('channel.edit.messages.models_empty');
          setModelsSyncError(message);
          setVerifiedModelSignature('');
          if (!silent) {
            showInfo(message);
          }
          return false;
        }

        setModelsSyncError('');
        setModelsLastSyncedAt(Date.now());
        setVerifiedModelSignature(requestSignature);
        if (!silent) {
          showSuccess(t('channel.messages.operation_success'));
        }
        return true;
      } catch (error) {
        const errorMessage = error?.message || t('channel.edit.messages.fetch_models_failed');
        setModelsSyncError(errorMessage);
        setVerifiedModelSignature('');
        if (!silent) {
          showError(errorMessage);
        }
        return false;
      } finally {
        fetchingModelsRef.current = false;
        setFetchModelsLoading(false);
      }
    },
    [
      applyModelCandidates,
      buildEffectiveKey,
      config,
      inputs.base_url,
      inputs.type,
      previewChannelID,
      t,
    ]
  );

  const fetchChannelTypes = useCallback(async () => {
    const options = await loadChannelOptions();
    if (Array.isArray(options) && options.length > 0) {
      setChannelTypeOptions(options);
    }
  }, []);

  useEffect(() => {
    let localModelOptions = [...originModelOptions];
    inputs.models.forEach((model) => {
      if (!localModelOptions.find((option) => option.key === model)) {
        localModelOptions.push({
          key: model,
          text: model,
          value: model,
        });
      }
    });
    setModelOptions(localModelOptions);
  }, [originModelOptions, inputs.models]);

  const toggleModelSelection = useCallback((modelId, checked) => {
    setInputs((prev) => {
      const set = new Set(prev.models || []);
      if (checked) {
        set.add(modelId);
      } else {
        set.delete(modelId);
      }
      return { ...prev, models: Array.from(set) };
    });
  }, []);

  const selectAllModels = useCallback(() => {
    const allModelIds = modelOptions.map((option) => option.value);
    setInputs((prev) => ({ ...prev, models: allModelIds }));
  }, [modelOptions]);

  const clearSelectedModels = useCallback(() => {
    setInputs((prev) => ({ ...prev, models: [] }));
  }, []);

  useEffect(() => {
    if (isEdit) {
      return;
    }
    if (draftIdFromQuery === draftChannelId) {
      return;
    }
    setDraftChannelId(draftIdFromQuery);
    draftChannelIdRef.current = draftIdFromQuery;
  }, [draftIdFromQuery, isEdit]);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      loadChannelById(channelId, false, true, false).then();
      return;
    }
    if (copyFromId > 0) {
      setLoading(true);
      loadChannelById(copyFromId, true, true, false).then();
      return;
    }
    if (draftIdFromQuery !== '') {
      setLoading(true);
      loadChannelById(draftIdFromQuery, true, true, true).then();
      return;
    }
    setChannelKeySet(false);
    restoreCreateDraft();
    setLoading(false);
  }, [channelId, copyFromId, draftIdFromQuery, isEdit, loadChannelById, restoreCreateDraft]);

  useEffect(() => {
    if (isEdit) {
      return;
    }
    const query = new URLSearchParams(location.search);
    const stepParam = query.get('step');
    if (stepParam === null) {
      return;
    }
    const queryStep = parseCreateStep(stepParam);
    if (queryStep !== createStep) {
      setCreateStep(queryStep);
    }
  }, [isEdit, location.search]);

  useEffect(() => {
    if (isEdit) {
      return;
    }
    const query = new URLSearchParams(location.search);
    const stepParam = query.get('step');
    if (createStep <= CREATE_CHANNEL_STEP_MIN) {
      if (stepParam === null) {
        return;
      }
      query.delete('step');
    } else {
      const nextStep = String(createStep);
      if (stepParam === nextStep) {
        return;
      }
      query.set('step', nextStep);
    }
    const nextSearch = query.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [createStep, isEdit, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (isEdit) {
      return;
    }
    const query = new URLSearchParams(location.search);
    const currentDraftID = (query.get('draft_id') || '').trim();
    const nextDraftID = (draftChannelId || '').trim();
    if (currentDraftID === nextDraftID) {
      return;
    }
    if (nextDraftID === '') {
      query.delete('draft_id');
    } else {
      query.set('draft_id', nextDraftID);
    }
    const nextSearch = query.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [draftChannelId, isEdit, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (isEdit || loading || typeof window === 'undefined') {
      return;
    }
    const payload = {
      step: createStep,
      inputs: sanitizeDraftInputsForLocalStorage(inputs),
      config: sanitizeDraftConfigForLocalStorage(config),
      originModelOptions,
      modelsSyncError,
      modelsLastSyncedAt,
      verifiedModelSignature,
      draft_channel_id: draftChannelId,
      channel_key_set: channelKeySet,
      savedAt: Date.now(),
    };
    localStorage.setItem(CHANNEL_CREATE_DRAFT_KEY, JSON.stringify(payload));
  }, [
    channelKeySet,
    config,
    createStep,
    draftChannelId,
    inputs,
    isEdit,
    loading,
    modelsLastSyncedAt,
    modelsSyncError,
    originModelOptions,
    verifiedModelSignature,
  ]);

  useEffect(() => {
    if (!requiresConnectionVerification) {
      return;
    }
    if (verifiedModelSignature === '') {
      return;
    }
    if (verifiedModelSignature === currentModelSignature) {
      return;
    }
    setOriginModelOptions([]);
    setModelsLastSyncedAt(0);
    setModelsSyncError(t('channel.edit.model_selector.verify_stale'));
  }, [
    currentModelSignature,
    requiresConnectionVerification,
    t,
    verifiedModelSignature,
  ]);

  useEffect(() => {
    if (requiresConnectionVerification) {
      return;
    }
    if (verifiedModelSignature === '') {
      return;
    }
    setVerifiedModelSignature('');
  }, [requiresConnectionVerification, verifiedModelSignature]);

  useEffect(() => {
    fetchChannelTypes().then();
  }, [fetchChannelTypes]);

  const submit = async () => {
    const effectiveKey = buildEffectiveKey();
    if (
      !isEdit &&
      (inputs.name.trim() === '' ||
        (effectiveKey.trim() === '' && !canReuseStoredKeyForCreate))
    ) {
      showInfo(t('channel.edit.messages.name_required'));
      return;
    }
    if (requireVerificationBeforeProceed) {
      if (!hasModelPreviewCredentials) {
        showInfo(t('channel.edit.model_selector.verify_prerequisite'));
        return;
      }
      if (!isCurrentSignatureVerified) {
        showInfo(t('channel.edit.model_selector.verify_required'));
        return;
      }
    }
    if (inputs.type !== 43 && inputs.models.length === 0) {
      showInfo(t('channel.edit.messages.models_required'));
      return;
    }
    if (inputs.model_mapping !== '' && !verifyJSON(inputs.model_mapping)) {
      showInfo(t('channel.edit.messages.model_mapping_invalid'));
      return;
    }
    if (inputs.model_ratio !== '' && !verifyJSON(inputs.model_ratio)) {
      showInfo('模型倍率必须是合法的 JSON 格式！');
      return;
    }
    if (inputs.completion_ratio !== '' && !verifyJSON(inputs.completion_ratio)) {
      showInfo('补全倍率必须是合法的 JSON 格式！');
      return;
    }
    let localInputs = buildChannelPayload();
    let res;
    if (isEdit) {
      res = await API.put(`/api/v1/admin/channel/`, {
        ...localInputs,
        id: channelId,
      });
    } else if (draftChannelId) {
      res = await API.put(`/api/v1/admin/channel/`, {
        ...localInputs,
        id: draftChannelId,
        status: 1,
      });
    } else {
      res = await API.post(`/api/v1/admin/channel/`, localInputs);
    }
    const { success, message } = res.data;
    if (success) {
      if (isEdit) {
        showSuccess(t('channel.edit.messages.update_success'));
      } else {
        showSuccess(t('channel.edit.messages.create_success'));
        clearCreateDraft();
      }
      navigate('/admin/channel', { replace: true });
      return;
    } else {
      showError(message);
    }
  };

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>
            {isEdit
              ? t('channel.edit.title_edit')
              : t('channel.edit.title_create')}
          </Card.Header>
          <Form loading={loading} autoComplete='new-password'>
            {isCreateMode && (
              <div style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Button
                    type='button'
                    size='tiny'
                    basic={createStep !== 1}
                    color={createStep === 1 ? 'blue' : undefined}
                    onClick={() => goToCreateStep(1)}
                  >
                    {t('channel.edit.wizard.step_basic')}
                  </Button>
                  <Button
                    type='button'
                    size='tiny'
                    basic={createStep !== 2}
                    color={createStep === 2 ? 'blue' : undefined}
                    onClick={moveToStepTwo}
                  >
                    {t('channel.edit.wizard.step_models')}
                  </Button>
                  <Button
                    type='button'
                    size='tiny'
                    basic={createStep !== 3}
                    color={createStep === 3 ? 'blue' : undefined}
                    onClick={moveToStepThree}
                  >
                    {t('channel.edit.wizard.step_advanced')}
                  </Button>
                </div>
              </div>
            )}
            {showStepOne && (
              <>
                <Form.Field>
                  <Form.Input
                    label={t('channel.edit.name')}
                    name='name'
                    placeholder={t('channel.edit.name_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.name}
                    required
                  />
                </Form.Field>
                <Form.Field>
                  <Form.Select
                    label={t('channel.edit.type')}
                    name='type'
                    required
                    search
                    options={channelTypeOptions}
                    value={inputs.type}
                    onChange={handleInputChange}
                  />
                </Form.Field>
                {inputs.type === 3 && (
                  <Form.Field>
                    <Form.Input
                      label='AZURE_OPENAI_ENDPOINT'
                      name='base_url'
                      placeholder='请输入 AZURE_OPENAI_ENDPOINT，例如：https://docs-test-001.openai.azure.com'
                      onChange={handleInputChange}
                      value={inputs.base_url}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type === 8 && (
                  <Form.Field>
                    <Form.Input
                      required
                      label={t('channel.edit.proxy_url')}
                      name='base_url'
                      placeholder={t('channel.edit.proxy_url_placeholder')}
                      onChange={handleInputChange}
                      value={inputs.base_url}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type === 1 && (
                  <Form.Field>
                    <Form.Input
                      label={t('channel.edit.base_url')}
                      name='base_url'
                      placeholder={t('channel.edit.base_url_placeholder')}
                      onChange={handleInputChange}
                      value={inputs.base_url}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type === 22 && (
                  <Form.Field>
                    <Form.Input
                      label='私有部署地址'
                      name='base_url'
                      placeholder={
                        '请输入私有部署地址，格式为：https://fastgpt.run' +
                        '/api' +
                        '/openapi'
                      }
                      onChange={handleInputChange}
                      value={inputs.base_url}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type !== 3 &&
                  inputs.type !== 33 &&
                  inputs.type !== 8 &&
                  inputs.type !== 1 &&
                  inputs.type !== 22 && (
                    <Form.Field>
                      <Form.Input
                        label={t('channel.edit.proxy_url')}
                        name='base_url'
                        placeholder={t('channel.edit.proxy_url_placeholder')}
                        onChange={handleInputChange}
                        value={inputs.base_url}
                        autoComplete='new-password'
                      />
                    </Form.Field>
                  )}

                {inputs.type !== 33 &&
                  inputs.type !== 42 && (
                    <Form.Field>
                      <Form.Input
                        label={t('channel.edit.key')}
                        name='key'
                        type='password'
                        required={!isEdit && !canReuseStoredKeyForCreate}
                        placeholder={
                          channelKeySet && (inputs.key || '').trim() === ''
                            ? '********'
                            : type2secretPrompt(inputs.type, t)
                        }
                        onChange={handleInputChange}
                        value={inputs.key}
                        autoComplete='new-password'
                      />
                    </Form.Field>
                  )}
                {/* Azure OpenAI specific fields */}
                {inputs.type === 3 && (
                  <>
                    <Message>
                      注意，<strong>模型部署名称必须和模型名称保持一致</strong>
                      ，因为 Router 会把请求体中的 model
                      参数替换为你的部署名称（模型名称中的点会被剔除），
                      <a
                        target='_blank'
                        rel='noreferrer'
                        href='https://github.com/yeying-community/router/issues/133?notification_referrer_id=NT_kwDOAmJSYrM2NjIwMzI3NDgyOjM5OTk4MDUw#issuecomment-1571602271'
                      >
                        图片演示
                      </a>
                      。
                    </Message>
                    <Form.Field>
                      <Form.Input
                        label='默认 API 版本'
                        name='other'
                        placeholder='请输入默认 API 版本，例如：2024-03-01-preview，该配置可以被实际的请求查询参数所覆盖'
                        onChange={handleInputChange}
                        value={inputs.other}
                        autoComplete='new-password'
                      />
                    </Form.Field>
                  </>
                )}

                {inputs.type === 18 && (
                  <Form.Field>
                    <Form.Input
                      label={t('channel.edit.spark_version')}
                      name='other'
                      placeholder={t('channel.edit.spark_version_placeholder')}
                      onChange={handleInputChange}
                      value={inputs.other}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type === 21 && (
                  <Form.Field>
                    <Form.Input
                      label={t('channel.edit.knowledge_id')}
                      name='other'
                      placeholder={t('channel.edit.knowledge_id_placeholder')}
                      onChange={handleInputChange}
                      value={inputs.other}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type === 17 && (
                  <Form.Field>
                    <Form.Input
                      label={t('channel.edit.plugin_param')}
                      name='other'
                      placeholder={t('channel.edit.plugin_param_placeholder')}
                      onChange={handleInputChange}
                      value={inputs.other}
                      autoComplete='new-password'
                    />
                  </Form.Field>
                )}
                {inputs.type === 34 && (
                  <Message>{t('channel.edit.coze_notice')}</Message>
                )}
                {inputs.type === 40 && (
                  <Message>
                    {t('channel.edit.douban_notice')}
                    <a
                      target='_blank'
                      rel='noreferrer'
                      href='https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint'
                    >
                      {t('channel.edit.douban_notice_link')}
                    </a>
                    {t('channel.edit.douban_notice_2')}
                  </Message>
                )}
              </>
            )}
            {showStepTwo && inputs.type !== 43 && (
              <Form.Field>
                <label>{t('channel.edit.models')}</label>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <span style={{ color: 'rgba(0, 0, 0, 0.6)' }}>
                    {t('channel.edit.model_selector.summary', {
                      selected: inputs.models.length,
                      total: visibleModelOptions.length,
                    })}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button
                      type='button'
                      size='tiny'
                      color='green'
                      loading={fetchModelsLoading}
                      disabled={
                        fetchModelsLoading ||
                        (requiresConnectionVerification &&
                          !hasModelPreviewCredentials)
                      }
                      onClick={() =>
                        handleFetchModels({ silent: false, selectAll: true })
                      }
                    >
                      {fetchModelsButtonText}
                    </Button>
                    <Button
                      type='button'
                      size='tiny'
                      onClick={selectAllModels}
                      disabled={visibleModelOptions.length === 0}
                    >
                      {t('channel.edit.buttons.select_all')}
                    </Button>
                    <Button
                      type='button'
                      size='tiny'
                      onClick={clearSelectedModels}
                      disabled={inputs.models.length === 0}
                    >
                      {t('channel.edit.buttons.clear')}
                    </Button>
                  </div>
                </div>
                <div
                  style={{
                    border: '1px solid rgba(34, 36, 38, 0.15)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '8px 16px',
                  }}
                >
                  {visibleModelOptions.length === 0 ? (
                    <div style={{ color: 'rgba(0, 0, 0, 0.55)' }}>
                      {t('channel.edit.model_selector.empty')}
                    </div>
                  ) : (
                    visibleModelOptions.map((option) => (
                      <Checkbox
                        key={option.key}
                        label={option.text}
                        checked={inputs.models.includes(option.value)}
                        onChange={(e, { checked }) =>
                          toggleModelSelection(option.value, checked)
                        }
                      />
                    ))
                  )}
                </div>
                {modelsSyncError && (
                  <div style={{ color: '#d9534f', marginTop: '8px' }}>
                    {modelsSyncError}
                  </div>
                )}
              </Form.Field>
            )}
            {showStepThree && inputs.type !== 43 && (
              <>
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.model_mapping')}
                    placeholder={`${t(
                      'channel.edit.model_mapping_placeholder'
                    )}\n${JSON.stringify(MODEL_MAPPING_EXAMPLE, null, 2)}`}
                    name='model_mapping'
                    onChange={handleInputChange}
                    value={inputs.model_mapping}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.TextArea
                    label={`${t('operation.ratio.model.title', '模型倍率')}（JSON）`}
                    placeholder={t(
                      'operation.ratio.model.placeholder',
                      '为一个 JSON 文本，键为模型名称，值为倍率'
                    )}
                    name='model_ratio'
                    onChange={handleInputChange}
                    value={inputs.model_ratio}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.TextArea
                    label={`${t('operation.ratio.completion.title', '补全倍率')}（JSON）`}
                    placeholder={t(
                      'operation.ratio.completion.placeholder',
                      '为一个 JSON 文本，键为模型名称，值为倍率'
                    )}
                    name='completion_ratio'
                    onChange={handleInputChange}
                    value={inputs.completion_ratio}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.system_prompt')}
                    placeholder={t('channel.edit.system_prompt_placeholder')}
                    name='system_prompt'
                    onChange={handleInputChange}
                    value={inputs.system_prompt}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
              </>
            )}
            {showStepOne && inputs.type === 33 && (
              <Form.Field>
                <Form.Input
                  label='Region'
                  name='region'
                  required
                  placeholder={t('channel.edit.aws_region_placeholder')}
                  onChange={handleConfigChange}
                  value={config.region}
                  autoComplete=''
                />
                <Form.Input
                  label='AK'
                  name='ak'
                  required
                  placeholder={t('channel.edit.aws_ak_placeholder')}
                  onChange={handleConfigChange}
                  value={config.ak}
                  autoComplete=''
                />
                <Form.Input
                  label='SK'
                  name='sk'
                  required
                  placeholder={t('channel.edit.aws_sk_placeholder')}
                  onChange={handleConfigChange}
                  value={config.sk}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {showStepOne && inputs.type === 42 && (
              <Form.Field>
                <Form.Input
                  label='Region'
                  name='region'
                  required
                  placeholder={t('channel.edit.vertex_region_placeholder')}
                  onChange={handleConfigChange}
                  value={config.region}
                  autoComplete=''
                />
                <Form.Input
                  label={t('channel.edit.vertex_project_id')}
                  name='vertex_ai_project_id'
                  required
                  placeholder={t('channel.edit.vertex_project_id_placeholder')}
                  onChange={handleConfigChange}
                  value={config.vertex_ai_project_id}
                  autoComplete=''
                />
                <Form.Input
                  label={t('channel.edit.vertex_credentials')}
                  name='vertex_ai_adc'
                  required
                  placeholder={t('channel.edit.vertex_credentials_placeholder')}
                  onChange={handleConfigChange}
                  value={config.vertex_ai_adc}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {showStepOne && inputs.type === 34 && (
              <Form.Input
                label={t('channel.edit.user_id')}
                name='user_id'
                required
                placeholder={t('channel.edit.user_id_placeholder')}
                onChange={handleConfigChange}
                value={config.user_id}
                autoComplete=''
              />
            )}
            {showStepOne && inputs.type === 37 && (
              <Form.Field>
                <Form.Input
                  label='Account ID'
                  name='user_id'
                  required
                  placeholder={
                    '请输入 Account ID，例如：d8d7c61dbc334c32d3ced580e4bf42b4'
                  }
                  onChange={handleConfigChange}
                  value={config.user_id}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {isEdit ? (
              <>
                <Button onClick={handleCancel}>
                  {t('channel.edit.buttons.cancel')}
                </Button>
                <Button
                  type='button'
                  positive
                  onClick={submit}
                  disabled={
                    requireVerificationBeforeProceed && !isCurrentSignatureVerified
                  }
                >
                  {t('channel.edit.buttons.submit')}
                </Button>
              </>
            ) : (
              <>
                <Button type='button' onClick={handleCancel}>
                  {t('channel.edit.buttons.cancel')}
                </Button>
                {createStep > CREATE_CHANNEL_STEP_MIN && (
                  <Button type='button' onClick={moveToPreviousCreateStep}>
                    {t('channel.edit.buttons.previous_step')}
                  </Button>
                )}
                {createStep < CREATE_CHANNEL_STEP_MAX ? (
                  <Button
                    type='button'
                    positive
                    onClick={createStep === 1 ? moveToStepTwo : moveToStepThree}
                  >
                    {t('channel.edit.buttons.next_step')}
                  </Button>
                ) : (
                  <Button
                    type='button'
                    positive
                    onClick={submit}
                    disabled={
                      requireVerificationBeforeProceed && !isCurrentSignatureVerified
                    }
                  >
                    {t('channel.edit.buttons.submit')}
                  </Button>
                )}
              </>
            )}
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
};

export default EditChannel;
