import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, modal, confirmModal, toast, todayStr, fmtDate, fmtMoney } from '../ui.js';

export default async function investView() {
  let investments = await get('/investments');
  let txns = await get('/investment_txns');
  const settings = await get('/settings');
  const cur = settings.currency || '$';
  let tab = 'made'; // made = my investments | received = investor capital I took

  const statsEl = el('div', { class: 'grid cols-3', style: { marginBottom: '16px' } });
  const gridEl = el('div', { class: 'grid cols-2' });

  const fields = (type) => [
    { key: 'name', label: type === 'made' ? 'What did you invest in?' : 'Deal / business name', placeholder: type === 'made' ? 'e.g. Poultry farm share' : 'e.g. Shop expansion capital' },
    { key: 'partner', label: type === 'made' ? 'With whom / platform (optional)' : 'Investor name', placeholder: 'Person or company' },
    { key: 'amount', label: `Capital amount (${cur})`, type: 'number', step: '0.01', min: 0, half: true },
    { key: 'expected_return', label: 'Expected return', placeholder: 'e.g. 10% monthly', half: true },
    { key: 'start_date', label: 'Start date', type: 'date', default: todayStr(), half: true },
    { key: 'end_date', label: 'End date (optional)', type: 'date', half: true },
    { key: 'notes', label: 'Terms / notes', type: 'textarea', rows: 2 },
  ];

  const refresh = async () => {
    investments = await get('/investments');
    txns = await get('/investment_txns');
    render();
  };

  const addInvestment = () => formModal({
    title: tab === 'made' ? 'New investment' : 'Capital received from investor',
    fields: fields(tab), submitLabel: 'Save',
    onSubmit: async (v) => {
      if (!v.name.trim()) throw new Error('Name is required');
      if (!v.amount || Number(v.amount) <= 0) throw new Error('Enter a valid amount');
      v.amount = Number(v.amount); v.type = tab;
      await post('/investments', v); await refresh(); toast('Saved 💼');
    },
  });

  const editInvestment = (i) => formModal({
    title: 'Edit', fields: fields(i.type), values: i,
    onSubmit: async (v) => { v.amount = Number(v.amount); await put(`/investments/${i.id}`, v); await refresh(); toast('Updated'); },
  });

  function addTxn(inv, type) {
    // type: 'profit' (লাভ পেলাম) | 'payout' (রিটার্ন দিলাম)
    const amount = el('input', { type: 'number', step: '0.01', min: 0 });
    const date = el('input', { type: 'date' }); date.value = todayStr();
    const notes = el('input', { placeholder: 'optional note' });
    const close = modal({
      title: type === 'profit' ? `Profit received — ${inv.name}` : `Return paid to ${inv.partner || 'investor'} — ${inv.name}`,
      body: [
        el('div', { class: 'field-row' },
          el('div', { class: 'field' }, el('label', {}, `Amount (${cur})`), amount),
          el('div', { class: 'field' }, el('label', {}, 'Date'), date)),
        el('div', { class: 'field' }, el('label', {}, 'Note'), notes),
      ],
      footer: [
        el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
        el('button', { class: 'btn', onclick: async () => {
          const amt = Number(amount.value);
          if (!amt || amt <= 0) return toast('Enter a valid amount', 'err');
          await post('/investment_txns', { investment_id: inv.id, type, amount: amt, date: date.value, notes: notes.value });
          close(); await refresh();
          toast(type === 'profit' ? 'Profit recorded 📈' : 'Return payment recorded 📤');
        } }, 'Record'),
      ],
    });
    setTimeout(() => amount.focus(), 50);
  }

  function invCard(inv) {
    const invTxns = txns.filter(t => t.investment_id === inv.id);
    const profit = invTxns.filter(t => t.type === 'profit').reduce((s, t) => s + t.amount, 0);
    const payout = invTxns.filter(t => t.type === 'payout').reduce((s, t) => s + t.amount, 0);
    const isMade = inv.type === 'made';
    const roi = inv.amount ? ((isMade ? profit : payout) / inv.amount * 100) : 0;
    const closed = inv.status !== 'active';

    const editBtn = el('button', { class: 'icon-btn', onclick: () => editInvestment(inv) }); editBtn.innerHTML = icons.edit;
    const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete "${inv.name}" and its transaction history?`, async () => { await del(`/investments/${inv.id}`); refresh(); }) });
    delBtn.innerHTML = icons.trash;

    return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px', opacity: closed ? .65 : 1, borderTop: `3px solid ${isMade ? '#10b981' : '#8b5cf6'}` } },
      el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } },
        el('div', { style: { flex: 1 } },
          el('b', { style: { fontSize: '15px' } }, inv.name),
          el('div', { class: 'muted' }, (inv.partner ? (isMade ? 'with ' : 'from ') + inv.partner + ' · ' : '') +
            fmtDate(inv.start_date) + (inv.end_date ? ' → ' + fmtDate(inv.end_date) : ''))),
        closed ? el('span', { class: 'badge' }, 'closed') : el('span', { class: 'badge green' }, 'active'),
        editBtn, delBtn),

      el('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' } },
        el('span', {}, 'Capital: ', el('b', {}, fmtMoney(inv.amount, cur))),
        isMade
          ? el('span', {}, 'Profit received: ', el('b', { style: { color: '#34d399' } }, fmtMoney(profit, cur)))
          : el('span', {}, 'Returns paid: ', el('b', { style: { color: '#f87171' } }, fmtMoney(payout, cur))),
        el('span', {}, isMade ? 'ROI: ' : 'Paid back: ', el('b', { style: { color: isMade ? (roi >= 0 ? '#34d399' : '#f87171') : 'var(--text)' } }, roi.toFixed(1) + '%')),
        inv.expected_return ? el('span', { class: 'muted' }, 'Expected: ' + inv.expected_return) : null),

      invTxns.length ? el('div', { class: 'stack', style: { gap: '4px' } },
        invTxns.slice(0, 4).map(t => el('div', { style: { display: 'flex', gap: '10px', fontSize: '12.5px', color: 'var(--text-dim)' } },
          el('span', { class: `badge ${t.type === 'profit' ? 'green' : 'purple'}` }, t.type === 'profit' ? '↑ profit' : '↓ return'),
          el('span', {}, fmtDate(t.date)),
          el('b', { style: { color: t.type === 'profit' ? '#34d399' : '#c4b5fd' } }, fmtMoney(t.amount, cur)),
          t.notes ? el('span', { class: 'muted' }, t.notes) : null)),
        invTxns.length > 4 ? el('span', { class: 'muted' }, `+${invTxns.length - 4} more transactions`) : null) : null,

      !closed ? el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        isMade
          ? el('button', { class: 'btn success sm', onclick: () => addTxn(inv, 'profit') }, '+ Profit received')
          : el('button', { class: 'btn sm', style: { background: '#8b5cf6' }, onclick: () => addTxn(inv, 'payout') }, '+ Return paid'),
        el('button', { class: 'btn ghost sm', onclick: async () => {
          await put(`/investments/${inv.id}`, { status: 'closed' });
          toast('Marked as closed'); refresh();
        } }, 'Close')) : null,
    );
  }

  function render() {
    const made = investments.filter(i => i.type === 'made');
    const received = investments.filter(i => i.type === 'received');
    const madeActive = made.filter(i => i.status === 'active').reduce((s, i) => s + i.amount, 0);
    const recvActive = received.filter(i => i.status === 'active').reduce((s, i) => s + i.amount, 0);
    const totalProfit = txns.filter(t => t.type === 'profit').reduce((s, t) => s + t.amount, 0);
    const totalPayout = txns.filter(t => t.type === 'payout').reduce((s, t) => s + t.amount, 0);

    statsEl.innerHTML = '';
    if (tab === 'made') {
      statsEl.append(
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '💼 Active capital invested'),
          el('div', { class: 'value' }, fmtMoney(madeActive, cur)),
          el('div', { class: 'hint' }, `${made.filter(i => i.status === 'active').length} active investments`)),
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '📈 Total profit received'),
          el('div', { class: 'value', style: { color: '#34d399' } }, fmtMoney(totalProfit, cur)),
          el('div', { class: 'hint' }, 'All time, across all investments')),
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '📊 Overall ROI'),
          el('div', { class: 'value' }, (made.reduce((s, i) => s + i.amount, 0) ? (totalProfit / made.reduce((s, i) => s + i.amount, 0) * 100).toFixed(1) : '0') + '%'),
          el('div', { class: 'hint' }, 'Profit ÷ total capital invested')));
    } else {
      statsEl.append(
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '🏛 Active investor capital'),
          el('div', { class: 'value' }, fmtMoney(recvActive, cur)),
          el('div', { class: 'hint' }, `${received.filter(i => i.status === 'active').length} active deals`)),
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '📤 Total returns paid'),
          el('div', { class: 'value', style: { color: '#c4b5fd' } }, fmtMoney(totalPayout, cur)),
          el('div', { class: 'hint' }, 'All time, to all investors')),
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '⚖️ Capital still working'),
          el('div', { class: 'value' }, fmtMoney(recvActive - totalPayout, cur)),
          el('div', { class: 'hint' }, 'Active capital minus returns paid')));
    }

    const shown = investments.filter(i => i.type === tab);
    gridEl.innerHTML = '';
    if (!shown.length) {
      gridEl.append(el('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
        el('div', { class: 'big' }, tab === 'made' ? '📈' : '🏛'),
        tab === 'made' ? 'No investments yet. Record where your money is working.' : 'No investor capital recorded.'));
      return;
    }
    shown.forEach(i => gridEl.append(invCard(i)));
  }

  const tabs = el('div', { class: 'tabs' },
    el('button', { class: 'tab active', onclick: (e) => switchTab('made', e) }, '📈 My investments'),
    el('button', { class: 'tab', onclick: (e) => switchTab('received', e) }, '🏛 Investor capital'));
  function switchTab(t, e) {
    tab = t;
    tabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    render();
  }

  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Investments'),
        el('p', {}, 'Your investments & profit — plus capital you took from investors and the returns you pay them')),
      el('div', { class: 'page-actions' }, tabs,
        el('button', { class: 'btn', onclick: addInvestment }, icon('plus'), 'Add'))),
    statsEl, gridEl);
}
