// Shared AI provider endpoints + model-id inference.
// Groq/Gemini/OpenRouter each have their own key so Llama is never
// sent to Gemini (that returns "Invalid API Key").

const PROVIDERS = {
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyField: 'admin_groq_key',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyField: 'admin_gemini_key',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyField: 'admin_openrouter_key',
  },
  cerebras: {
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyField: 'admin_cerebras_key',
  },
  custom: {
    label: 'Custom',
    baseUrl: null,
    keyField: 'admin_custom_key',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    keyField: 'admin_openai_key',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: null,
    keyField: 'admin_anthropic_key',
  },
};

const KEY_FIELDS = [
  'admin_anthropic_key',
  'admin_openai_key',
  'admin_groq_key',
  'admin_gemini_key',
  'admin_openrouter_key',
  'admin_cerebras_key',
  'admin_custom_key',
  'admin_custom_base_url',
];

const PROVIDER_IDS = Object.keys(PROVIDERS);

// Groq shut down these free/developer models on 16 Aug 2026.
const GROQ_MODEL_MIGRATIONS = {
  'llama-3.3-70b-versatile': { model_id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Groq)' },
  'llama-3.1-8b-instant': { model_id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B Instant (Groq)' },
};

const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';

function inferProvider(modelId, storedProvider) {
  const id = String(modelId || '').toLowerCase();
  if (id.includes(':free') || id.startsWith('meta-llama/') || id.startsWith('google/gemma') || id.startsWith('mistralai/')) {
    return 'openrouter';
  }
  if (id.startsWith('gemini-')) return 'gemini';
  if (
    id === 'llama-3.3-70b-versatile' ||
    id === 'llama-3.3-70b' ||
    id === 'llama-3.1-8b-instant' ||
    id.includes('gpt-oss') ||
    id.startsWith('llama-3.2') ||
    id.startsWith('llama-3.3') ||
    id.startsWith('qwen/qwen3.6') ||
    id.startsWith('groq/')
  ) return 'groq';
  if (id === 'llama3.1-8b' || id === 'llama3.3-70b') return 'cerebras';
  if (storedProvider && PROVIDERS[storedProvider]) return storedProvider;
  return 'custom';
}

function chatCompletionsUrl(baseUrl) {
  const raw = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(raw)) return raw;
  if (/\/v1$/i.test(raw) || /\/openai$/i.test(raw)) return raw + '/chat/completions';
  return raw + '/v1/chat/completions';
}

function looksLikeUrl(key) {
  return /^https?:\/\//i.test(String(key || '').trim());
}

function sanitizeKey(key) {
  return String(key || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function guessKeyProvider(key) {
  const k = sanitizeKey(key);
  if (looksLikeUrl(k)) return '';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'gemini';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('csk-')) return 'cerebras';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-')) return 'openai';
  return '';
}

function describeKey(key) {
  const s = sanitizeKey(key);
  if (!s) return 'no key';
  if (looksLikeUrl(s)) return 'a URL (base URL is not an API key)';
  const p = guessKeyProvider(s);
  if (p === 'groq') {
    if (s.length < 40) {
      return `an incomplete Groq key (${s.length} chars — full gsk_ keys are ~56 characters; copy it once from console.groq.com/keys)`;
    }
    return `a Groq gsk_ key (${s.length} chars) that Groq rejected — the key is revoked or not copied fully. Create a NEW key and paste the whole value into the Groq card`;
  }
  if (p) return `a ${PROVIDERS[p]?.label || p} key, not Groq`;
  return `key starting with "${s.slice(0, 6)}…" (${s.length} chars)`;
}

function formatProviderError(status, raw, { host, model, apiKey } = {}) {
  const msg = String(raw || '');
  const replacement = GROQ_MODEL_MIGRATIONS[model];
  if (replacement || /decommissioned|model_not_found|does not exist|no longer (available|supported)/i.test(msg)) {
    if (replacement) {
      return `Groq shut down ${model} on 16 Aug 2026. Use ${replacement.model_id} instead.`;
    }
    return msg;
  }
  if (status === 401 || /invalid api key|incorrect api key|unauthorized/i.test(msg)) {
    const groqHint = /groq/i.test(String(host || ''))
      ? ' Groq needs a gsk_ key from https://console.groq.com/keys — saving the base URL is not enough.'
      : '';
    return `Invalid API Key (${host || '?'} / ${model || '?'}). Sent ${describeKey(apiKey)}.${groqHint}`;
  }
  return msg || `API error (${status})`;
}

function keySlots(keys) {
  return [keys.groq, keys.custom, keys.openai, keys.gemini, keys.openrouter, keys.cerebras, keys.anthropic]
    .map((k) => sanitizeKey(k))
    .filter((k) => k && !looksLikeUrl(k));
}

/** Pick a key that actually belongs to this provider (prefix), never a mismatched one. */
function keyForProvider(provider, keys) {
  const prefixed = keySlots(keys).find((k) => guessKeyProvider(k) === provider);
  if (prefixed) return prefixed;
  const slot = sanitizeKey(keys[provider] || '');
  if (!slot || looksLikeUrl(slot)) return '';
  const guessed = guessKeyProvider(slot);
  if (!guessed || guessed === provider) return slot;
  return '';
}

function assertUsableKey(key, provider) {
  const cleaned = sanitizeKey(key);
  if (!cleaned) {
    const err = new Error('Paste an API key first');
    err.status = 400;
    throw err;
  }
  if (looksLikeUrl(cleaned)) {
    const err = new Error('That is a base URL, not an API key. Groq keys start with gsk_');
    err.status = 400;
    throw err;
  }
  if (provider === 'groq' || guessKeyProvider(cleaned) === 'groq') {
    if (!cleaned.startsWith('gsk_')) {
      const err = new Error('Groq keys start with gsk_. Create one at https://console.groq.com/keys');
      err.status = 400;
      throw err;
    }
    if (cleaned.length < 40) {
      const err = new Error(`That Groq key looks incomplete (${cleaned.length} characters). Copy the full key — Groq shows it only once.`);
      err.status = 400;
      throw err;
    }
  }
  return cleaned;
}

module.exports = {
  PROVIDERS, KEY_FIELDS, PROVIDER_IDS,
  GROQ_MODEL_MIGRATIONS, GROQ_DEFAULT_MODEL,
  inferProvider, chatCompletionsUrl, guessKeyProvider, keyForProvider,
  looksLikeUrl, describeKey, formatProviderError, sanitizeKey, assertUsableKey,
};
