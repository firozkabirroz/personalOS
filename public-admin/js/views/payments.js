import { get, post } from '/js/api.js';
import { el, modal, toast, fmtDate, fmtMoney } from '/js/ui.js';

export default async function paymentsView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));

  async function render() {
    const [pays, cfg] = await Promise.all([get('/admin/payments'), get('/admin/config')]);
    const cur = cfg.saas_currency || '৳';
    if (!pays.length) {
      body.replaceChildren(el('div', { class: 'empty' }, el('div', { class: 'big' }, '💳'), 'No payments yet.'));
      return;
    }
    body.replaceChildren(el('div', { class: 'card table-scroll', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'User'), el('th', {}, 'Plan'), el('th', {}, 'Cycle'), el('th', {}, 'Amount'), el('th', {}, 'Method / TrxID'), el('th', {}, 'Status'), el('th', {}, ''))),
        el('tbody', {}, pays.map(p => {
          const actions = el('div', { class: 'row-actions', style: { opacity: 1 } });
          if (p.status === 'pending') {
            actions.append(
              el('button', { class: 'btn success sm', onclick: async () => {
                try { const r = await post(`/admin/payments/${p.id}/approve`); toast(`Approved — valid until ${fmtDate(r.plan_expires)} ✓`); render(); }
                catch (e) { toast(e.message, 'err'); }
              } }, '✓ Approve'),
              el('button', { class: 'btn danger sm', onclick: () => {
                const reason = el('input', { placeholder: 'Reason (optional)' });
                const close = modal({ title: 'Reject payment', body: [el('p', { class: 'muted' }, `User: ${p.username}, TrxID: ${p.trx_id}`), el('div', { class: 'field' }, el('label', {}, 'Reason'), reason)],
                  footer: [el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
                    el('button', { class: 'btn danger', onclick: async () => { await post(`/admin/payments/${p.id}/reject`, { note: reason.value }); close(); toast('Payment rejected'); render(); } }, 'Reject')] });
              } }, '✕ Reject'));
          }
          return el('tr', {},
            el('td', { class: 'muted' }, fmtDate(p.created_at?.slice(0, 10))),
            el('td', {}, el('b', {}, p.username), p.name && p.name !== p.username ? el('div', { class: 'muted' }, p.name) : null),
            el('td', {}, el('span', { class: 'badge accent' }, p.tier_key || '—')),
            el('td', {}, p.plan),
            el('td', {}, fmtMoney(p.amount, cur)),
            el('td', {}, el('div', {}, p.method), el('div', { class: 'muted', style: { fontFamily: 'monospace' } }, p.trx_id)),
            el('td', {}, el('span', { class: `badge ${p.status === 'approved' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}` }, p.status)),
            el('td', {}, actions));
        })))));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '💳 Payments'), el('p', {}, 'Approve or reject submitted payments'))),
    body);
}
