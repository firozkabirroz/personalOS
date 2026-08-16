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
    id.startsWith('llama-3.3')
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

function guessKeyProvider(key) {
  const k = String(key || '');
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'gemini';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('csk-')) return 'cerebras';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-')) return 'openai';
  return '';
}

function keySlots(keys) {
  return [keys.groq, keys.custom, keys.openai, keys.gemini, keys.openrouter, keys.cerebras, keys.anthropic]
    .map((k) => String(k || '').trim())
    .filter(Boolean);
}

/** Pick a key that actually belongs to this provider (prefix), never a mismatched one. */
function keyForProvider(provider, keys) {
  const prefixed = keySlots(keys).find((k) => guessKeyProvider(k) === provider);
  if (prefixed) return prefixed;
  const slot = String(keys[provider] || '').trim();
  if (!slot) return '';
  const guessed = guessKeyProvider(slot);
  if (!guessed || guessed === provider) return slot;
  return '';
}

module.exports = {
  PROVIDERS, KEY_FIELDS, PROVIDER_IDS,
  inferProvider, chatCompletionsUrl, guessKeyProvider, keyForProvider,
};
