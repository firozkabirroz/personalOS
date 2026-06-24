import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, todayStr, fmtDate, fmtMoney, donut, barChart, monthKeyOf } from '../ui.js';

const EXP_CATEGORIES = ['food', 'transport', 'shopping', 'bills', 'health', 'entertainment', 'education', 'travel', 'general'];
const INC_CATEGORIES = ['salary', 'business', 'freelance', 'investment', 'gift', 'other'];
const CAT_COLORS = {
  food: '#f59e0b', transport: '#06b6d4', shopping: '#ec4899', bills: '#ef4444', health: '#10b981',
  entertainment: '#8b5cf6', education: '#6366f1', travel: '#14b8a6', general: '#64748b',
  salary: '#10b981', business: '#06b6d4', freelance: '#8b5cf6', investment: '#6366f1', gift: '#ec4899', other: '#64748b',
};

export default async function expensesView() {
  let expenses = await get('/expenses');
  const settings = await get('/settings');
  const cur = settings.currency || '$';
  let monthOffset = 0;

  const content = el('div', {});

  const fields = (type) => [
    { key: 'title', label: 'Description', placeholder: type === 'income' ? 'e.g. June salary' : 'e.g. Groceries' },
    { key: 'amount', label: `Amount (${cur})`, type: 'number', step: '0.01', min: 0, half: true },
    { key: 'date', label: 'Date', type: 'date', default: todayStr(), half: true },
    { key: 'category', label: type === 'income' ? 'Source' : 'Where did it go? (category)', type: 'select',
      options: type === 'income' ? INC_CATEGORIES : EXP_CATEGORIES, default: type === 'income' ? 'salary' : 'general' },
    { key: 'notes', label: 'Notes' },
  ];

  const refresh = async () => { expenses = await get('/expenses'); render(); };

  const addEntry = (type) => formModal({
    title: type === 'income' ? 'Add earning' : 'Add expense',
    fields: fields(type),
    submitLabel: 'Add',
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('Description is required');
      if (!v.amount || Number(v.amount) <= 0) throw new Error('Enter a valid amount');
      v.amount = Number(v.amount);
      v.type = type;
      await post('/expenses', v);
      await refresh();
      toast(type === 'income' ? 'Earning added 💰' : 'Expense added');
    },
  });

  const editEntry = (x) => formModal({
    title: x.type === 'income' ? 'Edit earning' : 'Edit expense',
    fields: fields(x.type), values: x,
    onSubmit: async (v) => { v.amount = Number(v.amount); await put(`/expenses/${x.id}`, v); await refresh(); toast('Updated'); },
  });

  const monthKey = monthKeyOf;

  function monthData(mk) {
    const rows = expenses.filter(e => e.date.startsWith(mk));
    const income = rows.filter(e => e.type === 'income');
    const spent = rows.filter(e => e.type !== 'income');
    return {
      rows,
      income,
      spent,
      incomeTotal: income.reduce((s, e) => s + e.amount, 0),
      spentTotal: spent.reduce((s, e) => s + e.amount, 0),
    };
  }

  // ---------- CSV export ----------
  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const mk = monthKey(monthOffset);
    const monthLabel = new Date(mk + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const { rows, incomeTotal, spentTotal, spent } = monthData(mk);
    if (!rows.length) return toast('Nothing to export for this month', 'err');

    const byCat = {};
    for (const e of spent) byCat[e.category] = (byCat[e.category] || 0) + e.amount;

    const lines = [];
    lines.push(['Personal OS Finance Report', monthLabel].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Total Income', incomeTotal.toFixed(2)].join(','));
    lines.push(['Total Expenses', spentTotal.toFixed(2)].join(','));
    lines.push(['Balance (Savings)', (incomeTotal - spentTotal).toFixed(2)].join(','));
    lines.push(['Savings Rate', incomeTotal ? ((incomeTotal - spentTotal) / incomeTotal * 100).toFixed(1) + '%' : 'n/a'].join(','));
    lines.push('');
    lines.push('Spending by Category');
    lines.push(['Category', 'Amount', '% of Income', '% of Spending'].join(','));
    for (const [c, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
      lines.push([c, v.toFixed(2),
        incomeTotal ? (v / incomeTotal * 100).toFixed(1) + '%' : 'n/a',
        spentTotal ? (v / spentTotal * 100).toFixed(1) + '%' : 'n/a'].join(','));
    }
    lines.push('');
    lines.push('Transactions');
    lines.push(['Date', 'Type', 'Description', 'Category', 'Amount', 'Notes'].join(','));
    for (const e of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      lines.push([e.date, e.type, csvEscape(e.title), e.category,
        (e.type === 'income' ? '+' : '-') + e.amount.toFixed(2), csvEscape(e.notes || '')].join(','));
    }

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-report-${mk}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Report downloaded 📄');
  }

  function render() {
    const mk = monthKey(monthOffset);
    const monthLabel = new Date(mk + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const { rows, incomeTotal, spentTotal, spent } = monthData(mk);
    const balance = incomeTotal - spentTotal;

    const byCat = {};
    for (const e of spent) byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    const catItems = Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([c, v]) => ({ label: c, value: v, color: CAT_COLORS[c] || '#64748b' }));

    // last 6 months: paired income (green) / expense (red) bars
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const k = monthKey(monthOffset - i);
      const m = monthData(k);
      const label = new Date(k + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' });
      trend.push({ label, value: m.incomeTotal, color: '#10b981' });
      trend.push({ label: '·', value: m.spentTotal, color: '#ef4444' });
    }

    content.innerHTML = '';
    content.append(
      // Report stat row
      el('div', { class: 'grid cols-3', style: { marginBottom: '16px' } },
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '💰 Income — ' + monthLabel),
          el('div', { class: 'value', style: { color: '#34d399' } }, fmtMoney(incomeTotal, cur)),
          el('div', { class: 'hint' }, `${rows.filter(e => e.type === 'income').length} earnings recorded`)),
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '💸 Expenses — ' + monthLabel),
          el('div', { class: 'value', style: { color: '#f87171' } }, fmtMoney(spentTotal, cur)),
          el('div', { class: 'hint' }, incomeTotal ? `${(spentTotal / incomeTotal * 100).toFixed(0)}% of your income spent` : `${spent.length} transactions`)),
        el('div', { class: 'card stat-card' },
          el('div', { class: 'label' }, '🏦 Balance (savings)'),
          el('div', { class: 'value', style: { color: balance >= 0 ? '#34d399' : '#f87171' } }, fmtMoney(balance, cur)),
          el('div', { class: 'hint' }, incomeTotal
            ? (balance >= 0 ? `Savings rate: ${(balance / incomeTotal * 100).toFixed(1)}%` : 'You spent more than you earned!')
            : 'Add your earnings to see savings rate')),
      ),

      el('div', { class: 'grid cols-2', style: { marginBottom: '16px' } },
        el('div', { class: 'card' },
          el('h3', {}, 'Where your money goes'),
          el('div', { style: { display: 'flex', gap: '18px', alignItems: 'center' } },
            donut(catItems, { size: 110 }),
            el('div', { class: 'legend', style: { flexDirection: 'column', gap: '5px', marginTop: 0 } },
              catItems.slice(0, 7).map(c => el('span', {},
                el('i', { style: { background: c.color } }),
                `${c.label} — ${fmtMoney(c.value, cur)}` +
                (incomeTotal ? ` (${(c.value / incomeTotal * 100).toFixed(0)}% of income)` : '')))))),
        el('div', { class: 'card' },
          el('h3', {}, 'Income vs expenses — last 6 months'),
          barChart(trend, { money: true }),
          el('div', { class: 'legend' },
            el('span', {}, el('i', { style: { background: '#10b981' } }), 'Income'),
            el('span', {}, el('i', { style: { background: '#ef4444' } }), 'Expenses'))),
      ),

      el('div', { class: 'card', style: { padding: '8px 4px' } },
        rows.length
          ? el('table', { class: 'data' },
              el('thead', {}, el('tr', {},
                el('th', {}, 'Date'), el('th', {}, 'Description'), el('th', {}, 'Category'),
                el('th', { style: { textAlign: 'right' } }, 'Amount'), el('th', {}, ''))),
              el('tbody', {}, rows.map(x => {
                const isInc = x.type === 'income';
                const editBtn = el('button', { class: 'icon-btn', onclick: () => editEntry(x) }); editBtn.innerHTML = icons.edit;
                const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete "${x.title}"?`, async () => { await del(`/expenses/${x.id}`); refresh(); }) });
                delBtn.innerHTML = icons.trash;
                return el('tr', {},
                  el('td', { class: 'muted' }, fmtDate(x.date)),
                  el('td', {}, el('b', {}, x.title), x.notes ? el('span', { class: 'muted' }, ' · ' + x.notes) : null),
                  el('td', {},
                    isInc ? el('span', { class: 'badge green' }, '↑ ' + x.category)
                          : el('span', { class: 'badge', style: { color: CAT_COLORS[x.category], background: 'transparent', border: `1px solid ${CAT_COLORS[x.category]}44` } }, x.category)),
                  el('td', { style: { textAlign: 'right', fontWeight: 600, color: isInc ? '#34d399' : 'var(--text)' } },
                    (isInc ? '+' : '−') + fmtMoney(x.amount, cur)),
                  el('td', {}, el('div', { class: 'row-actions' }, editBtn, delBtn)));
              })))
          : el('div', { class: 'empty', style: { margin: '14px' } }, el('div', { class: 'big' }, '💸'), `Nothing recorded in ${monthLabel}.`)),
    );
    titleEl.textContent = monthLabel;
  }

  const titleEl = el('b', { style: { minWidth: '140px', textAlign: 'center', display: 'inline-block', fontSize: '14px' } });
  const prevBtn = el('button', { class: 'btn ghost sm', onclick: () => { monthOffset--; render(); } }); prevBtn.innerHTML = icons.chevL;
  const nextBtn = el('button', { class: 'btn ghost sm', onclick: () => { if (monthOffset < 0) { monthOffset++; render(); } } }); nextBtn.innerHTML = icons.chevR;

  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Expenses & Income'), el('p', {}, 'Track what comes in, where it goes, and what you keep')),
      el('div', { class: 'page-actions' },
        prevBtn, titleEl, nextBtn,
        el('button', { class: 'btn ghost', onclick: exportCSV }, icon('download'), 'Export CSV'),
        el('button', { class: 'btn success', onclick: () => addEntry('income') }, icon('plus'), 'Earning'),
        el('button', { class: 'btn', onclick: () => addEntry('expense') }, icon('plus'), 'Expense'))),
    content);
}
