import { get, post } from '../api.js';
import { el, toast, fmtDate, fmtMoney } from '../ui.js';

const STATUS_BADGE = { pending: 'amber', approved: 'green', rejected: 'red' };

export default async function billingView({ lockMode = false } = {}) {
  const info = await get('/billing/info');
  const cfg = info.config;
  const cur = cfg.saas_currency || '৳';
  const paidPlans = info.plans.filter(p => !p.is_free);
  let cycle = 'monthly';
  let selectedKey = paidPlans[0]?.key || null;

  const planBadge = info.user.plan === 'lifetime'
    ? el('span', { class: 'badge green' }, '♾ Lifetime')
    : info.expired
      ? el('span', { class: 'badge red' }, 'Expired')
      : el('span', { class: `badge ${info.daysLeft !== null && info.daysLeft <= 5 ? 'amber' : 'green'}` },
          `${info.user.plan} · ${info.daysLeft} days left`);

  // ---- AI usage card ----
  const usageCard = info.currentTier ? el('div', { class: 'card', style: { marginBottom: '16px' } },
    el('h3', {}, '🤖 AI usage this month'),
    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' } },
      el('span', {}, `Plan: ${info.currentTier.name}${info.currentTier.model_name ? ' — ' + info.currentTier.model_name : ''}`),
      el('b', {}, `${info.usage} / ${info.currentTier.ai_message_limit || 0}`)),
    el('div', { class: 'progress' }, el('div', {
      style: { width: `${info.currentTier.ai_message_limit ? Math.min(100, (info.usage / info.currentTier.ai_message_limit) * 100) : 0}%`, background: info.usage >= info.currentTier.ai_message_limit ? 'var(--red)' : 'var(--accent)' },
    })),
    info.usage >= info.currentTier.ai_message_limit ? el('p', { class: 'muted', style: { marginTop: '8px' } },
      'এই মাসের সীমা শেষ — উপরের একটা প্ল্যানে upgrade করুন, বা Settings-এ নিজের AI API key যোগ করে সীমাহীন ব্যবহার করুন।') : null) : null;

  // ---- plan cards ----
  const cardsWrap = el('div', { class: 'grid cols-3' });
  function renderCards() {
    cardsWrap.innerHTML = '';
    paidPlans.forEach(p => {
      const price = cycle === 'yearly' ? p.yearly_price : p.monthly_price;
      const isCurrent = info.user.tier_key === p.key;
      const isSelected = selectedKey === p.key;
      const card = el('div', {
        class: 'card', style: { cursor: 'pointer', textAlign: 'center', borderColor: isSelected ? 'var(--accent)' : 'var(--border-soft)' },
        onclick: () => { selectedKey = p.key; renderCards(); },
      },
        el('div', { style: { display: 'flex', justifyContent: 'center', gap: '6px' } },
          el('b', {}, p.name), isCurrent ? el('span', { class: 'badge green' }, 'current') : null),
        el('div', { style: { fontSize: '24px', fontWeight: '700', margin: '8px 0' } }, fmtMoney(price, cur)),
        el('div', { class: 'muted', style: { fontSize: '12.5px' } }, cycle === 'yearly' ? '১২ মাস' : '১ মাস'),
        el('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '8px' } }, p.model_name || 'no AI'),
        el('div', { class: 'muted', style: { fontSize: '12.5px' } }, `${p.ai_message_limit} AI মেসেজ/মাস`));
      cardsWrap.append(card);
    });
  }
  renderCards();

  const cycleTabs = el('div', { class: 'tabs' },
    ['monthly', 'yearly'].map(c => el('button', { class: `tab${c === cycle ? ' active' : ''}`, onclick: (e) => {
      cycle = c;
      cycleTabs.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active');
      renderCards();
    } }, c === 'monthly' ? 'মাসিক' : 'বাৎসরিক')));

  const freeBtn = el('button', { class: 'btn ghost sm', onclick: async () => {
    try { await post('/billing/free'); toast('Free প্ল্যানে সুইচ হয়েছে ✓'); setTimeout(() => location.reload(), 800); }
    catch (e) { toast(e.message, 'err'); }
  } }, info.user.tier_key === 'free' ? '✓ বর্তমানে Free প্ল্যানে আছেন' : 'Free প্ল্যানে ফিরে যান');

  // ---- payment form ----
  const method = el('select', {}, ['bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Other'].map(m => el('option', {}, m)));
  const trx = el('input', { placeholder: 'e.g. 9HX7A2B5KQ' });
  const hasPending = info.payments.some(p => p.status === 'pending');

  const submitBtn = el('button', { class: 'btn', disabled: hasPending, onclick: async () => {
    if (!selectedKey) return toast('একটা প্ল্যান বাছাই করুন', 'err');
    submitBtn.disabled = true;
    try {
      await post('/billing/submit', { tier_key: selectedKey, cycle, trx_id: trx.value, method: method.value });
      toast('পেমেন্ট জমা হয়েছে! Approve হলে সাথে সাথে চালু হবে ✓');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(e.message, 'err');
      submitBtn.disabled = false;
    }
  } }, hasPending ? 'অনুমোদনের অপেক্ষায়…' : 'পেমেন্ট জমা দিন');

  return el('div', { style: lockMode ? { maxWidth: '860px', margin: '0 auto' } : {} },
    !lockMode ? el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'My Subscription'), el('p', {}, 'Plan, AI usage, renewal and payment history'))) : null,

    el('div', { class: 'card', style: { marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
      el('div', { style: { fontSize: '26px' } }, info.expired ? '🔒' : '✅'),
      el('div', { style: { flex: 1 } },
        el('b', { style: { fontSize: '15px' } }, info.expired ? 'আপনার সাবস্ক্রিপশন মেয়াদ শেষ' : 'সাবস্ক্রিপশন সক্রিয়'),
        el('div', { class: 'muted' }, info.user.plan === 'lifetime' ? 'Unlimited access'
          : info.user.plan_expires ? `Valid until ${fmtDate(info.user.plan_expires)}` : '')),
      planBadge),

    usageCard,

    info.user.plan !== 'lifetime' ? el('div', { class: 'card', style: { marginBottom: '16px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' } },
        el('h3', { style: { margin: 0 } }, info.expired ? '🔓 রিনিউ করুন' : '🚀 আপগ্রেড / এক্সটেন্ড'),
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, cycleTabs, freeBtn)),
      cardsWrap,
      el('div', { class: 'card', style: { background: 'var(--bg-soft)', margin: '14px 0' } },
        el('b', { style: { fontSize: '13px', display: 'block', marginBottom: '6px' } }, '💳 পেমেন্ট নির্দেশনা'),
        el('p', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--text-dim)' } }, cfg.saas_payment_info)),
      el('div', { class: 'field-row' },
        el('div', { class: 'field' }, el('label', {}, 'পেমেন্ট মাধ্যম'), method),
        el('div', { class: 'field' }, el('label', {}, 'Transaction ID (TrxID)'), trx)),
      submitBtn) : null,

    info.payments.length ? el('div', { class: 'card' },
      el('h3', {}, '📜 পেমেন্ট হিস্ট্রি'),
      el('div', { class: 'stack' }, info.payments.map(p =>
        el('div', { class: 'list-row' },
          el('div', { class: 'grow' },
            el('div', { class: 'title' }, `${p.tier_key || '—'} · ${p.plan} — ${fmtMoney(p.amount, cur)}`),
            el('div', { class: 'sub' }, `${fmtDate(p.created_at?.slice(0, 10))} · ${p.method} · TrxID: ${p.trx_id}${p.note ? ' · ' + p.note : ''}`)),
          el('span', { class: `badge ${STATUS_BADGE[p.status] || ''}` }, p.status))))) : null,
  );
}
