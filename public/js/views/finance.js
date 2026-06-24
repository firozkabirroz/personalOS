import { get, post } from '../api.js';
import { el, icon, toast, fmtMoney, barChart, lineChart, monthKeyOf } from '../ui.js';
import { navigate } from '../app.js';

export default async function financeView() {
  const [expenses, debts, investments, txns, settings] = await Promise.all([
    get('/expenses'), get('/debts'), get('/investments'), get('/investment_txns'), get('/settings'),
  ]);
  const cur = settings.currency || '$';

  const monthKey = monthKeyOf;
  const mk = monthKey(0);

  // ---- This month cash flow ----
  const mRows = expenses.filter(e => e.date.startsWith(mk));
  const income = mRows.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = mRows.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0);
  const profitMonth = txns.filter(t => t.type === 'profit' && t.date.startsWith(mk)).reduce((s, t) => s + t.amount, 0);
  const payoutMonth = txns.filter(t => t.type === 'payout' && t.date.startsWith(mk)).reduce((s, t) => s + t.amount, 0);
  const netMonth = income - expense + profitMonth - payoutMonth;

  // ---- Position ----
  const receivable = debts.filter(d => d.type === 'lent' && d.status === 'active').reduce((s, d) => s + (d.amount - d.paid), 0);
  const payable = debts.filter(d => d.type === 'borrowed' && d.status === 'active').reduce((s, d) => s + (d.amount - d.paid), 0);
  const investedActive = investments.filter(i => i.type === 'made' && i.status === 'active').reduce((s, i) => s + i.amount, 0);
  const capitalHeld = investments.filter(i => i.type === 'received' && i.status === 'active').reduce((s, i) => s + i.amount, 0);
  const totalProfit = txns.filter(t => t.type === 'profit').reduce((s, t) => s + t.amount, 0);
  const totalPayout = txns.filter(t => t.type === 'payout').reduce((s, t) => s + t.amount, 0);
  // What you own/are owed minus what you owe
  const netWorth = receivable + investedActive - payable - capitalHeld;

  // ---- 6-month series ----
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(monthKey(-i));
  const series = months.map(k => {
    const rows = expenses.filter(e => e.date.startsWith(k));
    const inc = rows.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const exp = rows.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0);
    const prof = txns.filter(t => t.type === 'profit' && t.date.startsWith(k)).reduce((s, t) => s + t.amount, 0);
    const pay = txns.filter(t => t.type === 'payout' && t.date.startsWith(k)).reduce((s, t) => s + t.amount, 0);
    const label = new Date(k + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' });
    return { k, label, inc, exp, prof, pay, net: inc - exp + prof - pay };
  });

  const growthPoints = series.map(m => ({ label: m.label, value: Math.round(m.net) }));
  const trendBars = [];
  for (const m of series) {
    trendBars.push({ label: m.label, value: m.inc + m.prof, color: '#10b981' });
    trendBars.push({ label: '·', value: m.exp + m.pay, color: '#ef4444' });
  }

  // growth vs last month
  const last = series[4], curM = series[5];
  const growthPct = last && last.net !== 0 ? ((curM.net - last.net) / Math.abs(last.net) * 100) : null;

  // ---- Decision hints ----
  const hints = [];
  if (income > 0 && (income - expense) / income >= 0.3) hints.push('🟢 Savings rate above 30% — you have room to invest this month.');
  if (income > 0 && expense > income) hints.push('🔴 You are spending more than you earn — cut expenses before investing.');
  if (payable > 0 && payable > receivable) hints.push('🟠 Your debts exceed what others owe you — prioritise repayment over new investments.');
  if (investedActive > 0 && totalProfit / Math.max(investedActive, 1) >= 0.1) hints.push('🟢 Your investments are returning well (' + (totalProfit / investedActive * 100).toFixed(1) + '% so far) — consider reinvesting profit.');
  if (capitalHeld > 0 && payoutMonth === 0) hints.push('🟡 You hold investor capital but paid no returns this month — check your commitments.');
  if (receivable > 0) hints.push(`🔵 ${fmtMoney(receivable, cur)} is owed to you — collecting it would boost your investable cash.`);
  if (!hints.length) hints.push('Add income, expenses, debts and investments to get personalised signals here.');

  const sendBtn = el('button', { class: 'btn ghost', onclick: async () => {
    sendBtn.disabled = true;
    try {
      await post('/telegram/report/finance', { month: mk });
      toast('Finance report sent to your Telegram ✓');
    } catch (e) { toast(e.message, 'err'); }
    sendBtn.disabled = false;
  } }, '📨 Send report to Telegram');

  const stat = (label, value, hint, color, onclick) =>
    el('div', { class: 'card stat-card', style: onclick ? { cursor: 'pointer' } : {}, onclick },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value', style: color ? { color } : {} }, value),
      el('div', { class: 'hint' }, hint));

  const monthLabel = new Date(mk + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Finance Overview'),
        el('p', {}, 'Everything about your money in one place — ' + monthLabel)),
      el('div', { class: 'page-actions' }, sendBtn)),

    // Row 1: this month flow
    el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
      stat('💰 Income', fmtMoney(income, cur), 'this month', '#34d399', () => navigate('expenses')),
      stat('💸 Expenses', fmtMoney(expense, cur), income ? (expense / income * 100).toFixed(0) + '% of income' : 'this month', '#f87171', () => navigate('expenses')),
      stat('📈 Investment profit', fmtMoney(profitMonth, cur), 'received this month', '#34d399', () => navigate('invest')),
      stat('📤 Returns paid', fmtMoney(payoutMonth, cur), 'to investors this month', '#c4b5fd', () => navigate('invest'))),

    // Row 2: position
    el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
      stat('🟢 Net this month', fmtMoney(netMonth, cur),
        growthPct === null ? 'income + profit − expenses − returns' : (growthPct >= 0 ? '↑ ' : '↓ ') + Math.abs(growthPct).toFixed(0) + '% vs last month',
        netMonth >= 0 ? '#34d399' : '#f87171'),
      stat('🤝 Receivable', fmtMoney(receivable, cur), 'others owe you', null, () => navigate('debts')),
      stat('📉 Payable', fmtMoney(payable, cur), 'you owe', null, () => navigate('debts')),
      stat('⚖️ Net position', fmtMoney(netWorth, cur), 'receivable + investments − debts − investor capital',
        netWorth >= 0 ? '#34d399' : '#f87171')),

    el('div', { class: 'grid cols-2', style: { marginBottom: '16px' } },
      el('div', { class: 'card' },
        el('h3', {}, '📊 Money in vs money out — 6 months'),
        barChart(trendBars, { money: true }),
        el('div', { class: 'legend' },
          el('span', {}, el('i', { style: { background: '#10b981' } }), 'In (income + profit)'),
          el('span', {}, el('i', { style: { background: '#ef4444' } }), 'Out (expenses + returns)'))),
      el('div', { class: 'card' },
        el('h3', {}, '📈 Net growth per month'),
        lineChart(growthPoints, { color: '#6366f1' }),
        el('p', { class: 'muted', style: { marginTop: '8px' } },
          'Each point = what you actually kept that month. A rising line means your wealth is growing.'))),

    el('div', { class: 'grid cols-2' },
      el('div', { class: 'card' },
        el('h3', {}, '💼 Capital at work'),
        el('div', { class: 'stack' },
          el('div', { class: 'list-row' }, el('div', { class: 'grow' },
            el('div', { class: 'title' }, 'Your active investments'),
            el('div', { class: 'sub' }, `Total profit earned so far: ${fmtMoney(totalProfit, cur)}`)),
            el('b', {}, fmtMoney(investedActive, cur))),
          el('div', { class: 'list-row' }, el('div', { class: 'grow' },
            el('div', { class: 'title' }, 'Investor capital you hold'),
            el('div', { class: 'sub' }, `Total returns paid so far: ${fmtMoney(totalPayout, cur)}`)),
            el('b', {}, fmtMoney(capitalHeld, cur))))),
      el('div', { class: 'card' },
        el('h3', {}, '🧭 Decision signals'),
        el('div', { class: 'stack' }, hints.map(h => el('div', { class: 'list-row' }, el('div', { class: 'grow', style: { fontSize: '13px' } }, h)))))),
  );
}
