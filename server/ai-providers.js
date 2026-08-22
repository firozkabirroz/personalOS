// Shared AI provider routing.
// Catalog `provider` is the source of truth — never override a saved
// OpenAI / Anthropic / custom choice based on the model id string.

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
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyField: 'admin_openai_key',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyField: 'admin_anthropic_key',
  },
  custom: {
    label: 'Custom',
    baseUrl: null,
    keyField: 'admin_custom_key',
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

const DEFAULT_TEST_MODELS = {
  groq: 'openai/gpt-oss-20b',
  gemini: 'gemini-2.0-flash',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  cerebras: 'llama3.1-8b',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

// Groq shut down these free/developer models on 16 Aug 2026.
const GROQ_MODEL_MIGRATIONS = {
  'llama-3.3-70b-versatile': { model_id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Groq)' },
  'llama-3.1-8b-instant': { model_id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B Instant (Groq)' },
};

const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';

function looksLikeUrl(key) {
  return /^https?:\/\//i.test(String(key || '').trim());
}

function isLocalAiUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(url || ''));
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

/** Guess only when the catalog row has no valid provider. */
function guessProviderFromModelId(modelId) {
  const id = String(modelId || '').toLowerCase();
  if (!id) return '';
  if (id.startsWith('claude')) return 'anthropic';
  if (
    id.includes(':free') ||
    id.startsWith('meta-llama/') ||
    id.startsWith('google/gemma') ||
    id.startsWith('mistralai/') ||
    id.startsWith('anthropic/')
  ) return 'openrouter';
  if (id.startsWith('gemini-')) return 'gemini';
  if (GROQ_MODEL_MIGRATIONS[id] || id.startsWith('groq/')) return 'groq';
  if (id.startsWith('openai/gpt-oss') || id.startsWith('qwen/qwen3.6')) return 'groq';
  if (id === 'llama-3.3-70b-versatile' || id === 'llama-3.1-8b-instant' || id === 'llama-3.3-70b') return 'groq';
  if (id === 'llama3.1-8b' || id === 'llama3.3-70b') return 'cerebras';
  if (/^(gpt-|o[1-9]|chatgpt-|davinci|whisper)/.test(id)) return 'openai';
  return '';
}

function inferProvider(modelId, storedProvider) {
  if (storedProvider && PROVIDERS[storedProvider]) return storedProvider;
  return guessProviderFromModelId(modelId) || 'custom';
}

function isGroqEndpoint(url) {
  return /api\.groq\.com/i.test(String(url || ''));
}

/** Groq only answers on /openai/v1 — a bare api.groq.com URL becomes a 404. */
function normalizeBaseUrl(url) {
  const raw = String(url || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (isGroqEndpoint(raw)) return PROVIDERS.groq.baseUrl;
  return raw;
}

function chatCompletionsUrl(baseUrl) {
  const raw = normalizeBaseUrl(baseUrl) || 'https://api.openai.com/v1';
  if (/\/chat\/completions$/i.test(raw)) return raw;
  if (/\/(v1|v1beta|openai)$/i.test(raw) || /\/openai\/v1$/i.test(raw)) return raw + '/chat/completions';
  return raw + '/v1/chat/completions';
}

function openaiCompatHeaders(apiKey, baseUrl) {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
  if (/openrouter\.ai/i.test(String(baseUrl || ''))) {
    headers['HTTP-Referer'] = 'https://personalos.firozkabir.com';
    headers['X-Title'] = 'Personal OS';
  }
  return headers;
}

function anthropicHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

function keyForProvider(provider, keys) {
  const dedicated = sanitizeKey(keys[provider] || '');
  if (!dedicated || looksLikeUrl(dedicated)) return '';
  const guessed = guessKeyProvider(dedicated);
  if (guessed && guessed !== provider) return '';
  return dedicated;
}

function credsFor(model, keys) {
  if (!model) return { provider: 'custom', apiKey: '', baseUrl: '' };
  const provider = inferProvider(model.model_id, model.provider);
  if (provider === 'anthropic') {
    return { provider, apiKey: keyForProvider('anthropic', keys), baseUrl: PROVIDERS.anthropic.baseUrl };
  }
  if (provider === 'custom') {
    const apiKey = sanitizeKey(keys.custom);
    let baseUrl = normalizeBaseUrl(keys.customUrl);
    if (!baseUrl && guessKeyProvider(apiKey) === 'groq') baseUrl = PROVIDERS.groq.baseUrl;
    return { provider, apiKey, baseUrl };
  }
  const spec = PROVIDERS[provider] || PROVIDERS.custom;
  let apiKey = keyForProvider(provider, keys);
  if (!apiKey && provider === 'groq' && guessKeyProvider(keys.custom) === 'groq') {
    apiKey = sanitizeKey(keys.custom);
  }
  return { provider, apiKey, baseUrl: spec.baseUrl || '' };
}

function modelReady(model, keys) {
  const { provider, apiKey, baseUrl } = credsFor(model, keys);
  if (provider === 'custom') return !!(baseUrl && (apiKey || isLocalAiUrl(baseUrl)));
  return !!apiKey;
}

function describeKey(key) {
  const s = sanitizeKey(key);
  if (!s) return 'no key';
  if (looksLikeUrl(s)) return 'a URL (base URL is not an API key)';
  const p = guessKeyProvider(s);
  if (p === 'groq') {
    if (s.length < 52) {
      return `a truncated Groq preview (${s.length} chars). The keys table only shows ~50 characters — that is not the full key. Click Create API Key and copy from the popup immediately`;
    }
    return `a Groq gsk_ key (${s.length} chars) that Groq rejected. If you copied it from the keys list, that preview is incomplete — create a NEW key and copy the full value from the popup (shown only once)`;
  }
  if (p) return `a ${PROVIDERS[p]?.label || p} key (${s.length} chars)`;
  return `key starting with "${s.slice(0, 6)}…" (${s.length} chars)`;
}

function formatProviderError(status, raw, { host, model, apiKey, provider } = {}) {
  const msg = String(raw || '');
  const replacement = GROQ_MODEL_MIGRATIONS[model];
  if (replacement || /decommissioned|model_not_found|does not exist|no longer (available|supported)/i.test(msg)) {
    if (replacement) {
      return `Groq shut down ${model} on 16 Aug 2026. Use ${replacement.model_id} instead.`;
    }
    return msg;
  }
  if (status === 401 || /invalid api key|incorrect api key|unauthorized|authentication/i.test(msg)) {
    const label = PROVIDERS[provider]?.label || host || 'provider';
    return `Invalid API Key (${host || label} / ${model || '?'}). Sent ${describeKey(apiKey)}. Check the ${label} card — the key must belong to that provider.`;
  }
  if (status === 404 && /model/i.test(msg)) {
    return `Unknown model "${model}". Use the exact model ID from the provider dashboard.`;
  }
  if (status === 429 || /rate[_ ]limit/i.test(msg)) {
    return 'The AI provider is rate-limited. Wait a few seconds, or split the task into smaller messages.';
  }
  if (status === 413 || /too large|context_length|maximum context|reduce the length|prompt is too long/i.test(msg)) {
    return 'This task is too long for one request. Start a new chat or split it into smaller parts.';
  }
  return msg || `API error (${status})`;
}

function formatFetchError(e, url) {
  if (e && e.name === 'AbortError') return 'Request timed out. Try again.';
  const msg = String(e && e.message || '');
  if (/ENOTFOUND|getaddrinfo|ERR_NAME_NOT_RESOLVED/i.test(msg)) {
    return `Could not resolve host${url ? ' for ' + url : ''}. Check the base URL.`;
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `Connection refused${url ? ': ' + url : ''}. Localhost URLs cannot be reached from the cloud server.`;
  }
  return 'Could not reach the AI provider. Check the base URL and try again.';
}

function assertUsableKey(key, provider) {
  const cleaned = sanitizeKey(key);
  if (!cleaned) {
    const err = new Error('Paste an API key first');
    err.status = 400;
    throw err;
  }
  if (looksLikeUrl(cleaned)) {
    const err = new Error('That is a base URL, not an API key. Paste the secret key into the key field.');
    err.status = 400;
    throw err;
  }
  const guessed = guessKeyProvider(cleaned);
  if (provider === 'groq' || guessed === 'groq') {
    if (!cleaned.startsWith('gsk_')) {
      const err = new Error('Groq keys start with gsk_. Create one at https://console.groq.com/keys');
      err.status = 400;
      throw err;
    }
    if (cleaned.length < 52) {
      const err = new Error(`That looks like Groq's truncated preview (${cleaned.length} chars), not the full key. Click Create API Key and copy from the popup — the keys list only shows ~50 characters.`);
      err.status = 400;
      throw err;
    }
  }
  if (provider && guessed && guessed !== provider && provider !== 'custom') {
    const err = new Error(`That looks like a ${PROVIDERS[guessed].label} key. Paste it in the ${PROVIDERS[guessed].label} card, or pick ${PROVIDERS[guessed].label} as the provider.`);
    err.status = 400;
    throw err;
  }
  return cleaned;
}

function errorMessageFromBody(data, status) {
  if (!data) return `HTTP ${status}`;
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error.message === 'string') return data.error.message;
  if (Array.isArray(data.error?.message)) return data.error.message.map((m) => m.text || m).join('; ');
  if (typeof data.message === 'string') return data.message;
  return `HTTP ${status}`;
}

async function probeChat({ provider, apiKey, baseUrl, modelId, timeoutMs = 20000 }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const ping = 'Reply with the single word: pong';
  try {
    if (provider === 'anthropic') {
      const url = 'https://api.anthropic.com/v1/messages';
      const resp = await fetch(url, {
        method: 'POST',
        signal: ac.signal,
        headers: anthropicHeaders(apiKey),
        body: JSON.stringify({
          model: modelId,
          max_tokens: 16,
          messages: [{ role: 'user', content: ping }],
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          ok: false,
          status: resp.status,
          error: formatProviderError(resp.status, errorMessageFromBody(data, resp.status), {
            host: 'api.anthropic.com', model: modelId, apiKey, provider,
          }),
          model: modelId,
          url,
        };
      }
      const reply = (data.content || []).map((b) => b.text || '').join('').trim();
      return { ok: true, reply, model: modelId, url };
    }

    const url = chatCompletionsUrl(baseUrl);
    const headers = openaiCompatHeaders(apiKey, baseUrl);
    const send = (body) => fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers,
      body: JSON.stringify(body),
    });

    const baseBody = { model: modelId, messages: [{ role: 'user', content: ping }] };
    const groqReasoning = (provider === 'groq' || isGroqEndpoint(baseUrl))
      && /gpt-oss|qwen3\.6|^groq\//i.test(String(modelId || ''));
    const preferCompletion = provider === 'openai' || groqReasoning;
    let resp = await send({
      ...baseBody,
      ...(preferCompletion ? { max_completion_tokens: 16 } : { max_tokens: 16 }),
    });
    let data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const raw = errorMessageFromBody(data, resp.status);
      if (resp.status === 400 && /max_tokens|max_completion|unknown|unsupported|unexpected|invalid.*param/i.test(raw)) {
        resp = await send({
          ...baseBody,
          ...(preferCompletion ? { max_tokens: 16 } : { max_completion_tokens: 16 }),
        });
        data = await resp.json().catch(() => ({}));
      }
    }
    if (!resp.ok) {
      let host = url;
      try { host = new URL(url).hostname; } catch { /* keep url */ }
      return {
        ok: false,
        status: resp.status,
        error: formatProviderError(resp.status, errorMessageFromBody(data, resp.status), {
          host, model: modelId, apiKey, provider,
        }),
        model: modelId,
        url,
      };
    }
    const reply = String(data.choices?.[0]?.message?.content || '').trim()
      || JSON.stringify(data).slice(0, 200);
    return { ok: true, reply, model: modelId, url };
  } catch (e) {
    return { ok: false, error: formatFetchError(e, baseUrl), model: modelId, url: baseUrl };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  PROVIDERS, KEY_FIELDS, PROVIDER_IDS, DEFAULT_TEST_MODELS,
  GROQ_MODEL_MIGRATIONS, GROQ_DEFAULT_MODEL,
  inferProvider, guessProviderFromModelId, chatCompletionsUrl,
  guessKeyProvider, keyForProvider, credsFor, modelReady,
  looksLikeUrl, isLocalAiUrl, isGroqEndpoint, normalizeBaseUrl,
  describeKey, formatProviderError, formatFetchError,
  sanitizeKey, assertUsableKey, openaiCompatHeaders, anthropicHeaders, probeChat,
};
