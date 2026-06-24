import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, modal, confirmModal, toast, todayStr, fmtDate, fmtMoney, daysUntil } from '../ui.js';

export default async function debtsView() {
  let debts = await get('/debts');
  const settings = await get('/settings');
  const cur = settings.currency || '$';
  let tab = 'lent'; // lent = others owe me, borrowed = I owe

  const statsEl = el('div', { class: 'grid cols-3', style: { marginBottom: '16px' } });
  const listEl = el('div', { class: 'stack' });

  const fields = (type) => [
    { key: 'person', label: type === 'lent' ? 'Who owes you?' : 'Who did you borrow from?', placeholder: 'Person or organisation name' },
    { key: 'amount', label: `Amount (${cur})`, type: 'number', step: '0.01', min: 0, half: true },
    { key: 'date', label: 'Date given/taken', type: 'date', default: todayStr(), half: true },
    { key: 'due_date', label: 'Due date (optional)', type: 'date', half: true },
    { key: 'paid', label: `Already repaid (${cur})`, type: 'number', step: '0.01', min: 0, default: 0, half: true },
    { key: 'notes', label: 'Notes', placeholder: 'Why / terms / reminder' },
  ];

  const refresh = async () => { debts = await get('/debts'); render(); };

  const addDebt = () => formModal({
    title: tab === 'lent' ? 'Money someone owes you' : 'Money you owe',
    fields: fields(tab),
    submitLabel: 'Save',
    onSubmit: async (v) => {
      if (!v.person.trim()) throw new Error('Name is required');
      if (!v.amount || Number(v.amount) <= 0) throw new Error('Enter a valid amount');
      v.amount = Number(v.amount); v.paid = Number(v.paid) || 0;
      v.type = tab;
      v.status = v.paid >= v.amount ? 'settled' : 'active';
      await post('/debts', v); await refresh(); toast('Saved');
    },
  });

  const editDebt = (d) => formModal({
    title: 'Edit record', fields: fields(d.type), values: d,
    onSubmit: async (v) => {
      v.amount = Number(v.amount); v.paid = Number(v.paid) || 0;
      v.status = v.paid >= v.amount ? 'settled' : 'active';
      await put(`/debts/${d.id}`, v); await refresh(); toast('Updated');
    },
  });

  function recordPayment(d) {
    const remaining = d.amount - d.paid;
    const input = el('input', { type: 'number', step: '0.01', min: 0, placeholder: `Up to ${remaining.toFixed(2)}` });
    const close = modal({
      title: d.type === 'lent' ? `Payment received from ${d.person}` : `Payment made to ${d.person}`,
      body: [
        el('p', { class: 'muted' }, `Remaining: ${fmtMoney(remaining, cur)}`),
        el('div', { class: 'field' }, el('label', {}, `Amount (${cur})`), input),
      ],
      footer: [
        el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
        el('button', { class: 'btn', onclick: async () => {
          const amt = Number(input.value);
          if (!amt || amt <= 0) return toast('Enter a valid amount', 'err');
          const newPaid = Math.min(d.paid + amt, d.amount);
          await put(`/debts/${d.id}`, { paid: newPaid, status: newPaid >= d.amount ? 'settled' : 'active' });
          close(); await refresh();
          toast(newPaid >= d.amount ? '🎉 Fully settled!' : 'Payment recorded');
        } }, 'Record'),
      ],
    });
    setTimeout(() => input.focus(), 50);
  }

  function render() {
    const receivable = debts.filter(d => d.type === 'lent' && d.status === 'active').reduce((s, d) => s + (d.amount - d.paid), 0);
    const payable = debts.filter(d => d.type === 'borrowed' && d.status === 'active').reduce((s, d) => s + (d.amount - d.paid), 0);
    const net = receivable - payable;

    statsEl.innerHTML = '';
    statsEl.append(
      el('div', { class: 'card stat-card' },
        el('div', { class: 'label' }, '🤝 Others owe you (receivable)'),
        el('div', { class: 'value', style: { color: '#34d399' } }, fmtMoney(receivable, cur)),
        el('div', { class: 'hint' }, `${debts.filter(d => d.type === 'lent' && d.status === 'active').length} people`)),
      el('div', { class: 'card stat-card' },
        el('div', { class: 'label' }, '📉 You owe (debt)'),
        el('div', { class: 'value', style: { color: '#f87171' } }, fmtMoney(payable, cur)),
        el('div', { class: 'hint' }, `${debts.filter(d => d.type === 'borrowed' && d.status === 'active').length} people`)),
      el('div', { class: 'card stat-card' },
        el('div', { class: 'label' }, '⚖️ Net position'),
        el('div', { class: 'value', style: { color: net >= 0 ? '#34d399' : '#f87171' } }, fmtMoney(net, cur)),
        el('div', { class: 'hint' }, net >= 0 ? 'You are owed more than you owe' : 'You owe more than you are owed')),
    );

    const shown = debts.filter(d => d.type === tab);
    listEl.innerHTML = '';
    if (!shown.length) {
      listEl.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, tab === 'lent' ? '🤝' : '📉'),
        tab === 'lent' ? 'Nobody owes you money right now.' : 'You have no recorded debts. 🎉'));
      return;
    }
    for (const d of shown) {
      const remaining = d.amount - d.paid;
      const pct = d.amount ? Math.round((d.paid / d.amount) * 100) : 0;
      const due = daysUntil(d.due_date);
      const settled = d.status === 'settled';

      const payBtn = !settled && el('button', { class: 'btn ghost sm', onclick: () => recordPayment(d) },
        d.type === 'lent' ? '+ Received' : '+ Paid');
      const editBtn = el('button', { class: 'icon-btn', onclick: () => editDebt(d) }); editBtn.innerHTML = icons.edit;
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete record for "${d.person}"?`, async () => { await del(`/debts/${d.id}`); refresh(); }) });
      delBtn.innerHTML = icons.trash;

      listEl.append(el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px', opacity: settled ? .6 : 1 } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
          el('b', { style: { fontSize: '15px' } }, d.person),
          settled ? el('span', { class: 'badge green' }, '✓ settled') :
            (d.due_date ? el('span', { class: `badge ${due !== null && due < 0 ? 'red' : due !== null && due <= 7 ? 'amber' : ''}` },
              due !== null && due < 0 ? `${-due}d overdue` : 'due ' + fmtDate(d.due_date)) : null),
          el('span', { style: { marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' } }, payBtn || null, editBtn, delBtn)),
        el('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' } },
          el('span', {}, 'Total: ', el('b', {}, fmtMoney(d.amount, cur))),
          el('span', {}, d.type === 'lent' ? 'Received: ' : 'Repaid: ', el('b', { style: { color: '#34d399' } }, fmtMoney(d.paid, cur))),
          el('span', {}, 'Remaining: ', el('b', { style: { color: settled ? 'var(--text-dim)' : '#f87171' } }, fmtMoney(remaining, cur)))),
        el('div', { class: 'progress' }, el('div', { style: { width: pct + '%', background: d.type === 'lent' ? '#10b981' : '#f59e0b' } })),
        d.notes ? el('div', { class: 'muted' }, d.notes) : null,
      ));
    }
  }

  const tabs = el('div', { class: 'tabs' },
    el('button', { class: 'tab active', onclick: (e) => switchTab('lent', e) }, '🤝 Owed to me'),
    el('button', { class: 'tab', onclick: (e) => switchTab('borrowed', e) }, '📉 I owe'));
  function switchTab(t, e) {
    tab = t;
    tabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    render();
  }

  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Debts & Loans'), el('p', {}, 'Track money you lent out and money you borrowed — with partial payments')),
      el('div', { class: 'page-actions' }, tabs,
        el('button', { class: 'btn', onclick: addDebt }, icon('plus'), 'Add record'))),
    statsEl, listEl);
}
