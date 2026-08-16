import { get, post, put, del } from '/js/api.js';
import { el, icon, icons, formModal, confirmModal, toast } from '/js/ui.js';

const PROVIDER_LABEL = {
  anthropic: 'Anthropic', openai: 'OpenAI', custom: 'Custom',
  groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter', cerebras: 'Cerebras',
};

const FREE_PRESETS = [
  {
    id: 'groq',
    name: 'Groq',
    blurb: 'সবচেয়ে দ্রুত · কার্ড লাগে না · নতুন gsk_ কি পুরো কপি করুন (একবারই দেখায়)',
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
    blurb: '২০+ ফ্রি মডেল এক কি-তে',
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

export default async function aiModelsView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));

  async function render() {
    const [models, keys] = await Promise.all([get('/admin/ai-models'), get('/admin/ai-keys')]);
    const existingIds = new Set(models.map(m => m.model_id));

    const keyField = (key, label, placeholder, opts = {}) => {
      const input = el('input', {
        type: opts.type || (key.endsWith('_base_url') ? 'text' : 'password'),
        placeholder: keys[key + '_set'] ? `Saved: ${keys[key]}` : placeholder,
      });
      if (key.endsWith('_base_url') || opts.prefill) input.value = keys[key] || opts.prefill || '';
      return { key, input, el: el('div', { class: 'field' }, el('label', {}, label), input) };
    };

    const kAnthropic = keyField('admin_anthropic_key', 'Anthropic API key', 'sk-ant-...');
    const kOpenai = keyField('admin_openai_key', 'OpenAI API key', 'sk-...');
    const kCustom = keyField('admin_custom_key', 'Custom / free API key', 'gsk_... / AIza... / sk-or-...');
    const kCustomUrl = keyField('admin_custom_base_url', 'Custom base URL (other endpoints only — Groq URL already built-in)', 'https://your-endpoint/v1');

    const customStatus = el('div', { class: 'muted', style: { fontSize: '13px', margin: '8px 0 16px' } },
      keys.admin_custom_key_set && keys.admin_custom_base_url
        ? '✓ Saved — key stored, URL: ' + keys.admin_custom_base_url
        : keys.admin_custom_base_url
          ? 'URL saved, but API key missing — paste the key then Save.'
          : 'Not saved yet. Pick a preset, paste the free API key, then Save & Test.');

    const saveCustom = async () => {
      const body = {};
      if (kCustom.input.value.trim()) body.admin_custom_key = kCustom.input.value.trim();
      if (kCustomUrl.input.value.trim()) body.admin_custom_base_url = kCustomUrl.input.value.trim();
      if (!Object.keys(body).length) throw new Error('Base URL বা API key দিন');
      const result = await post('/admin/ai-keys', body);
      if (!result?.ok) throw new Error('Save failed');
      return result;
    };

    const testCustom = async () => {
      const body = {};
      if (kCustom.input.value.trim()) body.admin_custom_key = kCustom.input.value.trim();
      if (kCustomUrl.input.value.trim()) body.admin_custom_base_url = kCustomUrl.input.value.trim();
      return post('/admin/ai-test', body);
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

    const savePaid = el('button', { class: 'btn ghost', onclick: async () => {
      const body = {};
      for (const f of [kAnthropic, kOpenai]) if (f.input.value.trim()) body[f.key] = f.input.value.trim();
      if (!Object.keys(body).length) return toast('Paste a key first', 'err');
      await post('/admin/ai-keys', body);
      toast('Paid provider keys saved ✓'); render();
    } }, 'Save Anthropic / OpenAI keys');

    const saveCustomBtn = el('button', { class: 'btn', onclick: async () => {
      saveCustomBtn.disabled = true;
      try {
        await saveCustom();
        toast('API saved ✓ — refresh-এও থাকবে');
        render();
      } catch (e) { toast(e.message, 'err'); }
      finally { saveCustomBtn.disabled = false; }
    } }, 'Save API');

    const testCustomBtn = el('button', { class: 'btn ghost', onclick: async () => {
      testCustomBtn.disabled = true;
      testCustomBtn.textContent = 'Testing…';
      try {
        if (kCustom.input.value.trim() || kCustomUrl.input.value.trim()) {
          try { await saveCustom(); } catch { /* test can still use already-saved values */ }
        }
        const result = await testCustom();
        toast('Connected ✓  ' + (result.model || '') + (result.reply ? ' → ' + String(result.reply).slice(0, 80) : ''));
        render();
      } catch (e) { toast('Test failed: ' + e.message, 'err'); }
      finally {
        testCustomBtn.disabled = false;
        testCustomBtn.textContent = 'Test connection';
      }
    } }, 'Test connection');

    const modelFields = () => [
      { key: 'name', label: 'Display name', placeholder: 'e.g. Llama 3.3 70B' },
      { key: 'provider', label: 'Provider', type: 'select', options: [
        { value: 'groq', label: 'Groq' },
        { value: 'gemini', label: 'Google Gemini' },
        { value: 'openrouter', label: 'OpenRouter' },
        { value: 'cerebras', label: 'Cerebras' },
        { value: 'custom', label: 'Custom URL' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
      ], default: 'custom' },
      { key: 'model_id', label: 'Model ID (exact API string)', placeholder: 'e.g. openai/gpt-oss-20b' },
    ];

    const addModel = () => formModal({
      title: 'Add AI model', fields: modelFields(), submitLabel: 'Add',
      onSubmit: async (v) => {
        if (!v.name.trim() || !v.model_id.trim()) throw new Error('Name and model ID are required');
        await post('/admin/ai-models', v); toast('Model added ✓'); render();
      },
    });
    const editModel = (m) => formModal({
      title: `Edit "${m.name}"`, fields: modelFields(), values: m,
      onSubmit: async (v) => { await put(`/admin/ai-models/${m.id}`, v); toast('Updated ✓'); render(); },
    });

    const presetCards = FREE_PRESETS.map(p => {
      const keyIn = el('input', {
        type: 'password',
        placeholder: keys[p.keyField + '_set'] ? `Saved: ${keys[p.keyField]}` : p.keyPlaceholder,
      });
      return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
          el('b', {}, p.name),
          el('span', { class: `badge ${keys[p.keyField + '_set'] ? 'green' : ''}` }, keys[p.keyField + '_set'] ? 'Key saved' : 'Free')),
        el('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, p.blurb),
        el('a', { href: p.signup, target: '_blank', rel: 'noopener', class: 'muted', style: { fontSize: '12.5px' } }, '↗ ' + p.signupLabel),
        el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, p.name + ' API key'), keyIn),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          el('button', { class: 'btn sm', onclick: () => applyPreset(p, keyIn.value.trim()) }, keys[p.keyField + '_set'] && !keyIn.value.trim() ? `Add ${p.name} models` : `Save ${p.name} + add models`),
          el('button', { class: 'btn ghost sm', onclick: async () => {
            try {
              if (keyIn.value.trim()) await post('/admin/ai-keys', { [p.keyField]: keyIn.value.trim() });
              const result = await post('/admin/ai-test', { provider: p.id, [p.keyField]: keyIn.value.trim(), model_id: p.models[0].model_id });
              toast('Connected ✓  ' + (result.reply || p.name));
              render();
            } catch (e) { toast('Test failed: ' + e.message, 'err'); }
          } }, 'Test')));
    });

    const suggestionRows = FREE_PRESETS.flatMap(p => p.models.map(m => {
      const already = existingIds.has(m.model_id);
      return el('div', { class: 'list-row' },
        el('div', { class: 'grow' },
          el('div', { class: 'title' }, m.name),
          el('div', { class: 'sub' }, `${p.name} · ${m.model_id}`)),
        already
          ? el('span', { class: 'badge green' }, 'Added')
          : el('button', { class: 'btn ghost sm', onclick: async () => {
              await post('/admin/ai-models', { name: m.name, provider: p.id, model_id: m.model_id });
              toast(`${m.name} added`);
              render();
            } }, 'Add'));
    }));

    body.replaceChildren(el('div', {},
      el('div', { class: 'card', style: { marginBottom: '16px', borderColor: 'var(--accent)' } },
        el('h3', {}, icon('ai'), 'Custom / Free API'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } },
          'Groq base URL is already built in. Paste only a gsk_ key in the Groq card — not the URL. Groq shut down Llama 3.3 today (16 Aug 2026); chat now uses GPT-OSS. For real Llama, use OpenRouter or Cerebras.'),
        el('div', { class: 'field-row' }, kCustomUrl.el, kCustom.el),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, saveCustomBtn, testCustomBtn),
        customStatus,
        el('h3', { style: { fontSize: '14px', marginBottom: '10px' } }, 'ফ্রি প্রোভাইডার প্রিসেট'),
        el('div', { class: 'grid cols-2', style: { marginBottom: '8px' } }, presetCards)),

      el('div', { class: 'card', style: { marginBottom: '16px' } },
        el('h3', {}, 'Suggested free models'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '12px' } },
          'Add চাপলে মডেল ক্যাটালগে যোগ হবে এবং সেই প্রোভাইডারের base URL সেট হবে। তারপর উপরে API key সেভ করুন।'),
        el('div', { class: 'stack' }, suggestionRows)),

      el('div', { class: 'card', style: { marginBottom: '16px' } },
        el('h3', {}, icon('key'), 'Paid providers (optional)'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, 'শুধু চাইলে Anthropic / OpenAI কি দিন — ফ্রি API-এর জন্য দরকার নেই।'),
        el('div', { class: 'field-row' }, kAnthropic.el, kOpenai.el),
        savePaid),

      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        el('h3', { style: { margin: 0 } }, 'Model catalog'),
        el('button', { class: 'btn', onclick: addModel }, icon('plus'), 'Add model')),
      el('div', { class: 'grid cols-3' }, models.length ? models.map(m => {
        const editBtn = el('button', { class: 'icon-btn', onclick: () => editModel(m) }); editBtn.innerHTML = icons.edit;
        const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete model "${m.name}"?`, async () => {
          try { await del(`/admin/ai-models/${m.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
        }) }); delBtn.innerHTML = icons.trash;
        const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/ai-models/${m.id}`, { active: m.active ? 0 : 1 }); render(); } }, m.active ? 'Deactivate' : 'Activate');
        return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '6px', opacity: m.active ? 1 : 0.55 } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
            el('b', {}, m.name), el('div', { style: { display: 'flex', gap: '4px' } }, editBtn, delBtn)),
          el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            el('span', { class: 'badge accent' }, PROVIDER_LABEL[m.provider] || m.provider),
            el('span', { class: 'badge green' }, 'Free · Unlimited')),
          el('div', { class: 'muted', style: { fontFamily: 'monospace', fontSize: '12px' } }, m.model_id),
          toggleBtn);
      }) : el('p', { class: 'muted' }, 'No models yet — pick a free preset above.')),
    ));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'AI Models'), el('p', {}, 'Connect a free API (Groq / Gemini / OpenRouter) — every user can use it'))),
    body);
}
