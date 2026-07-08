import { get, post, del } from '/js/api.js';
import { el, icon, icons, modal, confirmModal, toast, fmtDate, fmtMoney } from '/js/ui.js';

async function showDetail(u) {
  const d = await get(`/admin/users/${u.id}/detail`);
  const cfg = await get('/admin/config');
  const cur = cfg.saas_currency || '৳';

  const countRow = (label, value) => el('div', { class: 'stat-card', style: { padding: '10px' } },
    el('div', { class: 'label' }, label), el('div', { class: 'value', style: { fontSize: '18px' } }, String(value)));

  const body = [
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
      el('span', { class: 'badge accent' }, d.user.tier_key || 'free'),
      el('span', { class: `badge ${d.user.role === 'user' ? 'accent' : 'purple'}` }, d.user.role),
      el('span', { class: `badge ${d.integrations.google_connected ? 'green' : ''}` }, `📅 Google ${d.integrations.google_connected ? 'connected' : 'not connected'}`),
      el('span', { class: `badge ${d.integrations.telegram_connected ? 'green' : ''}` }, `📨 Telegram ${d.integrations.telegram_connected ? 'connected' : 'not connected'}`)),
    el('div', { class: 'grid cols-4', style: { marginBottom: '14px' } },
      countRow('Tasks', d.counts.tasks), countRow('Projects', d.counts.projects),
      countRow('Expenses', d.counts.expenses), countRow('Habits', d.counts.habits)),
    d.aiUsage ? el('p', { class: 'muted', style: { marginBottom: '14px' } }, `🤖 AI messages used this month: ${d.aiUsage.used}`) : null,
    el('p', { class: 'muted', style: { marginBottom: '14px' } }, `Joined ${fmtDate(d.user.created_at?.slice(0, 10))} · Last login ${d.user.last_login_at ? fmtDate(d.user.last_login_at.slice(0, 10)) : 'never'}`),
    el('h3', { style: { fontSize: '13px', marginBottom: '8px' } }, 'Recent payments'),
    d.payments.length ? el('div', { class: 'stack', style: { marginBottom: '14px' } }, d.payments.map(p =>
      el('div', { class: 'list-row' },
        el('div', { class: 'grow' }, el('div', { class: 'title' }, `${p.plan} — ${fmtMoney(p.amount, cur)}`), el('div', { class: 'sub' }, fmtDate(p.created_at?.slice(0, 10)))),
        el('span', { class: `badge ${p.status === 'approved' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}` }, p.status)))) :
      el('p', { class: 'muted', style: { marginBottom: '14px' } }, 'No payments yet.'),
    el('h3', { style: { fontSize: '13px', marginBottom: '8px' } }, 'Recent activity'),
    d.activity.length ? el('div', { class: 'stack' }, d.activity.map(a =>
      el('div', { class: 'list-row' }, el('div', { class: 'grow' }, el('div', { class: 'title' }, a.message), el('div', { class: 'sub' }, fmtDate(a.created_at?.slice(0, 10))))))) :
      el('p', { class: 'muted' }, 'No activity logged yet.'),
  ];

  modal({ title: `${d.user.name || d.user.username} — @${d.user.username}`, wide: true, body });
}

export default async function usersView() {
  const body = el('div', {}, el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));

  async function render() {
    const list = await get('/admin/users');
    const rows = list.map(u => {
      const actions = el('div', { class: 'row-actions', style: { opacity: 1, gap: '4px' } });
      actions.append(
        el('button', { class: 'btn ghost sm', onclick: () => showDetail(u) }, 'View'),
        el('button', { class: 'btn ghost sm', title: 'Extend 1 month', onclick: async () => { const r = await post(`/admin/users/${u.id}/plan`, { action: 'extend', months: 1 }); toast(`Extended to ${fmtDate(r.plan_expires)}`); render(); } }, '+1mo'),
        el('button', { class: 'btn ghost sm', title: 'Extend 1 year', onclick: async () => { const r = await post(`/admin/users/${u.id}/plan`, { action: 'extend', months: 12 }); toast(`Extended to ${fmtDate(r.plan_expires)}`); render(); } }, '+1yr'),
        el('button', { class: 'btn ghost sm', title: 'Lock now', onclick: () => confirmModal(`Lock "${u.username}" immediately?`, async () => { await post(`/admin/users/${u.id}/plan`, { action: 'lock' }); toast('User locked'); render(); }) }, '🔒'),
        (() => { const b = el('button', { class: 'icon-btn', title: 'Delete user', onclick: () => confirmModal(`Delete "${u.username}" and ALL their data permanently?`, async () => { await del(`/admin/users/${u.id}`); toast('User deleted'); render(); }) }); b.innerHTML = icons.trash; return b; })());
      return el('tr', {},
        el('td', {}, el('b', {}, u.username), u.name && u.name !== u.username ? el('div', { class: 'muted' }, u.name) : null),
        el('td', {}, el('span', { class: 'badge accent' }, u.tier_key || 'free')),
        el('td', {}, u.plan),
        el('td', {}, u.plan === 'lifetime' ? '∞' : fmtDate(u.plan_expires)),
        el('td', {}, el('span', { class: `badge ${u.expired ? 'red' : 'green'}` }, u.expired ? 'expired' : 'active')),
        el('td', {}, actions));
    });
    body.replaceChildren(el('div', { class: 'card table-scroll', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'User'), el('th', {}, 'Tier'), el('th', {}, 'Cycle'), el('th', {}, 'Expires'), el('th', {}, 'Status'), el('th', {}, 'Actions'))),
        el('tbody', {}, rows))));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '👥 Users'), el('p', {}, 'Customer accounts — tap View for full activity & data'))),
    body);
}
