import { get } from '/js/api.js';
import { el, fmtDate } from '/js/ui.js';

const TYPE_ICON = {
  registered: '🆕', google_login: '🔵', google_connected: '📅', telegram_connected: '📨',
  payment_submitted: '💳', payment_approved: '✅', payment_rejected: '❌',
  ticket_created: '🎫', plan_changed: '🔧', team_member_added: '👥',
};
const TYPES = Object.keys(TYPE_ICON);

export default async function activityView() {
  let filter = '';
  const body = el('div', { class: 'stack' });

  async function render() {
    const rows = await get('/admin/activity' + (filter ? `?type=${filter}` : ''));
    if (!rows.length) {
      body.replaceChildren(el('div', { class: 'empty' }, el('div', { class: 'big' }, '🕐' ), 'No activity logged yet.'));
      return;
    }
    body.replaceChildren(...rows.map(a => el('div', { class: 'list-row' },
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, `${TYPE_ICON[a.type] || '•'} ${a.message}`),
        el('div', { class: 'sub' }, fmtDate(a.created_at?.slice(0, 10)) + (a.username ? ' · ' + a.username : ''))),
      el('span', { class: 'badge' }, a.type))));
  }

  const filterSelect = el('select', { onchange: (e) => { filter = e.target.value; render(); } },
    el('option', { value: '' }, 'All types'),
    TYPES.map(t => el('option', { value: t }, t)));

  await render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '🕐 Activity'), el('p', {}, 'Platform-wide event feed — signups, payments, connections, tickets')),
      el('div', { class: 'page-actions' }, filterSelect)),
    body);
}
