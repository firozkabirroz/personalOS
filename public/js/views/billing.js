import { get, post } from '../api.js';
import { el, icons, toast, fmtDate, fmtMoney, countUp } from '../ui.js';

const STATUS_BADGE = { pending: 'amber', approved: 'green', rejected: 'red' };

export default async function billingView() {
  const info = await get('/billing/info');
  const cfg = info.config;
  const cur = cfg.saas_currency || '৳';
  const packs = info.packs || [];
  let selectedKey = packs[0]?.key || null;

  const cardsWrap = el('div', { class: 'grid cols-3' });
  function renderCards() {
    cardsWrap.innerHTML = '';
    packs.forEach(p => {
      const isSelected = selectedKey === p.key;
      const card = el('div', {
        class: 'card', style: { cursor: 'pointer', textAlign: 'center', borderColor: isSelected ? 'var(--accent)' : 'var(--border-soft)' },
        onclick: () => { selectedKey = p.key; renderCards(); },
      },
        el('b', {}, p.name),
        el('div', { style: { fontSize: '28px', fontWeight: '700', margin: '10px 0 4px' } }, p.credits),
        el('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'credits'),
        el('div', { style: { fontSize: '18px', fontWeight: '600', marginTop: '10px' } }, fmtMoney(p.price, cur)));
      cardsWrap.append(card);
    });
  }
  renderCards();

  const method = el('select', {}, ['bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Other'].map(m => el('option', {}, m)));
  const trx = el('input', { placeholder: 'e.g. 9HX7A2B5KQ' });
  const hasPending = info.payments.some(p => p.status === 'pending');

  const submitBtn = el('button', { class: 'btn', disabled: hasPending, onclick: async () => {
    if (!selectedKey) return toast('একটা pack বাছাই করুন', 'err');
    submitBtn.disabled = true;
    try {
      await post('/billing/submit', { pack_key: selectedKey, trx_id: trx.value, method: method.value });
      toast('পেমেন্ট জমা হয়েছে! Approve হলে credits যোগ হবে ✓');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(e.message, 'err');
      submitBtn.disabled = false;
    }
  } }, hasPending ? 'Pending approval…' : 'Submit payment');

  const freeModels = (info.models || []).filter(m => m.is_free);
  const paidModels = (info.models || []).filter(m => !m.is_free);

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Credits'),
        el('p', {}, 'App is free forever. Buy credits only for paid AI models.'))),

    el('div', { class: 'card', style: { marginBottom: '16px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
          (() => { const t = el('div', { class: 'stat-ic amber', style: { width: '44px', height: '44px', marginBottom: 0 } }); t.innerHTML = icons.zap; return t; })(),
          el('div', {},
            el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Your balance'),
            (() => {
              const v = el('div', { class: 'num', style: { fontSize: '32px', fontWeight: '750', letterSpacing: '-.6px' } }, '0');
              requestAnimationFrame(() => countUp(v, info.credits || 0, { suffix: ' credits' }));
              return v;
            })())),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          freeModels.map(m => el('span', { class: 'badge green' }, `${m.name} · Free`)),
          paidModels.map(m => el('span', { class: 'badge accent' }, `${m.name} · ${m.credit_cost}c`))))),

    packs.length ? el('div', { class: 'card', style: { marginBottom: '16px' } },
      el('h3', {}, 'Buy a credit pack'),
      el('p', { class: 'muted', style: { marginTop: '-6px', marginBottom: '14px', whiteSpace: 'pre-wrap' } }, cfg.saas_payment_info || ''),
      cardsWrap,
      el('div', { class: 'field-row', style: { marginTop: '16px' } },
        el('div', { class: 'field' }, el('label', {}, 'Payment method'), method),
        el('div', { class: 'field' }, el('label', {}, 'Transaction ID (TrxID)'), trx)),
      submitBtn) : el('div', { class: 'card' }, el('p', { class: 'muted' }, 'No credit packs configured yet — free models still work.')),

    el('div', { class: 'card', style: { marginBottom: '16px' } },
      el('h3', {}, 'Payment history'),
      info.payments.length
        ? el('div', { class: 'stack' }, info.payments.map(p =>
          el('div', { class: 'list-row' },
            el('div', { class: 'grow' },
              el('div', { class: 'title' }, `${p.pack_key || p.tier_key || 'pack'} · +${p.credits || '?'} credits`),
              el('div', { class: 'sub' }, `${fmtMoney(p.amount, cur)} · ${p.method} · ${p.trx_id} · ${fmtDate(p.created_at?.slice(0, 10))}`)),
            el('span', { class: `badge ${STATUS_BADGE[p.status] || ''}` }, p.status))))
        : el('p', { class: 'muted' }, 'No payments yet.')),

    (info.ledger || []).length ? el('div', { class: 'card' },
      el('h3', {}, 'Credit activity'),
      el('div', { class: 'stack' }, info.ledger.map(l =>
        el('div', { class: 'list-row' },
          el('div', { class: 'grow' },
            el('div', { class: 'title' }, l.reason || l.ref_type || 'Adjustment'),
            el('div', { class: 'sub' }, fmtDate(l.created_at?.slice(0, 10)))),
          el('span', { class: `badge ${l.delta >= 0 ? 'green' : 'amber'}` }, `${l.delta >= 0 ? '+' : ''}${l.delta}`))))) : null,
  );
}
