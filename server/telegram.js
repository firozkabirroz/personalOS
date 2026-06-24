const express = require('express');
const { db, getSetting, setSetting } = require('./db');

// ============ Sending ============
async function send(uid, text) {
  const token = getSetting(uid, 'telegram_bot_token');
  const chat = getSetting(uid, 'telegram_chat_id');
  if (!token || !chat) throw new Error('Telegram is not configured. Add your bot token and chat ID in Settings.');
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text: text.slice(0, 4000),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.ok) throw new Error('Telegram: ' + (data.description || `send failed (${resp.status})`));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ============ Report builders ============
function userToday(uid) {
  return localNow(getSetting(uid, 'timezone') || 'Asia/Dhaka').date;
}

function morningReport(uid, today = userToday(uid)) {
  const projects = db.prepare("SELECT name, end_date, progress FROM projects WHERE user_id=? AND status='running' ORDER BY end_date ASC").all(uid);
  const tasks = db.prepare("SELECT title, time, priority FROM tasks WHERE user_id=? AND date=? AND status!='done' ORDER BY time").all(uid, today);
  const lines = ['☀️ <b>Good morning! Your running projects</b>', ''];
  if (projects.length) {
    for (const p of projects) {
      const left = p.end_date ? Math.round((new Date(p.end_date) - new Date(today)) / 86400e3) : null;
      lines.push(`🚀 <b>${escapeHtml(p.name)}</b> — ${p.progress}% done${left !== null ? (left < 0 ? ` ⚠️ ${-left}d overdue` : ` (${left}d left)`) : ''}`);
    }
  } else lines.push('No running projects.');
  lines.push('');
  lines.push(`📝 <b>Tasks for today:</b> ${tasks.length}`);
  for (const t of tasks.slice(0, 10)) lines.push(`• ${escapeHtml(t.title)}${t.time ? ' (' + t.time + ')' : ''}${t.priority === 'high' ? ' 🔴' : ''}`);
  return lines.join('\n');
}

function nightReport(uid, today = userToday(uid)) {
  const doneToday = db.prepare("SELECT COUNT(*) c FROM tasks WHERE user_id=? AND date=? AND status='done'").get(uid, today).c;
  const totalToday = db.prepare('SELECT COUNT(*) c FROM tasks WHERE user_id=? AND date=?').get(uid, today).c;
  const projects = db.prepare("SELECT name, progress, end_date FROM projects WHERE user_id=? AND status='running'").all(uid);
  const spentToday = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date=? AND type='expense'").get(uid, today).t;
  const lines = ['🌙 <b>End-of-day report</b>', ''];
  lines.push(`✅ Tasks: <b>${doneToday}/${totalToday}</b> completed today`);
  lines.push('');
  lines.push('<b>Project progress:</b>');
  if (projects.length) {
    for (const p of projects) {
      const bar = '▰'.repeat(Math.round(p.progress / 10)) + '▱'.repeat(10 - Math.round(p.progress / 10));
      lines.push(`${bar} ${p.progress}% — ${escapeHtml(p.name)}`);
    }
  } else lines.push('No running projects.');
  if (spentToday > 0) { lines.push(''); lines.push(`💸 Spent today: <b>${money(spentToday)}</b>`); }
  lines.push('');
  lines.push('Tip: update each project\'s progress % so tomorrow\'s report stays accurate.');
  return lines.join('\n');
}

function financeReport(uid, monthKey) {
  // monthKey: 'YYYY-MM'
  const label = new Date(monthKey + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const like = monthKey + '%';
  const income = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date LIKE ? AND type='income'").get(uid, like).t;
  const expense = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date LIKE ? AND type='expense'").get(uid, like).t;
  const byCat = db.prepare("SELECT category, SUM(amount) t FROM expenses WHERE user_id=? AND date LIKE ? AND type='expense' GROUP BY category ORDER BY t DESC LIMIT 5").all(uid, like);
  const profit = db.prepare(`SELECT COALESCE(SUM(x.amount),0) t FROM investment_txns x JOIN investments i ON i.id=x.investment_id
    WHERE x.user_id=? AND x.date LIKE ? AND x.type='profit' AND i.type='made'`).get(uid, like).t;
  const payout = db.prepare(`SELECT COALESCE(SUM(x.amount),0) t FROM investment_txns x JOIN investments i ON i.id=x.investment_id
    WHERE x.user_id=? AND x.date LIKE ? AND x.type='payout' AND i.type='received'`).get(uid, like).t;
  const receivable = db.prepare("SELECT COALESCE(SUM(amount-paid),0) t FROM debts WHERE user_id=? AND type='lent' AND status='active'").get(uid).t;
  const payable = db.prepare("SELECT COALESCE(SUM(amount-paid),0) t FROM debts WHERE user_id=? AND type='borrowed' AND status='active'").get(uid).t;
  const investActive = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investments WHERE user_id=? AND type='made' AND status='active'").get(uid).t;
  const capitalTaken = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investments WHERE user_id=? AND type='received' AND status='active'").get(uid).t;
  const balance = income - expense;
  const net = balance + profit - payout;

  const lines = [`📊 <b>Finance Report — ${label}</b>`, ''];
  lines.push(`💰 Income: <b>${money(income)}</b>`);
  lines.push(`💸 Expenses: <b>${money(expense)}</b>`);
  lines.push(`🏦 Balance: <b>${money(balance)}</b>${income ? ` (savings rate ${((balance / income) * 100).toFixed(1)}%)` : ''}`);
  lines.push('');
  lines.push(`📈 Investment profit received: <b>${money(profit)}</b>`);
  lines.push(`📤 Returns paid to investors: <b>${money(payout)}</b>`);
  lines.push(`🟢 <b>Net this month: ${money(net)}</b>`);
  lines.push('');
  if (byCat.length) {
    lines.push('<b>Top spending:</b>');
    for (const c of byCat) lines.push(`• ${escapeHtml(c.category)}: ${money(c.t)}`);
    lines.push('');
  }
  lines.push('<b>Current position:</b>');
  lines.push(`🤝 Others owe you: <b>${money(receivable)}</b>`);
  lines.push(`📉 You owe: <b>${money(payable)}</b>`);
  lines.push(`💼 Active investments: <b>${money(investActive)}</b>`);
  lines.push(`🏛 Investor capital held: <b>${money(capitalTaken)}</b>`);
  return lines.join('\n');
}

// ============ Scheduler ============
function localNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Asia/Dhaka', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, day: get('day'), hour: parseInt(get('hour'), 10) };
  } catch {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), day: String(d.getDate()).padStart(2, '0'), hour: d.getHours() };
  }
}

async function tick() {
  const users = db.prepare(`SELECT DISTINCT user_id FROM settings WHERE key='telegram_bot_token' AND value != ''`).all();
  for (const { user_id: uid } of users) {
    if (!getSetting(uid, 'telegram_chat_id')) continue;
    const now = localNow(getSetting(uid, 'timezone') || 'Asia/Dhaka');
    try {
      if (now.hour >= 10 && getSetting(uid, 'tg_last_morning') !== now.date) {
        setSetting(uid, 'tg_last_morning', now.date);
        await send(uid, morningReport(uid, now.date));
      }
      if (now.hour >= 22 && getSetting(uid, 'tg_last_night') !== now.date) {
        setSetting(uid, 'tg_last_night', now.date);
        await send(uid, nightReport(uid, now.date));
      }
      // Monthly finance report: 1st day of month at/after 10:00, covering previous month
      const thisMonth = now.date.slice(0, 7);
      if (now.day === '01' && now.hour >= 10 && getSetting(uid, 'tg_last_finance') !== thisMonth) {
        setSetting(uid, 'tg_last_finance', thisMonth);
        const prev = new Date(thisMonth + '-01T00:00:00');
        prev.setMonth(prev.getMonth() - 1);
        await send(uid, financeReport(uid, prev.toISOString().slice(0, 7)));
      }
    } catch (e) {
      console.error(`Telegram scheduler (user ${uid}):`, e.message);
    }
  }
}

function startScheduler() {
  setInterval(() => tick().catch(e => console.error('Telegram tick:', e.message)), 60 * 1000);
  console.log('  Telegram scheduler active (morning 10:00, night 22:00, finance on the 1st — user timezone)');
}

// ============ Routes ============
const router = express.Router();

router.post('/telegram/test', async (req, res) => {
  try {
    await send(req.userId, '✅ <b>Personal OS connected!</b>\nYou will receive:\n• ☀️ 10:00 — running projects\n• 🌙 22:00 — daily progress report\n• 📊 1st of each month — finance report\n• 🤖 AI task reports (if enabled)');
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.post('/telegram/report/:type', async (req, res) => {
  try {
    const uid = req.userId;
    let text;
    if (req.params.type === 'morning') text = morningReport(uid);
    else if (req.params.type === 'night') text = nightReport(uid);
    else if (req.params.type === 'finance') text = financeReport(uid, (req.body?.month || userToday(uid).slice(0, 7)));
    else return res.status(400).json({ error: 'Unknown report type' });
    await send(uid, text);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.post('/telegram/forward', async (req, res) => {
  const { text, title } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Nothing to send' });
  try {
    await send(req.userId, `🤖 <b>${escapeHtml(title || 'AI Report')}</b>\n\n${escapeHtml(text)}`);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = { router, send, escapeHtml, startScheduler, financeReport };
