import { get, post, del } from '../api.js';
import { el, icon, icons, modal, confirmModal, toast, fmtDate, fmtMoney } from '../ui.js';

export default async function adminView() {
  let tab = 'overview';
  const body = el('div', {});

  const tabs = el('div', { class: 'tabs' },
    ['overview', 'payments', 'users', 'settings'].map(t =>
      el('button', { class: `tab${t === tab ? ' active' : ''}`, onclick: (e) => {
        tab = t;
        tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        render();
      } }, t[0].toUpperCase() + t.slice(1))));

  async function render() {
    body.innerHTML = '';
    body.append(el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));
    try {
      if (tab === 'overview') body.replaceChildren(await overview());
      else if (tab === 'payments') body.replaceChildren(await payments());
      else if (tab === 'users') body.replaceChildren(await users());
      else body.replaceChildren(await config());
    } catch (e) {
      body.replaceChildren(el('div', { class: 'empty' }, el('div', { class: 'big' }, '⚠️'), e.message));
    }
  }

  // ---- Overview ----
  async function overview() {
    const o = await get('/admin/overview');
    const cfg = await get('/admin/config');
    const cur = cfg.saas_currency || '৳';
    const stat = (label, value, hint, color) =>
      el('div', { class: 'card stat-card' },
        el('div', { class: 'label' }, label),
        el('div', { class: 'value', style: color ? { color } : {} }, String(value)),
        el('div', { class: 'hint' }, hint));
    return el('div', {},
      el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
        stat('👥 Total customers', o.users, `${o.active} active`, null),
        stat('✅ Active subscriptions', o.active, `${o.expired} expired`, '#34d399'),
        stat('⏳ Pending payments', o.pendingPayments, o.pendingPayments ? 'needs your review' : 'all clear', o.pendingPayments ? '#fbbf24' : null),
        stat('⚠️ Expiring in 7 days', o.expiringSoon, 'remind them to renew', o.expiringSoon ? '#fbbf24' : null)),
      el('div', { class: 'grid cols-2' },
        stat('💰 Revenue this month', fmtMoney(o.revenueMonth, cur), 'approved payments', '#34d399'),
        stat('🏦 Total revenue', fmtMoney(o.revenueTotal, cur), 'all time', '#34d399')),
      o.pendingPayments ? el('div', { class: 'card', style: { marginTop: '16px', borderColor: 'var(--amber)' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          el('span', { style: { fontSize: '22px' } }, '⏳'),
          el('div', { class: 'grow' }, el('b', {}, `${o.pendingPayments} payment(s) waiting for approval`)),
          el('button', { class: 'btn sm', onclick: () => { tab = 'payments'; tabs.querySelectorAll('.tab')[1].click(); } }, 'Review now'))) : null);
  }

  // ---- Payments ----
  async function payments() {
    const pays = await get('/admin/payments');
    const cfg = await get('/admin/config');
    const cur = cfg.saas_currency || '৳';
    if (!pays.length) return el('div', { class: 'empty' }, el('div', { class: 'big' }, '💳'), 'No payments yet.');
    return el('div', { class: 'card', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'User'), el('th', {}, 'Plan'), el('th', {}, 'Amount'), el('th', {}, 'Method / TrxID'), el('th', {}, 'Status'), el('th', {}, ''))),
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
            el('td', {}, p.plan),
            el('td', {}, fmtMoney(p.amount, cur)),
            el('td', {}, el('div', {}, p.method), el('div', { class: 'muted', style: { fontFamily: 'monospace' } }, p.trx_id)),
            el('td', {}, el('span', { class: `badge ${p.status === 'approved' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}` }, p.status)),
            el('td', {}, actions));
        }))));
  }

  // ---- Users ----
  async function users() {
    const list = await get('/admin/users');
    return el('div', { class: 'card', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'User'), el('th', {}, 'Role'), el('th', {}, 'Plan'), el('th', {}, 'Expires'), el('th', {}, 'Status'), el('th', {}, 'Actions'))),
        el('tbody', {}, list.map(u => {
          const actions = el('div', { class: 'row-actions', style: { opacity: 1, gap: '4px' } });
          if (!u.isOwner) {
            actions.append(
              el('button', { class: 'btn ghost sm', title: 'Extend 1 month', onclick: async () => { const r = await post(`/admin/users/${u.id}/plan`, { action: 'extend', months: 1 }); toast(`Extended to ${fmtDate(r.plan_expires)}`); render(); } }, '+1mo'),
              el('button', { class: 'btn ghost sm', title: 'Extend 1 year', onclick: async () => { const r = await post(`/admin/users/${u.id}/plan`, { action: 'extend', months: 12 }); toast(`Extended to ${fmtDate(r.plan_expires)}`); render(); } }, '+1yr'),
              el('button', { class: 'btn ghost sm', title: 'Lock now', onclick: () => confirmModal(`Lock "${u.username}" immediately?`, async () => { await post(`/admin/users/${u.id}/plan`, { action: 'lock' }); toast('User locked'); render(); }) }, '🔒'),
              (() => { const b = el('button', { class: 'icon-btn', title: 'Delete user', onclick: () => confirmModal(`Delete "${u.username}" and ALL their data permanently?`, async () => { await del(`/admin/users/${u.id}`); toast('User deleted'); render(); }) }); b.innerHTML = icons.trash; return b; })());
          }
          return el('tr', {},
            el('td', {}, el('b', {}, u.username), u.name && u.name !== u.username ? el('div', { class: 'muted' }, u.name) : null),
            el('td', {}, el('span', { class: `badge ${u.isOwner ? 'purple' : ''}` }, u.role)),
            el('td', {}, u.plan),
            el('td', {}, u.plan === 'lifetime' ? '∞' : fmtDate(u.plan_expires)),
            el('td', {}, u.isOwner ? el('span', { class: 'badge purple' }, 'owner') : el('span', { class: `badge ${u.expired ? 'red' : 'green'}` }, u.expired ? 'expired' : 'active')),
            el('td', {}, actions));
        }))));
  }

  // ---- Settings (pricing) ----
  async function config() {
    const cfg = await get('/admin/config');
    const f = {};
    const field = (key, label, type = 'text') => {
      const input = type === 'textarea' ? el('textarea', { rows: 4 }) : el('input', { type });
      input.value = cfg[key] || '';
      f[key] = input;
      return el('div', { class: 'field' }, el('label', {}, label), input);
    };
    return el('div', { class: 'card', style: { maxWidth: '620px' } },
      el('h3', {}, '💵 Pricing & payment setup'),
      el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, 'These appear on every customer\'s subscription page.'),
      el('div', { class: 'field-row' }, field('saas_monthly_price', 'Monthly price', 'number'), field('saas_yearly_price', 'Yearly price', 'number')),
      el('div', { class: 'field-row' }, field('saas_currency', 'Currency symbol'), field('saas_trial_days', 'Free trial (days)', 'number')),
      field('saas_payment_info', 'Payment instructions (shown to customers)', 'textarea'),
      el('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
        const body = {};
        for (const [k, input] of Object.entries(f)) body[k] = input.value;
        await post('/admin/config', body);
        toast('Pricing saved ✓');
      } }, 'Save settings'));
  }

  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '🛡 Admin Panel'), el('p', {}, 'Customers, payments and revenue — owner only')),
      el('div', { class: 'page-actions' }, tabs)),
    body);
}
