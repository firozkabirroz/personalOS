import { get, post, put, del } from '/js/api.js';
import { el, icon, icons, formModal, confirmModal, toast } from '/js/ui.js';

const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI', custom: 'Custom (OpenAI-compatible)' };

export default async function aiModelsView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));

  async function render() {
    const [models, keys] = await Promise.all([get('/admin/ai-models'), get('/admin/ai-keys')]);

    const keyField = (key, label, placeholder) => {
      const input = el('input', { type: key.endsWith('_base_url') ? 'text' : 'password', placeholder: keys[key + '_set'] ? `Saved: ${keys[key]}` : placeholder });
      if (key.endsWith('_base_url')) input.value = keys[key] || '';
      return { key, input, el: el('div', { class: 'field' }, el('label', {}, label), input) };
    };
    const kAnthropic = keyField('admin_anthropic_key', 'Anthropic API key', 'sk-ant-...');
    const kOpenai = keyField('admin_openai_key', 'OpenAI API key', 'sk-...');
    const kCustom = keyField('admin_custom_key', 'Custom provider API key', 'optional');
    const kCustomUrl = keyField('admin_custom_base_url', 'Custom base URL', 'https://your-endpoint.example.com');

    const saveKeys = el('button', { class: 'btn', onclick: async () => {
      const body = {};
      for (const f of [kAnthropic, kOpenai, kCustom, kCustomUrl]) if (f.input.value.trim()) body[f.key] = f.input.value.trim();
      await post('/admin/ai-keys', body);
      toast('Platform AI keys saved ✓'); render();
    } }, 'Save platform keys');

    const modelFields = (values = {}) => [
      { key: 'name', label: 'Display name', placeholder: 'e.g. GPT-4o mini' },
      { key: 'provider', label: 'Provider', type: 'select', options: [{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'Custom (OpenAI-compatible)' }], default: 'openai' },
      { key: 'model_id', label: 'Model ID (exact API string)', placeholder: 'e.g. gpt-4o-mini' },
      { key: 'input_cost', label: 'Input $/1M tokens', type: 'number', step: '0.01', half: true, default: 0 },
      { key: 'output_cost', label: 'Output $/1M tokens', type: 'number', step: '0.01', half: true, default: 0 },
    ];

    const addModel = () => formModal({
      title: 'Add AI model', fields: modelFields(), submitLabel: 'Add',
      onSubmit: async (v) => {
        if (!v.name.trim() || !v.model_id.trim()) throw new Error('Name and model ID are required');
        await post('/admin/ai-models', v); toast('Model added ✓'); render();
      },
    });
    const editModel = (m) => formModal({
      title: `Edit "${m.name}"`, fields: modelFields(m), values: m,
      onSubmit: async (v) => { await put(`/admin/ai-models/${m.id}`, v); toast('Updated ✓'); render(); },
    });

    body.replaceChildren(el('div', {},
      el('div', { class: 'card', style: { marginBottom: '16px' } },
        el('h3', {}, '🔑 Platform AI keys'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, 'One key per provider covers every model of that provider below — used for all customers\' AI chats (billed to you, limited per plan).'),
        el('div', { class: 'field-row' }, kAnthropic.el, kOpenai.el),
        el('div', { class: 'field-row' }, kCustom.el, kCustomUrl.el),
        saveKeys),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        el('h3', { style: { margin: 0 } }, '🤖 Model catalog'),
        el('button', { class: 'btn', onclick: addModel }, icon('plus'), 'Add model')),
      el('div', { class: 'grid cols-3' }, models.map(m => {
        const editBtn = el('button', { class: 'icon-btn', onclick: () => editModel(m) }); editBtn.innerHTML = icons.edit;
        const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete model "${m.name}"?`, async () => {
          try { await del(`/admin/ai-models/${m.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
        }) }); delBtn.innerHTML = icons.trash;
        const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/ai-models/${m.id}`, { active: m.active ? 0 : 1 }); render(); } }, m.active ? 'Deactivate' : 'Activate');
        return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '6px', opacity: m.active ? 1 : 0.55 } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
            el('b', {}, m.name), el('div', { style: { display: 'flex', gap: '4px' } }, editBtn, delBtn)),
          el('div', { class: 'badge accent', style: { width: 'fit-content' } }, PROVIDER_LABEL[m.provider]),
          el('div', { class: 'muted', style: { fontFamily: 'monospace', fontSize: '12px' } }, m.model_id),
          el('div', { class: 'muted', style: { fontSize: '12px' } }, `$${m.input_cost}/$${m.output_cost} per 1M tokens`),
          toggleBtn);
      }))));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '🤖 AI Models'), el('p', {}, 'Platform provider keys and the model catalog used across plans'))),
    body);
}
