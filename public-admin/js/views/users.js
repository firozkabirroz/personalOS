import { get, post, del } from '/js/api.js';
import { el, icon, icons, modal, confirmModal, toast, fmtDate, fmtMoney } from '/js/ui.js';

async function showDetail(u) {
  const d = await get(`/admin/users/${u.id}/detail`);
  const cfg = await get('/admin/config');
  const cur = cfg.saas_currency || '৳';

  const countRow = (label, value) => el('div', { class: 'stat-card', style: { padding: '10px' } },
    el('div', { class: 'label' }, label), el('div', { class: 'value', style: { fontSize: '18px' } }, String(value)));

  const moduleBtn = (mod, label) => el('button', { class: 'btn ghost sm', onclick: async () => {
    const rows = await get(`/admin/users/${u.id}/data/${mod}`);
    modal({
      title: `${label} — @${d.user.username}`,
      wide: true,
      body: rows.length
        ? el('div', { class: 'stack', style: { maxHeight: '60vh', overflow: 'auto' } }, rows.map(r =>
          el('div', { class: 'list-row' },
            el('div', { class: 'grow' },
              el('div', { class: 'title' }, r.title || r.name || r.content?.slice?.(0, 80) || r.reason || `#${r.id}`),
              el('div', { class: 'sub' }, JSON.stringify(r).slice(0, 180))))))
        : el('p', { class: 'muted' }, 'No data'),
    });
  } }, label);

  const body = [
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
      el('span', { class: 'badge accent' }, `⚡ ${d.credits ?? d.user.credits ?? 0} credits`),
      el('span', { class: `badge ${d.integrations.google_connected ? 'green' : ''}` }, `📅 Google ${d.integrations.google_connected ? 'on' : 'off'}`),
      el('span', { class: `badge ${d.integrations.notion_connected ? 'green' : ''}` }, `📓 Notion ${d.integrations.notion_connected ? 'on' : 'off'}`),
      el('span', { class: `badge ${d.integrations.telegram_connected ? 'green' : ''}` }, `📨 Telegram ${d.integrations.telegram_connected ? 'on' : 'off'}`)),
    el('div', { class: 'grid cols-4', style: { marginBottom: '14px' } },
      countRow('Tasks', d.counts.tasks), countRow('Projects', d.counts.projects),
      countRow('Expenses', d.counts.expenses), countRow('Chats', d.counts.chats)),
    el('p', { class: 'muted', style: { marginBottom: '10px' } }, `Joined ${fmtDate(d.user.created_at?.slice(0, 10))} · Last login ${d.user.last_login_at ? fmtDate(d.user.last_login_at.slice(0, 10)) : 'never'}`),
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
      moduleBtn('chats', 'Chats'), moduleBtn('tasks', 'Tasks'), moduleBtn('expenses', 'Expenses'),
      moduleBtn('ideas', 'Ideas'), moduleBtn('projects', 'Projects'), moduleBtn('ledger', 'Credit ledger')),
    el('h3', { style: { fontSize: '13px', marginBottom: '8px' } }, 'Recent AI chats'),
    (d.recentChats || []).length
      ? el('div', { class: 'stack', style: { marginBottom: '14px', maxHeight: '200px', overflow: 'auto' } }, d.recentChats.slice(-12).map(c =>
        el('div', { class: 'list-row' },
          el('div', { class: 'grow' },
            el('div', { class: 'title' }, `[${c.role}] ${(c.content || '').slice(0, 120)}`),
            el('div', { class: 'sub' }, fmtDate(c.created_at?.slice(0, 10)))))))
      : el('p', { class: 'muted', style: { marginBottom: '14px' } }, 'No chats yet.'),
    el('h3', { style: { fontSize: '13px', marginBottom: '8px' } }, 'Recent payments'),
    d.payments.length ? el('div', { class: 'stack', style: { marginBottom: '14px' } }, d.payments.map(p =>
      el('div', { class: 'list-row' },
        el('div', { class: 'grow' }, el('div', { class: 'title' }, `${p.pack_key || p.tier_key || 'pack'} — ${fmtMoney(p.amount, cur)} (+${p.credits || 0}c)`), el('div', { class: 'sub' }, fmtDate(p.created_at?.slice(0, 10)))),
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
        el('button', { class: 'btn ghost sm', title: 'Grant +50 credits', onclick: async () => { const r = await post(`/admin/users/${u.id}/credits`, { amount: 50, reason: 'Admin grant +50' }); toast(`Balance: ${r.credits}`); render(); } }, '+50c'),
        el('button', { class: 'btn ghost sm', title: 'Grant +200 credits', onclick: async () => { const r = await post(`/admin/users/${u.id}/credits`, { amount: 200, reason: 'Admin grant +200' }); toast(`Balance: ${r.credits}`); render(); } }, '+200c'),
        el('button', { class: 'btn ghost sm', title: 'Reset credits to 0', onclick: () => confirmModal(`Reset credits for "${u.username}"?`, async () => { await post(`/admin/users/${u.id}/plan`, { action: 'lock' }); toast('Credits reset'); render(); }) }, 'Reset'),
        (() => { const b = el('button', { class: 'icon-btn', title: 'Delete user', onclick: () => confirmModal(`Delete "${u.username}" and ALL their data permanently?`, async () => { await del(`/admin/users/${u.id}`); toast('User deleted'); render(); }) }); b.innerHTML = icons.trash; return b; })());
      return el('tr', {},
        el('td', {}, el('b', {}, u.username), u.name && u.name !== u.username ? el('div', { class: 'muted' }, u.name) : null),
        el('td', {}, el('span', { class: 'badge accent' }, `⚡ ${u.credits || 0}`)),
        el('td', {}, fmtDate(u.created_at?.slice(0, 10))),
        el('td', {}, u.last_login_at ? fmtDate(u.last_login_at.slice(0, 10)) : '—'),
        el('td', {}, el('span', { class: 'badge green' }, 'active')),
        el('td', {}, actions));
    });
    body.replaceChildren(el('div', { class: 'card table-scroll', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'User'), el('th', {}, 'Credits'), el('th', {}, 'Joined'), el('th', {}, 'Last login'), el('th', {}, 'Status'), el('th', {}, 'Actions'))),
        el('tbody', {}, rows))));
  }
  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '👥 Users'), el('p', {}, 'All accounts are free — View to inspect data, chats & activity'))),
    body);
}
