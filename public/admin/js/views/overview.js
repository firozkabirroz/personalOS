import { get } from '/js/api.js';
import { el, barChart, fmtDate } from '/js/ui.js';
import { navigate } from '../app.js';

const TYPE_ICON = {
  registered: '🆕', google_login: '🔵', google_connected: '📅', notion_connected: '📓', telegram_connected: '📨',
  ticket_created: '🎫', team_member_added: '👥',
};

export default async function overviewView() {
  const [o, growth, recent] = await Promise.all([
    get('/admin/overview'), get('/admin/stats/growth'), get('/admin/activity'),
  ]);

  const stat = (label, value, hint, color) =>
    el('div', { class: 'card stat-card' },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value', style: color ? { color } : {} }, String(value)),
      el('div', { class: 'hint' }, hint));

  const activityRow = (a) => el('div', { class: 'list-row' },
    el('div', { class: 'grow' },
      el('div', { class: 'title' }, `${TYPE_ICON[a.type] || '•'} ${a.message}`),
      el('div', { class: 'sub' }, fmtDate(a.created_at?.slice(0, 10)) + (a.username ? ' · ' + a.username : ''))));

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Overview'), el('p', {}, 'Users, AI usage and activity — the platform is 100% free'))),
    el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
      stat('Total users', o.users, `${o.newThisWeek} new this week`, null),
      stat('Active today', o.activeToday, 'logged in today', '#34d399'),
      stat('AI chats (all time)', o.aiChatsTotal, `${o.aiModels} active models`, '#a5b4fc'),
      stat('Open tickets', o.openTickets, o.openTickets ? 'needs attention' : 'all clear', o.openTickets ? '#fbbf24' : null)),

    o.openTickets ? el('div', { class: 'card', style: { marginBottom: '16px', borderColor: 'var(--red)' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        el('span', { style: { fontSize: '22px' } }, '🎫'),
        el('div', { class: 'grow' }, el('b', {}, `${o.openTickets} open support ticket(s)`)),
        el('button', { class: 'btn sm', onclick: () => navigate('support') }, 'Open inbox'))) : null,

    el('div', { class: 'grid cols-2', style: { marginBottom: '16px' } },
      el('div', { class: 'card' },
        el('h3', {}, 'Signups — last 30 days'),
        barChart(growth.signups, { color: 'var(--accent)' })),
      el('div', { class: 'card' },
        el('h3', {}, 'AI chats — last 30 days'),
        barChart(growth.aiChats || [], { color: 'var(--green)' }))),

    el('div', { class: 'card' },
      el('h3', {}, 'Recent activity'),
      el('div', { class: 'stack' }, recent.slice(0, 8).map(activityRow)),
      el('div', { style: { marginTop: '10px', textAlign: 'right' } },
        el('a', { onclick: () => navigate('activity') }, 'View all →'))));
}
