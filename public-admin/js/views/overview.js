import { get } from '/js/api.js';
import { el, barChart, fmtMoney, fmtDate } from '/js/ui.js';
import { navigate } from '../app.js';

const TYPE_ICON = {
  registered: '🆕', google_login: '🔵', google_connected: '📅', notion_connected: '📓', telegram_connected: '📨',
  payment_submitted: '💳', payment_approved: '✅', payment_rejected: '❌',
  ticket_created: '🎫', plan_changed: '🔧', credits_adjusted: '⚡', ai_chat: '🤖', team_member_added: '👥',
};

export default async function overviewView() {
  const [o, cfg, growth, recent] = await Promise.all([
    get('/admin/overview'), get('/admin/config'), get('/admin/stats/growth'), get('/admin/activity'),
  ]);
  const cur = cfg.saas_currency || '৳';

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
      el('div', {}, el('h2', {}, 'Overview'), el('p', {}, 'Customers, payments, revenue and activity at a glance'))),
    el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
      stat('Total users', o.users, 'all free accounts', null),
      stat('Credits sold (mo)', o.creditsSoldMonth || 0, 'approved this month', '#34d399'),
      stat('Pending payments', o.pendingPayments, o.pendingPayments ? 'needs your review' : 'all clear', o.pendingPayments ? '#fbbf24' : null),
      stat('Open tickets', o.openTickets, 'support inbox', o.openTickets ? '#f87171' : null)),
    el('div', { class: 'grid cols-2', style: { marginBottom: '16px' } },
      stat('Revenue this month', fmtMoney(o.revenueMonth, cur), 'approved payments', '#34d399'),
      stat('Total revenue', fmtMoney(o.revenueTotal, cur), 'all time', '#34d399')),

    o.pendingPayments ? el('div', { class: 'card', style: { marginBottom: '16px', borderColor: 'var(--amber)' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        el('span', { style: { fontSize: '22px' } }, '⏳'),
        el('div', { class: 'grow' }, el('b', {}, `${o.pendingPayments} payment(s) waiting for approval`)),
        el('button', { class: 'btn sm', onclick: () => navigate('payments') }, 'Review now'))) : null,
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
        el('h3', {}, 'Revenue — last 30 days'),
        barChart(growth.revenue, { color: 'var(--green)', money: true }))),

    el('div', { class: 'card' },
      el('h3', {}, 'Recent activity'),
      el('div', { class: 'stack' }, recent.slice(0, 8).map(activityRow)),
      el('div', { style: { marginTop: '10px', textAlign: 'right' } },
        el('a', { onclick: () => navigate('activity') }, 'View all →'))));
}
