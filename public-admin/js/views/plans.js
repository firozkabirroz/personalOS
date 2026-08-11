import { get, post, put, del } from '/js/api.js';
import { el, icon, icons, formModal, confirmModal, toast, fmtMoney } from '/js/ui.js';

export default async function plansView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));
  const cfg = await get('/admin/config');
  const cur = cfg.saas_currency || '৳';

  async function render() {
    const packs = await get('/admin/credit-packs').catch(() => get('/admin/plans'));

    const fields = () => [
      { key: 'key', label: 'Key (unique id)', placeholder: 'e.g. starter' },
      { key: 'name', label: 'Display name', placeholder: 'e.g. Starter Pack' },
      { key: 'credits', label: 'Credits', type: 'number', half: true, default: 50 },
      { key: 'price', label: `Price (${cur})`, type: 'number', half: true, default: 100 },
    ];

    const addPack = () => formModal({
      title: 'Add credit pack', fields: fields(), submitLabel: 'Add',
      onSubmit: async (v) => {
        if (!v.key?.trim() || !v.name?.trim()) throw new Error('Key and name are required');
        await post('/admin/credit-packs', v); toast('Pack added ✓'); render();
      },
    });

    const editPack = (p) => formModal({
      title: `Edit "${p.name}"`,
      fields: fields().filter(f => f.key !== 'key'),
      values: p,
      onSubmit: async (v) => { await put(`/admin/credit-packs/${p.id}`, v); toast('Updated ✓'); render(); },
    });

    body.replaceChildren(el('div', {},
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        el('p', { class: 'muted', style: { margin: 0 } }, 'Users buy these packs. Free AI models never need credits.'),
        el('button', { class: 'btn', onclick: addPack }, icon('plus'), 'Add pack')),
      el('div', { class: 'grid cols-3' }, packs.map(p => {
        const editBtn = el('button', { class: 'icon-btn', onclick: () => editPack(p) }); editBtn.innerHTML = icons.edit;
        const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete pack "${p.name}"?`, async () => {
          try { await del(`/admin/credit-packs/${p.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
        }) }); delBtn.innerHTML = icons.trash;
        const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/credit-packs/${p.id}`, { active: p.active ? 0 : 1 }); render(); } }, p.active ? 'Deactivate' : 'Activate');
        return el('div', { class: 'card', style: { opacity: p.active ? 1 : 0.55 } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
            el('b', {}, p.name), el('div', { style: { display: 'flex', gap: '4px' } }, editBtn, delBtn)),
          el('div', { style: { fontSize: '28px', fontWeight: '700', margin: '10px 0 4px' } }, p.credits ?? p.ai_message_limit),
          el('div', { class: 'muted' }, 'credits'),
          el('div', { style: { margin: '10px 0' } }, fmtMoney(p.price ?? p.monthly_price, cur)),
          toggleBtn);
      }))));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Credit Packs'), el('p', {}, 'Replace subscriptions — sell AI credits instead'))),
    body);
}
