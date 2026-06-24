import { get, post } from '../api.js';
import { el, toast, fmtDate } from '../ui.js';

const STATUS_BADGE = { pending: 'amber', approved: 'green', rejected: 'red' };

export default async function billingView({ lockMode = false } = {}) {
  const info = await get('/billing/info');
  const cfg = info.config;
  const cur = cfg.saas_currency || '৳';
  let selectedPlan = 'monthly';

  const planBadge = info.user.plan === 'lifetime'
    ? el('span', { class: 'badge green' }, '♾ Lifetime')
    : info.expired
      ? el('span', { class: 'badge red' }, 'Expired')
      : el('span', { class: `badge ${info.daysLeft !== null && info.daysLeft <= 5 ? 'amber' : 'green'}` },
          `${info.user.plan} · ${info.daysLeft} days left`);

  // ---- plan cards ----
  const planCard = (key, title, price, sub) => {
    const card = el('div', {
      class: 'card', style: { cursor: 'pointer', textAlign: 'center', borderColor: key === selectedPlan ? 'var(--accent)' : 'var(--border-soft)', flex: '1', minWidth: '150px' },
      onclick: () => {
        selectedPlan = key;
        [monthlyCard, yearlyCard].forEach(c => c.style.borderColor = 'var(--border-soft)');
        card.style.borderColor = 'var(--accent)';
      },
    },
      el('div', { class: 'muted' }, title),
      el('div', { style: { fontSize: '26px', fontWeight: '700', margin: '6px 0' } }, cur + price),
      el('div', { class: 'muted' }, sub));
    return card;
  };
  const monthlyCard = planCard('monthly', 'Monthly', cfg.saas_monthly_price, '1 month access');
  const yearlyCard = planCard('yearly', 'Yearly', cfg.saas_yearly_price, '12 months — best value');

  // ---- payment form ----
  const method = el('select', {}, ['bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Other'].map(m => el('option', {}, m)));
  const trx = el('input', { placeholder: 'e.g. 9HX7A2B5KQ' });
  const hasPending = info.payments.some(p => p.status === 'pending');

  const submitBtn = el('button', { class: 'btn', disabled: hasPending, onclick: async () => {
    submitBtn.disabled = true;
    try {
      await post('/billing/submit', { plan: selectedPlan, trx_id: trx.value, method: method.value });
      toast('Payment submitted! You will be activated after approval ✓');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(e.message, 'err');
      submitBtn.disabled = false;
    }
  } }, hasPending ? 'Waiting for approval…' : 'Submit payment');

  return el('div', { style: lockMode ? { maxWidth: '720px', margin: '0 auto' } : {} },
    !lockMode ? el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'My Subscription'), el('p', {}, 'Plan, renewal and payment history'))) : null,

    el('div', { class: 'card', style: { marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
      el('div', { style: { fontSize: '26px' } }, info.expired ? '🔒' : '✅'),
      el('div', { style: { flex: 1 } },
        el('b', { style: { fontSize: '15px' } }, info.expired ? 'Your subscription has expired' : 'Subscription active'),
        el('div', { class: 'muted' }, info.user.plan === 'lifetime' ? 'Unlimited access'
          : info.user.plan_expires ? `Valid until ${fmtDate(info.user.plan_expires)}` : '')),
      planBadge),

    info.user.plan !== 'lifetime' ? el('div', { class: 'card', style: { marginBottom: '16px' } },
      el('h3', {}, info.expired ? '🔓 Renew your access' : '🚀 Extend / upgrade'),
      el('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' } }, monthlyCard, yearlyCard),
      el('div', { class: 'card', style: { background: 'var(--bg-soft)', marginBottom: '14px' } },
        el('b', { style: { fontSize: '13px', display: 'block', marginBottom: '6px' } }, '💳 Payment instructions'),
        el('p', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--text-dim)' } }, cfg.saas_payment_info)),
      el('div', { class: 'field-row' },
        el('div', { class: 'field' }, el('label', {}, 'Payment method'), method),
        el('div', { class: 'field' }, el('label', {}, 'Transaction ID (TrxID)'), trx)),
      submitBtn) : null,

    info.payments.length ? el('div', { class: 'card' },
      el('h3', {}, '📜 Payment history'),
      el('div', { class: 'stack' }, info.payments.map(p =>
        el('div', { class: 'list-row' },
          el('div', { class: 'grow' },
            el('div', { class: 'title' }, `${p.plan} — ${cur}${p.amount}`),
            el('div', { class: 'sub' }, `${fmtDate(p.created_at?.slice(0, 10))} · ${p.method} · TrxID: ${p.trx_id}${p.note ? ' · ' + p.note : ''}`)),
          el('span', { class: `badge ${STATUS_BADGE[p.status] || ''}` }, p.status))))) : null,
  );
}
