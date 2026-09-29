// Pure module-level helpers, constants and small presentational pieces extracted
// from ProvidersManager.jsx to keep the container focused on data + effects.
// Nothing here reads ProvidersManager state; `t` is always passed in as an arg.
import React, { useState } from 'react';
import { AppButton } from '../router-ui';
const PROVIDER_DETAIL_MODEL_PAGE_SIZE = 20;
const PROVIDER_CATALOG_REQUEST_PAGE_SIZE = 100;
const PROVIDER_MODEL_STATUS_FILTER_ALL = 'all';
const PROVIDER_ENDPOINT_SORT_ORDER = {
  '/v1/chat/completions': 10,
  '/v1/responses': 20,
  '/v1/messages': 30,
  '/v1/images/generations': 40,
  '/v1/images/edits': 50,
  '/v1/batches': 60,
  '/v1/embeddings': 65,
  '/v1/audio/speech': 70,
  '/v1/realtime': 80,
  '/v1/videos': 90,
};

const formatProviderModelUsageError = (message, t) => {
  if (typeof message !== 'string') return '';
  const marker = ' is still in use: ';
  const markerIndex = message.indexOf(marker);
  if (markerIndex < 0) return '';
  const detailPart = message.slice(markerIndex + marker.length).trim();
  if (!detailPart) return '';

  const blocks = detailPart
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  if (blocks.length === 0) return '';

  const lines = [t('channel.providers.messages.model_in_use')];
  blocks.forEach((block) => {
    const [rawKey, rawValue] = block.split('=');
    const key = (rawKey || '').trim();
    const value = (rawValue || '').trim();
    if (!key || !value) return;
    const labelKey = `channel.providers.messages.model_usage_${key}`;
    const label = t(labelKey, { defaultValue: key });
    lines.push(`${label}: ${value}`);
  });
  return lines.join('\n');
};

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
    case 'x-ai':
    case 'xai':
    case 'grok':
      return 'xai';
    case 'meta':
    case 'meta-llama':
    case 'meta_llama':
    case 'metallama':
      return 'meta';
    case 'mistral':
    case 'mistralai':
      return 'mistral';
    case 'cohere':
    case 'command-r':
    case 'commandr':
      return 'cohere';
    case 'deepseek':
      return 'deepseek';
    case 'qianwen':
    case 'qwen':
    case 'qwq':
    case 'qvq':
      return 'qwen';
    case 'zhipu':
    case 'zhipuai':
    case 'zhipu-ai':
    case 'zhipu_ai':
    case 'glm':
    case 'bigmodel':
      return 'zhipu';
    case 'hunyuan':
    case 'tencent':
      return 'hunyuan';
    case 'volc':
    case 'volcengine':
    case 'doubao':
    case 'ark':
      return 'volcengine';
    case 'minimax':
    case 'abab':
      return 'minimax';
    case 'moonshot':
    case 'moonshotai':
    case 'kimi':
      return 'moonshot';
    case 'amazon-nova':
    case 'amazon_nova':
      return 'amazon-nova';
    case 'black-forest-labs':
    case 'blackforestlabs':
    case 'bfl':
      return 'black-forest-labs';
    case 'perplexity':
      return 'perplexity';
    case 'voyage':
    case 'voyageai':
    case 'voyage-ai':
    case 'voyage ai':
      return 'voyageai';
    case 'deepgram':
      return 'deepgram';
    case 'assemblyai':
    case 'assembly-ai':
      return 'assemblyai';
    default:
      if (trimmed === '千问' || trimmed === '通义千问') return 'qwen';
      if (trimmed === '智谱' || trimmed === '智谱AI') return 'zhipu';
      if (trimmed === '腾讯' || trimmed === '混元') return 'hunyuan';
      if (trimmed === '火山' || trimmed === '豆包' || trimmed === '字节')
        return 'volcengine';
      return lower;
  }
};

const PROVIDER_DISPLAY_ID_MAP = {
  qwen: 'qianwen',
  hunyuan: 'hunyuan',
  baidu: 'baidu',
  zhipu: 'zhipu',
};

const PROVIDER_DISPLAY_NAME_MAP = {
  qwen: 'QianWen',
  hunyuan: 'Hunyuan',
  baidu: 'BaiDu',
  zhipu: 'ZhiPu',
  volcengine: 'VolcEngine',
  moonshot: 'Moonshot AI / Kimi',
  'amazon-nova': 'Amazon Nova',
  meta: 'Meta / Llama',
  'black-forest-labs': 'Black Forest Labs / FLUX',
  perplexity: 'Perplexity',
  voyageai: 'Voyage AI',
  deepgram: 'Deepgram',
  assemblyai: 'AssemblyAI',
};

const PROVIDER_ICON_PATHS = {
  openai: '/provider/icons/openai.ico',
  anthropic: '/provider/icons/anthropic.svg',
  google: '/provider/icons/google.svg',
  xai: '/provider/icons/xai.svg',
  mistral: '/provider/icons/mistral.svg',
  cohere: '/provider/icons/cohere.ico',
  deepseek: '/provider/icons/deepseek.svg',
  qwen: '/provider/icons/qwen.svg',
  zhipu: '/provider/icons/zhipu.png',
  baidu: '/provider/icons/baidu.svg',
  hunyuan: '/provider/icons/hunyuan.ico',
  volcengine: '/provider/icons/volcengine.png',
  minimax: '/provider/icons/minimax.ico',
  stepfun: '/provider/icons/stepfun.png',
  moonshot: '/provider/icons/moonshot.ico',
  'amazon-nova': '/provider/icons/amazon-nova.ico',
  meta: '/provider/icons/meta.svg',
  'black-forest-labs': '/provider/icons/black-forest-labs.ico',
  perplexity: '/provider/icons/perplexity.svg',
  voyageai: '/provider/icons/voyageai.ico',
  deepgram: '/provider/icons/deepgram.svg',
  assemblyai: '/provider/icons/assemblyai.ico',
};

const PROVIDER_BRAND_TONES = {
  openai: 'ink',
  anthropic: 'clay',
  google: 'blue',
  xai: 'ink',
  mistral: 'orange',
  cohere: 'coral',
  deepseek: 'blue',
  qwen: 'orange',
  zhipu: 'teal',
  baidu: 'blue',
  hunyuan: 'teal',
  volcengine: 'red',
  minimax: 'red',
  stepfun: 'blue',
  moonshot: 'ink',
  'amazon-nova': 'orange',
  meta: 'blue',
  'black-forest-labs': 'ink',
  perplexity: 'ink',
  voyageai: 'violet',
  deepgram: 'violet',
  assemblyai: 'violet',
};

const formatProviderDisplayId = (provider) => {
  const normalized = normalizeProvider(provider);
  if (!normalized) return '';
  return PROVIDER_DISPLAY_ID_MAP[normalized] || normalized;
};

const formatProviderDisplayName = (provider, name) => {
  const normalized = normalizeProvider(provider);
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName) {
    if (normalized && PROVIDER_DISPLAY_NAME_MAP[normalized]) {
      return PROVIDER_DISPLAY_NAME_MAP[normalized];
    }
    return trimmedName;
  }
  if (!normalized) return '';
  return PROVIDER_DISPLAY_NAME_MAP[normalized] || normalized;
};

const providerMonogram = (provider, name) => {
  const value = (name || provider || '').toString().trim();
  if (!value) return '?';
  const compact = value.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
  return (compact.slice(0, 2) || value.slice(0, 1)).toUpperCase();
};

function ProviderBrandMark({ provider, name }) {
  const [imageFailed, setImageFailed] = useState(false);
  const normalized = normalizeProvider(provider);
  const source = PROVIDER_ICON_PATHS[normalized];
  const displayName = formatProviderDisplayName(normalized, name) || normalized;
  const tone = PROVIDER_BRAND_TONES[normalized] || 'slate';

  return (
    <span
      className={`router-provider-brand-mark router-provider-brand-mark-${tone}`}
      aria-label={displayName}
      title={displayName}
    >
      {source && !imageFailed ? (
        <img src={source} alt='' onError={() => setImageFailed(true)} />
      ) : (
        <span className='router-provider-brand-monogram'>
          {providerMonogram(normalized, displayName)}
        </span>
      )}
    </span>
  );
}

const buildPriceComponentRowKey = (scope, component) =>
  [
    scope || 'model',
    component?.id || '',
    component?.component || 'component',
    component?.condition || 'condition',
    component?.currency || '',
    component?.price || component?.value || '',
  ].join('-');

const inferModelType = (model) => {
  if (typeof model !== 'string') return 'text';
  const lower = model.trim().toLowerCase();
  if (!lower) return 'text';
  if (
    lower.includes('embedding') ||
    lower.startsWith('text-embedding')
  ) {
    return 'embedding';
  }
  if (
    lower.startsWith('veo') ||
    lower.includes('text-to-video') ||
    lower.includes('video-generation') ||
    lower.includes('video_generation') ||
    lower.includes('video')
  ) {
    return 'video';
  }
  if (
    lower.includes('whisper') ||
    lower.startsWith('tts-') ||
    lower.includes('audio')
  ) {
    return 'audio';
  }
  if (
    lower.startsWith('dall-e') ||
    lower.startsWith('cogview') ||
    lower.includes('stable-diffusion') ||
    lower.startsWith('wanx') ||
    lower.startsWith('step-1x') ||
    lower.includes('flux')
  ) {
    return 'image';
  }
  return 'text';
};

const defaultPriceUnitByType = (type, modelName) => {
  if (type === 'image') return 'per_image';
  if (type === 'video') return 'per_video';
  if (type === 'audio') {
    if (
      typeof modelName === 'string' &&
      modelName.trim().toLowerCase().startsWith('tts-')
    ) {
      return 'per_1k_chars';
    }
    return 'per_1k_tokens';
  }
  return 'per_1k_tokens';
};

const defaultPriceUnitByComponent = (component) => {
  const normalized = (component || '').toString().trim().toLowerCase();
  switch (normalized) {
    case 'image_generation':
      return 'per_image';
    case 'video_generation':
      return 'per_video';
    case 'audio_output':
      return 'per_1k_chars';
    case 'audio_input':
    case 'realtime_audio':
      return 'per_minute';
    case 'text_cache_read':
    case 'text_cache_write':
    case 'realtime_text':
    case 'text':
    default:
      return 'per_1k_tokens';
  }
};

function normalizeProviderModelType(value, model) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (
    normalized === 'text' ||
    normalized === 'audio' ||
    normalized === 'image' ||
    normalized === 'video' ||
    normalized === 'embedding'
  ) {
    return normalized;
  }
  return inferModelType(model);
}

const BASE_MODEL_TAGS = ['text', 'image', 'audio', 'video', 'embedding'];
const PROVIDER_MODEL_TAG_ORDER = [
  'text',
  'image',
  'audio',
  'video',
  'embedding',
  'tool_calling',
  'reasoning',
  'vision',
  'realtime',
  'structured_output',
];

const normalizeProviderModelTags = (tags, model) => {
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',')
      : [];
  const seen = new Set();
  values.forEach((item) => {
    const tag = (item || '').toString().trim().toLowerCase();
    if (!PROVIDER_MODEL_TAG_ORDER.includes(tag)) return;
    seen.add(tag);
  });
  return PROVIDER_MODEL_TAG_ORDER.filter((tag) => seen.has(tag));
};

const providerModelTypeFromTags = (tags, model) => {
  const normalizedTags = normalizeProviderModelTags(tags, model);
  return normalizedTags.find((tag) => BASE_MODEL_TAGS.includes(tag)) || '';
};

const normalizeProviderEndpoint = (endpoint) => {
  const normalized = (endpoint || '').toString().trim().toLowerCase();
  if (normalized.startsWith('/v1/chat/completions')) {
    return '/v1/chat/completions';
  }
  if (normalized.startsWith('/v1/responses')) {
    return '/v1/responses';
  }
  if (normalized.startsWith('/v1/messages')) {
    return '/v1/messages';
  }
  if (normalized.startsWith('/v1/images/generations')) {
    return '/v1/images/generations';
  }
  if (normalized.startsWith('/v1/images/edits')) {
    return '/v1/images/edits';
  }
  if (normalized.startsWith('/v1/batches')) {
    return '/v1/batches';
  }
  if (normalized.startsWith('/v1/embeddings')) {
    return '/v1/embeddings';
  }
  if (normalized.startsWith('/v1/audio/')) {
    return '/v1/audio/speech';
  }
  if (normalized.startsWith('/v1/realtime')) {
    return '/v1/realtime';
  }
  if (normalized.startsWith('/v1/videos')) {
    return '/v1/videos';
  }
  return '';
};

const isProviderEndpointAllowedForType = (type, endpoint) => {
  const normalizedType = normalizeProviderModelType(type, '');
  switch (normalizedType) {
    case 'image':
      return [
        '/v1/responses',
        '/v1/images/generations',
        '/v1/images/edits',
        '/v1/batches',
      ].includes(endpoint);
    case 'audio':
      return endpoint === '/v1/audio/speech' || endpoint === '/v1/realtime';
    case 'video':
      return endpoint === '/v1/videos';
    case 'embedding':
      return endpoint === '/v1/embeddings';
    case 'text':
    default:
      return ['/v1/chat/completions', '/v1/responses', '/v1/messages'].includes(
        endpoint,
      );
  }
};

const normalizeSupportedEndpoints = (endpoints, type) => {
  const values = Array.isArray(endpoints)
    ? endpoints
    : typeof endpoints === 'string'
      ? endpoints.split(',')
      : [];
  const seen = new Set();
  const result = [];
  values.forEach((item) => {
    const endpoint = normalizeProviderEndpoint(item);
    if (!endpoint || !isProviderEndpointAllowedForType(type, endpoint)) {
      return;
    }
    if (seen.has(endpoint)) {
      return;
    }
    seen.add(endpoint);
    result.push(endpoint);
  });
  return result.sort(
    (a, b) =>
      (PROVIDER_ENDPOINT_SORT_ORDER[a] || 1000) -
        (PROVIDER_ENDPOINT_SORT_ORDER[b] || 1000) || a.localeCompare(b),
  );
};

const createEmptyPriceComponent = (component = '') => ({
  component,
  condition: '',
  input_price: 0,
  output_price: 0,
  price_unit: defaultPriceUnitByComponent(component),
  currency: 'USD',
  source: 'manual',
  source_url: '',
  updated_at: 0,
});

const normalizePriceComponents = (components) => {
  if (!Array.isArray(components)) return [];
  const unique = new Map();
  components.forEach((item, index) => {
    if (!item) return;
    const component = (item.component || '').toString().trim().toLowerCase();
    if (!component) return;
    const condition = (item.condition || '').toString().trim();
    const inputPrice = Number(item.input_price || 0);
    const outputPrice = Number(item.output_price || 0);
    const priceUnit =
      typeof item.price_unit === 'string' && item.price_unit.trim() !== ''
        ? item.price_unit.trim().toLowerCase()
        : defaultPriceUnitByComponent(component);
    const currency =
      typeof item.currency === 'string' && item.currency.trim() !== ''
        ? item.currency.trim().toUpperCase()
        : 'USD';
    const source =
      typeof item.source === 'string' && item.source.trim() !== ''
        ? item.source.trim().toLowerCase()
        : 'manual';
    const sourceUrl =
      typeof item.source_url === 'string' && item.source_url.trim() !== ''
        ? item.source_url.trim()
        : '';
    const updatedAt = Number(item.updated_at || 0);
    const sortOrder = Number(item.sort_order || 0);
    unique.set(`${component}\u0000${condition}\u0000${index}`, {
      component,
      condition,
      input_price:
        Number.isFinite(inputPrice) && inputPrice > 0 ? inputPrice : 0,
      output_price:
        Number.isFinite(outputPrice) && outputPrice > 0 ? outputPrice : 0,
      price_unit: priceUnit,
      currency,
      source,
      source_url: sourceUrl,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      updated_at: Number.isInteger(updatedAt) && updatedAt > 0 ? updatedAt : 0,
    });
  });
  return Array.from(unique.values()).sort((a, b) => {
    const bySort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
    if (bySort !== 0) return bySort;
    const byComponent = (a.component || '').localeCompare(b.component || '');
    if (byComponent !== 0) return byComponent;
    return (a.condition || '').localeCompare(b.condition || '');
  });
};

const createEmptyModelDetail = (model = '') => {
  const t = inferModelType(model);
  return {
    model,
    tags: [t],
    status: 'active',
    description: '',
    is_deleted: false,
    supported_endpoints: [],
    input_price: 0,
    output_price: 0,
    price_unit: defaultPriceUnitByType(t, model),
    currency: 'USD',
    source: 'manual',
    updated_at: 0,
    price_components: [],
  };
};

const normalizeModelDetails = (details) => {
  if (!Array.isArray(details)) return [];
  const unique = new Map();
  details.forEach((item) => {
    if (!item) return;
    const model =
      typeof item.model === 'string'
        ? item.model.trim()
        : typeof item.id === 'string'
          ? item.id.trim()
          : '';
    if (!model) return;
    const tags = normalizeProviderModelTags(item.tags, model);
    const type = providerModelTypeFromTags(tags, model);
    const inputPrice = Number(item.input_price || 0);
    const outputPrice = Number(item.output_price || 0);
    const currency =
      typeof item.currency === 'string' && item.currency.trim() !== ''
        ? item.currency.trim().toUpperCase()
        : 'USD';
    const priceUnit =
      typeof item.price_unit === 'string' && item.price_unit.trim() !== ''
        ? item.price_unit.trim().toLowerCase()
        : defaultPriceUnitByType(type, model);
    const source =
      typeof item.source === 'string' && item.source.trim() !== ''
        ? item.source.trim().toLowerCase()
        : 'manual';
    const status =
      typeof item.status === 'string' && item.status.trim() !== ''
        ? item.status.trim().toLowerCase()
        : 'active';
    const description =
      typeof item.description === 'string' ? item.description.trim() : '';
    const isDeleted = item.is_deleted === true;
    const updatedAt = Number(item.updated_at || 0);
    unique.set(model, {
      model,
      tags,
      status,
      description,
      is_deleted: isDeleted,
      supported_endpoints: normalizeSupportedEndpoints(
        item.supported_endpoints,
        type,
      ),
      specification:
        item.specification && typeof item.specification === 'object'
          ? item.specification
          : null,
      input_price:
        Number.isFinite(inputPrice) && inputPrice > 0 ? inputPrice : 0,
      output_price:
        Number.isFinite(outputPrice) && outputPrice > 0 ? outputPrice : 0,
      price_unit: priceUnit,
      currency,
      source,
      updated_at: Number.isInteger(updatedAt) && updatedAt > 0 ? updatedAt : 0,
      price_components: normalizePriceComponents(item.price_components),
    });
  });
  return Array.from(unique.values())
    .filter((item) => item.is_deleted !== true)
    .sort((a, b) => a.model.localeCompare(b.model));
};

const detailsFromCatalogItem = (item) => {
  if (Array.isArray(item?.model_details) && item.model_details.length > 0) {
    return normalizeModelDetails(item.model_details);
  }
  if (Array.isArray(item?.models) && item.models.length > 0) {
    return normalizeModelDetails(item.models.map((model) => ({ model })));
  }
  return [];
};

const createEmptyRow = () => ({
  id: '',
  name: '',
  base_url: '',
  official_url: '',
  model_details: [],
  source: 'manual',
  created_at: 0,
  updated_at: 0,
});

const toEditableRows = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...createEmptyRow(),
    id: normalizeProvider(item?.id || item?.provider || item?.name || ''),
    name: item?.name || '',
    base_url: item?.base_url || '',
    official_url: item?.official_url || '',
    model_details: detailsFromCatalogItem(item),
    source: item?.source || 'manual',
    created_at: item?.created_at || 0,
    updated_at: item?.updated_at || 0,
  }));
};

const OFFICIAL_PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  anthropic: 'https://api.anthropic.com',
  xai: 'https://api.x.ai',
  mistral: 'https://api.mistral.ai',
  cohere: 'https://api.cohere.com/compatibility/v1',
  deepseek: 'https://api.deepseek.com',
  baidu: 'https://qianfan.baidubce.com/v2',
  qwen: 'https://dashscope.aliyuncs.com',
  zhipu: 'https://open.bigmodel.cn',
  hunyuan: 'https://api.hunyuan.cloud.tencent.com/v1',
  minimax: 'https://api.minimax.io/v1',
  stepfun: 'https://api.stepfun.com/v1',
  volcengine: 'https://ark.cn-beijing.volces.com',
};

const cloneEditableRow = (row) => toEditableRows([row])[0] || createEmptyRow();
const cloneModelDetail = (detail) =>
  normalizeModelDetails([detail])[0] || createEmptyModelDetail('');

const MODEL_TAG_OPTIONS = PROVIDER_MODEL_TAG_ORDER.map((tag) => ({
  key: tag,
  value: tag,
  text: tag,
}));

const PROVIDER_MODEL_STATUS_OPTIONS = [
  { key: 'active', value: 'active', text: 'active' },
  { key: 'deprecated', value: 'deprecated', text: 'deprecated' },
];

const PROVIDER_ENDPOINT_OPTIONS = [
  {
    key: '/v1/chat/completions',
    value: '/v1/chat/completions',
    text: '/v1/chat/completions',
  },
  { key: '/v1/responses', value: '/v1/responses', text: '/v1/responses' },
  { key: '/v1/messages', value: '/v1/messages', text: '/v1/messages' },
  {
    key: '/v1/images/generations',
    value: '/v1/images/generations',
    text: '/v1/images/generations',
  },
  {
    key: '/v1/images/edits',
    value: '/v1/images/edits',
    text: '/v1/images/edits',
  },
  { key: '/v1/batches', value: '/v1/batches', text: '/v1/batches' },
  {
    key: '/v1/embeddings',
    value: '/v1/embeddings',
    text: '/v1/embeddings',
  },
  {
    key: '/v1/audio/speech',
    value: '/v1/audio/speech',
    text: '/v1/audio/speech',
  },
  { key: '/v1/videos', value: '/v1/videos', text: '/v1/videos' },
];

const providerEndpointOptionsForType = (type) =>
  type
    ? PROVIDER_ENDPOINT_OPTIONS.filter((option) =>
        isProviderEndpointAllowedForType(type, option.value),
      )
    : [];

const PRICE_UNIT_OPTIONS = [
  { key: 'per_1k_tokens', value: 'per_1k_tokens', text: 'per_1k_tokens' },
  { key: 'per_1k_chars', value: 'per_1k_chars', text: 'per_1k_chars' },
  { key: 'per_image', value: 'per_image', text: 'per_image' },
  { key: 'per_video', value: 'per_video', text: 'per_video' },
  { key: 'per_minute', value: 'per_minute', text: 'per_minute' },
  { key: 'per_second', value: 'per_second', text: 'per_second' },
  { key: 'per_request', value: 'per_request', text: 'per_request' },
  { key: 'per_task', value: 'per_task', text: 'per_task' },
];

const PRICE_COMPONENT_OPTIONS = [
  { key: 'text', value: 'text', text: 'text' },
  {
    key: 'text_cache_read',
    value: 'text_cache_read',
    text: 'text_cache_read',
  },
  {
    key: 'text_cache_write',
    value: 'text_cache_write',
    text: 'text_cache_write',
  },
  {
    key: 'image_generation',
    value: 'image_generation',
    text: 'image_generation',
  },
  { key: 'audio_input', value: 'audio_input', text: 'audio_input' },
  { key: 'audio_output', value: 'audio_output', text: 'audio_output' },
  {
    key: 'video_generation',
    value: 'video_generation',
    text: 'video_generation',
  },
  { key: 'realtime_text', value: 'realtime_text', text: 'realtime_text' },
  { key: 'realtime_audio', value: 'realtime_audio', text: 'realtime_audio' },
];

const SOURCE_OPTIONS = [
  { key: 'manual', value: 'manual', text: 'manual' },
  { key: 'default', value: 'default', text: 'default' },
  { key: 'official', value: 'official', text: 'official' },
  { key: 'imported', value: 'imported', text: 'imported' },
];

const TEXT_ENDPOINT_OPTIONS = [
  { key: '/v1/responses', value: '/v1/responses', text: '/v1/responses' },
  {
    key: '/v1/chat/completions',
    value: '/v1/chat/completions',
    text: '/v1/chat/completions',
  },
];

const IMAGE_QUALITY_OPTIONS = [
  { key: 'standard', value: 'standard', text: 'standard' },
  { key: 'hd', value: 'hd', text: 'hd' },
];

const IMAGE_SIZE_OPTIONS = [
  { key: '1024x1024', value: '1024x1024', text: '1024x1024' },
  { key: '1024x1792', value: '1024x1792', text: '1024x1792' },
  { key: '1792x1024', value: '1792x1024', text: '1792x1024' },
];

const parseConditionString = (condition) => {
  const result = {};
  const normalized = (condition || '').toString().trim();
  if (!normalized) return result;
  normalized.split(';').forEach((part) => {
    const pair = part.trim();
    if (!pair) return;
    const index = pair.indexOf('=');
    if (index <= 0) return;
    const key = pair.slice(0, index).trim().toLowerCase();
    const value = pair
      .slice(index + 1)
      .trim()
      .toLowerCase();
    if (!key) return;
    result[key] = value;
  });
  return result;
};

const buildConditionString = (attrs, orderedKeys) => {
  if (!attrs || typeof attrs !== 'object') return '';
  return orderedKeys
    .map((key) => {
      const normalizedKey = (key || '').toString().trim().toLowerCase();
      const value = (attrs[normalizedKey] || '')
        .toString()
        .trim()
        .toLowerCase();
      if (!normalizedKey || !value) return '';
      return `${normalizedKey}=${value}`;
    })
    .filter(Boolean)
    .join(';');
};

const formatProviderPriceCellValue = (value) => {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : '-';
};

// Currency/unit meta for a flat (non-component) price number. Always derived from
// the model's flat currency + price_unit so it stays visible even when the model
// also carries auxiliary price components (e.g. a cache-read component): those
// components describe extra charges, they never replace the base price's unit.
const formatProviderPriceMeta = (detail) => {
  const parts = [];
  const currency = (detail?.currency || '').toString().trim().toUpperCase();
  const priceUnit = (detail?.price_unit || '').toString().trim();
  if (currency) {
    parts.push(currency);
  }
  if (priceUnit) {
    parts.push(priceUnit);
  }
  return parts.join(' / ');
};

const renderProviderPriceCell = (detail, field, t, openPricingDetail) => {
  const hasDetail =
    field === 'input_price'
      ? hasComplexInputPricing(detail)
      : hasComplexOutputPricing(detail);
  if (hasDetail) {
    return (
      <AppButton
        type='button'
        basic
        className='router-inline-button'
        onClick={() => openPricingDetail(detail)}
      >
        {t('channel.providers.model_detail_table.detail')}
      </AppButton>
    );
  }
  const priceText = formatProviderPriceCellValue(detail?.[field]);
  const metaText = priceText === '-' ? '' : formatProviderPriceMeta(detail);
  return (
    <div className='router-provider-model-price-cell'>
      <span className='router-monospace-value'>{priceText}</span>
      {metaText ? <span className='router-muted'>{metaText}</span> : null}
    </div>
  );
};

const isComponentBasedPricing = (detail) =>
  Array.isArray(detail?.price_components) && detail.price_components.length > 0;

const summarizeModelPriceUnit = (detail, t) => {
  if (isComponentBasedPricing(detail)) {
    return '-';
  }
  return detail?.price_unit || '-';
};

const hasComplexInputPricing = (detail) =>
  Array.isArray(detail?.price_components) &&
  detail.price_components.some(
    (component) => Number(component?.input_price || 0) > 0,
  );

const hasComplexOutputPricing = (detail) =>
  Array.isArray(detail?.price_components) &&
  detail.price_components.some(
    (component) => Number(component?.output_price || 0) > 0,
  );

export {
  PROVIDER_DETAIL_MODEL_PAGE_SIZE,
  PROVIDER_CATALOG_REQUEST_PAGE_SIZE,
  PROVIDER_MODEL_STATUS_FILTER_ALL,
  PROVIDER_ENDPOINT_SORT_ORDER,
  PROVIDER_DISPLAY_ID_MAP,
  PROVIDER_DISPLAY_NAME_MAP,
  PROVIDER_ICON_PATHS,
  PROVIDER_BRAND_TONES,
  BASE_MODEL_TAGS,
  PROVIDER_MODEL_TAG_ORDER,
  OFFICIAL_PROVIDER_BASE_URLS,
  MODEL_TAG_OPTIONS,
  PROVIDER_MODEL_STATUS_OPTIONS,
  PROVIDER_ENDPOINT_OPTIONS,
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
  providerMonogram,
  ProviderBrandMark,
  buildPriceComponentRowKey,
  inferModelType,
  defaultPriceUnitByType,
  defaultPriceUnitByComponent,
  normalizeProviderModelType,
  normalizeProviderModelTags,
  providerModelTypeFromTags,
  normalizeProviderEndpoint,
  isProviderEndpointAllowedForType,
  normalizeSupportedEndpoints,
  createEmptyPriceComponent,
  normalizePriceComponents,
  createEmptyModelDetail,
  normalizeModelDetails,
  detailsFromCatalogItem,
  createEmptyRow,
  toEditableRows,
  cloneEditableRow,
  cloneModelDetail,
  providerEndpointOptionsForType,
  parseConditionString,
  buildConditionString,
  formatProviderPriceCellValue,
  formatProviderPriceMeta,
  renderProviderPriceCell,
  isComponentBasedPricing,
  summarizeModelPriceUnit,
  hasComplexInputPricing,
  hasComplexOutputPricing,
};
