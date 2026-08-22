import { get, post, put, del } from '/js/api.js';
import { el, icon, icons, formModal, confirmModal, toast } from '/js/ui.js';

const PROVIDER_LABEL = {
  anthropic: 'Anthropic', openai: 'OpenAI', custom: 'Custom',
  groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter', cerebras: 'Cerebras',
};

const PROVIDER_CARDS = [
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'GPT-4o / GPT-4.1 — platform.openai.com থেকে sk- কি',
    signup: 'https://platform.openai.com/api-keys',
    signupLabel: 'platform.openai.com → API keys',
    keyField: 'admin_openai_key',
    keyPlaceholder: 'sk-...',
    models: [
      { name: 'GPT-4o mini', model_id: 'gpt-4o-mini' },
      { name: 'GPT-4o', model_id: 'gpt-4o' },
      { name: 'GPT-4.1', model_id: 'gpt-4.1' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    blurb: 'Claude — console.anthropic.com থেকে sk-ant- কি',
    signup: 'https://console.anthropic.com/settings/keys',
    signupLabel: 'console.anthropic.com → API keys',
    keyField: 'admin_anthropic_key',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { name: 'Claude Haiku 4.5', model_id: 'claude-haiku-4-5-20251001' },
      { name: 'Claude Sonnet 5', model_id: 'claude-sonnet-5' },
      { name: 'Claude Opus 4.8', model_id: 'claude-opus-4-8' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    blurb: 'Create API Key পপআপ থেকে পুরো gsk_ কপি করুন — লিস্টের ~৫০ অক্ষর প্রিভিউ নয়।',
    signup: 'https://console.groq.com/keys',
    signupLabel: 'console.groq.com → API Keys',
    keyField: 'admin_groq_key',
    keyPlaceholder: 'gsk_...',
    models: [
      { name: 'GPT-OSS 120B (Groq)', model_id: 'openai/gpt-oss-120b' },
      { name: 'GPT-OSS 20B Instant (Groq)', model_id: 'openai/gpt-oss-20b' },
      { name: 'Qwen 3.6 27B (Groq)', model_id: 'qwen/qwen3.6-27b' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    blurb: 'ফ্রি টিয়ার বড় · লম্বা কনটেক্সট',
    signup: 'https://aistudio.google.com/apikey',
    signupLabel: 'aistudio.google.com → Get API key',
    keyField: 'admin_gemini_key',
    keyPlaceholder: 'AIza...',
    models: [
      { name: 'Gemini 2.5 Flash', model_id: 'gemini-2.5-flash' },
      { name: 'Gemini 2.0 Flash', model_id: 'gemini-2.0-flash' },
      { name: 'Gemini 2.0 Flash Lite', model_id: 'gemini-2.0-flash-lite' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    blurb: '২০+ ফ্রি মডেল এক কি-তে — যেকোনো OpenRouter মডেল ID অ্যাড করুন',
    signup: 'https://openrouter.ai/keys',
    signupLabel: 'openrouter.ai → Keys',
    keyField: 'admin_openrouter_key',
    keyPlaceholder: 'sk-or-...',
    models: [
      { name: 'Llama 3.3 70B (OpenRouter free)', model_id: 'meta-llama/llama-3.3-70b-instruct:free' },
      { name: 'Gemma 3 27B (OpenRouter free)', model_id: 'google/gemma-3-27b-it:free' },
      { name: 'Mistral Small (OpenRouter free)', model_id: 'mistralai/mistral-small-3.1-24b-instruct:free' },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    blurb: 'খুব দ্রুত Llama · ফ্রি টিয়ার',
    signup: 'https://cloud.cerebras.ai',
    signupLabel: 'cloud.cerebras.ai → API key',
    keyField: 'admin_cerebras_key',
    keyPlaceholder: 'csk-...',
    models: [
      { name: 'Llama 3.3 70B (Cerebras)', model_id: 'llama-3.3-70b' },
      { name: 'Llama 3.1 8B (Cerebras)', model_id: 'llama3.1-8b' },
    ],
  },
];

function providerOptions() {
  return [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'custom', label: 'Custom URL' },
    { value: 'groq', label: 'Groq' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'cerebras', label: 'Cerebras' },
  ];
}

export default async function aiModelsView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));

  async function render() {
    const [models, keys] = await Promise.all([get('/admin/ai-models'), get('/admin/ai-keys')]);
    const existingIds = new Set(models.map(m => m.model_id));

    const kCustom = (() => {
      const input = el('input', {
        type: 'password',
        placeholder: keys.admin_custom_key_set ? `Saved: ${keys.admin_custom_key}` : 'any API key (sk- / gsk_ / …)',
      });
      return { key: 'admin_custom_key', input, el: el('div', { class: 'field' }, el('label', {}, 'Custom API key'), input) };
    })();
    const kCustomUrl = (() => {
      const input = el('input', {
        type: 'text',
        placeholder: 'https://api.groq.com/openai/v1',
        value: keys.admin_custom_base_url || '',
      });
      return { key: 'admin_custom_base_url', input, el: el('div', { class: 'field' }, el('label', {}, 'Custom base URL (OpenAI-compatible)'), input) };
    })();
    const kCustomModel = el('input', {
      type: 'text',
      placeholder: 'openai/gpt-oss-20b',
      value: models.find(m => m.provider === 'custom')?.model_id || '',
    });

    const customStatus = el('div', { class: 'muted', style: { fontSize: '13px', margin: '8px 0 0' } },
      keys.admin_custom_key_set && keys.admin_custom_base_url
        ? '✓ Saved — URL: ' + keys.admin_custom_base_url
        : keys.admin_custom_base_url
          ? 'URL saved, API key missing — gsk_ কি পেস্ট করে Save করুন।'
          : 'Groq: URL = https://api.groq.com/openai/v1 · Key = পপআপের পুরো gsk_ (লিস্টের ৫০ অক্ষর নয়)।');

    const saveCustom = async () => {
      const body = {};
      if (kCustom.input.value.trim()) body.admin_custom_key = kCustom.input.value.trim();
      if (kCustomUrl.input.value.trim()) body.admin_custom_base_url = kCustomUrl.input.value.trim();
      if (!Object.keys(body).length) throw new Error('Base URL বা API key দিন');
      const result = await post('/admin/ai-keys', body);
      if (!result?.ok) throw new Error('Save failed');
      return result;
    };

    const addIfMissing = async (preset) => {
      let added = 0;
      for (const m of preset.models) {
        if (existingIds.has(m.model_id)) continue;
        await post('/admin/ai-models', { name: m.name, provider: preset.id, model_id: m.model_id });
        existingIds.add(m.model_id);
        added++;
      }
      return added;
    };

    const applyPreset = async (preset, extraKey) => {
      try {
        const body = {};
        if (extraKey) body[preset.keyField] = extraKey;
        if (Object.keys(body).length) await post('/admin/ai-keys', body);
        const added = await addIfMissing(preset);
        toast(`${preset.name}` + (extraKey ? ' key saved' : '') + (added ? ` · ${added} model(s) added` : ' · models ready'));
        render();
      } catch (e) {
        toast('Save failed: ' + e.message, 'err');
      }
    };

    const testProvider = async (preset, keyIn) => {
      try {
        if (keyIn.value.trim()) await post('/admin/ai-keys', { [preset.keyField]: keyIn.value.trim() });
        const result = await post('/admin/ai-test', {
          provider: preset.id,
          [preset.keyField]: keyIn.value.trim(),
          model_id: preset.models[0].model_id,
        });
        toast('Connected ✓  ' + (result.model || preset.name) + (result.reply ? ' → ' + String(result.reply).slice(0, 60) : ''));
        render();
      } catch (e) { toast('Test failed: ' + e.message, 'err'); }
    };

    const fillGroqBtn = el('button', { class: 'btn ghost', onclick: () => {
      kCustomUrl.input.value = 'https://api.groq.com/openai/v1';
      if (!kCustomModel.value.trim()) kCustomModel.value = 'openai/gpt-oss-20b';
      toast('Groq URL filled — এখন পুরো gsk_ পেস্ট করুন, Save, তারপর Test');
    } }, 'Fill Groq URL');

    const saveCustomBtn = el('button', { class: 'btn', onclick: async () => {
      saveCustomBtn.disabled = true;
      try {
        await saveCustom();
        toast('Custom API saved ✓');
        render();
      } catch (e) { toast(e.message, 'err'); }
      finally { saveCustomBtn.disabled = false; }
    } }, 'Save custom API');

    const testCustomBtn = el('button', { class: 'btn ghost', onclick: async () => {
      testCustomBtn.disabled = true;
      testCustomBtn.textContent = 'Testing…';
      try {
        if (kCustom.input.value.trim() || kCustomUrl.input.value.trim()) {
          try { await saveCustom(); } catch { /* already-saved values still work */ }
        }
        const result = await post('/admin/ai-test', {
          provider: 'custom',
          admin_custom_key: kCustom.input.value.trim(),
          admin_custom_base_url: kCustomUrl.input.value.trim(),
          model_id: kCustomModel.value.trim(),
        });
        toast('Connected ✓  ' + (result.model || '') + (result.reply ? ' → ' + String(result.reply).slice(0, 80) : ''));
        render();
      } catch (e) { toast('Test failed: ' + e.message, 'err'); }
      finally {
        testCustomBtn.disabled = false;
        testCustomBtn.textContent = 'Test connection';
      }
    } }, 'Test connection');

    const modelFields = () => [
      { key: 'name', label: 'Display name', placeholder: 'e.g. GPT-4o mini' },
      { key: 'provider', label: 'Provider (this model always uses this API)', type: 'select', options: providerOptions(), default: 'openai' },
      { key: 'model_id', label: 'Model ID (exact string the API expects)', placeholder: 'gpt-4o-mini / claude-sonnet-4-6 / deepseek-chat' },
    ];

    const addModel = () => formModal({
      title: 'Add any model', fields: modelFields(), submitLabel: 'Add & test',
      onSubmit: async (v) => {
        if (!v.name.trim() || !v.model_id.trim()) throw new Error('Name and model ID are required');
        await post('/admin/ai-models', v);
        try {
          const result = await post('/admin/ai-test', { provider: v.provider, model_id: v.model_id.trim() });
          toast('Added ✓ connected to ' + (result.model || v.model_id));
        } catch (e) {
          toast('Model saved, but test failed: ' + e.message, 'err');
        }
        render();
      },
    });
    const editModel = (m) => formModal({
      title: `Edit "${m.name}"`, fields: modelFields(), values: m,
      onSubmit: async (v) => { await put(`/admin/ai-models/${m.id}`, v); toast('Updated ✓'); render(); },
    });

    const presetCards = PROVIDER_CARDS.map(p => {
      const keyIn = el('input', {
        type: 'password',
        placeholder: keys[p.keyField + '_set'] ? `Saved: ${keys[p.keyField]}` : p.keyPlaceholder,
      });
      return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
          el('b', {}, p.name),
          el('span', { class: `badge ${keys[p.keyField + '_set'] ? 'green' : ''}` }, keys[p.keyField + '_set'] ? 'Key saved' : 'Connect')),
        el('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, p.blurb),
        el('a', { href: p.signup, target: '_blank', rel: 'noopener', class: 'muted', style: { fontSize: '12.5px' } }, '↗ ' + p.signupLabel),
        el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, p.name + ' API key'), keyIn),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          el('button', { class: 'btn sm', onclick: () => applyPreset(p, keyIn.value.trim()) }, keys[p.keyField + '_set'] && !keyIn.value.trim() ? `Add ${p.name} models` : `Save ${p.name} + add models`),
          el('button', { class: 'btn ghost sm', onclick: () => testProvider(p, keyIn) }, 'Test')));
    });

    body.replaceChildren(el('div', {},
      el('div', { class: 'card', style: { marginBottom: '16px', borderColor: 'var(--accent)' } },
        el('h3', {}, icon('ai'), 'Custom / OpenAI-compatible API'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } },
          'Groq Custom-এ: Base URL অবশ্যই https://api.groq.com/openai/v1 (শুধু api.groq.com দিলে error আসে)। Key ফিল্ডে শুধু gsk_ — URL নয়। Llama 3.3 বন্ধ; টেস্ট মডেল openai/gpt-oss-20b।'),
        el('div', { class: 'field-row' }, kCustomUrl.el, kCustom.el),
        el('div', { class: 'field' }, el('label', {}, 'Test with model ID'), kCustomModel),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, fillGroqBtn, saveCustomBtn, testCustomBtn),
        customStatus),

      el('div', { class: 'card', style: { marginBottom: '16px' } },
        el('h3', {}, icon('key'), 'Built-in providers'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } },
          'OpenAI, Anthropic, Groq, Gemini — প্রতিটি কার্ডে সেই প্রোভাইডারের নিজের কি। মডেল ID অন্য কার্ডে যাবে না।'),
        el('div', { class: 'grid cols-2', style: { marginBottom: '8px' } }, presetCards)),

      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        el('h3', { style: { margin: 0 } }, 'Model catalog'),
        el('button', { class: 'btn', onclick: addModel }, icon('plus'), 'Add any model')),
      el('p', { class: 'muted', style: { marginTop: '-4px', marginBottom: '12px' } },
        'Provider বেছে নিন, API-র exact model ID দিন (যেমন gpt-4o-mini, claude-sonnet-4-6)। Add & test চাপলে সাথে সাথে কানেকশন চেক হবে।'),
      el('div', { class: 'grid cols-3' }, models.length ? models.map(m => {
        const editBtn = el('button', { class: 'icon-btn', onclick: () => editModel(m) }); editBtn.innerHTML = icons.edit;
        const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete model "${m.name}"?`, async () => {
          try { await del(`/admin/ai-models/${m.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
        }) }); delBtn.innerHTML = icons.trash;
        const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/ai-models/${m.id}`, { active: m.active ? 0 : 1 }); render(); } }, m.active ? 'Deactivate' : 'Activate');
        const testBtn = el('button', { class: 'btn sm', onclick: async () => {
          testBtn.disabled = true;
          testBtn.textContent = 'Testing…';
          try {
            const result = await post('/admin/ai-test', { provider: m.provider, model_id: m.model_id });
            toast('Connected ✓  ' + (result.reply ? String(result.reply).slice(0, 80) : m.name));
          } catch (e) { toast('Test failed: ' + e.message, 'err'); }
          finally { testBtn.disabled = false; testBtn.textContent = 'Test'; }
        } }, 'Test');
        return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '6px', opacity: m.active ? 1 : 0.55 } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
            el('b', {}, m.name), el('div', { style: { display: 'flex', gap: '4px' } }, editBtn, delBtn)),
          el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            el('span', { class: 'badge accent' }, PROVIDER_LABEL[m.provider] || m.provider),
            el('span', { class: 'badge green' }, 'Ready when key is saved')),
          el('div', { class: 'muted', style: { fontFamily: 'monospace', fontSize: '12px' } }, m.model_id),
          el('div', { style: { display: 'flex', gap: '8px' } }, testBtn, toggleBtn));
      }) : el('p', { class: 'muted' }, 'No models yet — connect a provider above or Add any model.')),
    ));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'AI Models'), el('p', {}, 'Connect OpenAI, Anthropic, Groq, or any custom API — then add any model ID'))),
    body);
}
