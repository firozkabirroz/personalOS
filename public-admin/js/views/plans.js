import { get, post, put, del } from '/js/api.js';
import { el, icon, icons, formModal, confirmModal, toast, fmtMoney } from '/js/ui.js';

const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI', custom: 'Custom (OpenAI-compatible)' };

export default async function plansView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));

  async function render() {
    const [plansList, models] = await Promise.all([get('/admin/plans'), get('/admin/ai-models')]);
    const cfg = await get('/admin/config');
    const cur = cfg.saas_currency || '৳';
    const activeModels = models.filter(m => m.active);

    const planFields = (values = {}) => [
      ...(values.id ? [] : [{ key: 'key', label: 'Key (fixed identifier, e.g. "pro")', placeholder: 'lowercase, no spaces' }]),
      { key: 'name', label: 'Display name', placeholder: 'e.g. Pro' },
      { key: 'monthly_price', label: `Monthly price (${cur})`, type: 'number', half: true, default: 0 },
      { key: 'yearly_price', label: `Yearly price (${cur})`, type: 'number', half: true, default: 0 },
      { key: 'ai_model_id', label: 'AI model included', type: 'select', options: [{ value: '', label: '— none —' }, ...activeModels.map(m => ({ value: m.id, label: `${m.name} (${PROVIDER_LABEL[m.provider]})` }))], half: true },
      { key: 'ai_message_limit', label: 'AI messages / month', type: 'number', half: true, default: 0 },
      { key: 'is_free', label: 'This is the free tier', type: 'select', options: [{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }], default: '0' },
    ];

    const addPlan = () => formModal({
      title: 'New plan tier', fields: planFields(), submitLabel: 'Create',
      onSubmit: async (v) => {
        if (!v.key.trim() || !v.name.trim()) throw new Error('Key and name are required');
        await post('/admin/plans', { ...v, is_free: v.is_free === '1' });
        toast('Plan created ✓'); render();
      },
    });

    const editPlan = (p) => formModal({
      title: `Edit "${p.name}"`, fields: planFields(p), values: { ...p, is_free: String(p.is_free), ai_model_id: p.ai_model_id || '' },
      onSubmit: async (v) => {
        await put(`/admin/plans/${p.id}`, { ...v, is_free: v.is_free === '1' });
        toast('Plan updated ✓'); render();
      },
    });

    const rows = plansList.map(p => {
      const editBtn = el('button', { class: 'icon-btn', onclick: () => editPlan(p) }); editBtn.innerHTML = icons.edit;
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete plan "${p.name}"?`, async () => {
        try { await del(`/admin/plans/${p.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
      }) }); delBtn.innerHTML = icons.trash;
      const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/plans/${p.id}`, { active: p.active ? 0 : 1 }); render(); } }, p.active ? 'Deactivate' : 'Activate');
      return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '8px', opacity: p.active ? 1 : 0.55 } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          el('div', {}, el('b', { style: { fontSize: '15px' } }, p.name), p.is_free ? el('span', { class: 'badge green', style: { marginLeft: '8px' } }, 'free tier') : null,
            el('div', { class: 'muted' }, `key: ${p.key}`)),
          el('div', { style: { display: 'flex', gap: '4px' } }, toggleBtn, editBtn, delBtn)),
        el('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' } },
          el('span', {}, 'Monthly: ', el('b', {}, fmtMoney(p.monthly_price, cur))),
          el('span', {}, 'Yearly: ', el('b', {}, fmtMoney(p.yearly_price, cur))),
          el('span', {}, 'AI model: ', el('b', {}, p.model_name || 'none')),
          el('span', {}, 'Messages/mo: ', el('b', {}, p.ai_message_limit))));
    });

    body.replaceChildren(el('div', {},
      el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' } },
        el('button', { class: 'btn', onclick: addPlan }, icon('plus'), 'New plan')),
      el('div', { class: 'grid cols-2' }, rows.length ? rows : el('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, 'No plans yet.'))));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '💎 Plans'), el('p', {}, 'Subscription tiers — pricing, AI model and message limits'))),
    body);
}
