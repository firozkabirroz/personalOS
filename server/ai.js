const express = require('express');
const { db, getSetting } = require('./db');

const router = express.Router();

// Build a compact snapshot of the user's data for the AI's system prompt
function buildContext(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const lines = [];

  const tasks = db.prepare("SELECT title, date, time, priority, status FROM tasks WHERE user_id=? AND (status != 'done' OR date >= ?) ORDER BY date LIMIT 40").all(uid, today);
  if (tasks.length) {
    lines.push('## Tasks');
    for (const t of tasks) lines.push(`- [${t.status}] ${t.title} (date: ${t.date}${t.time ? ' ' + t.time : ''}, priority: ${t.priority})`);
  }

  const projects = db.prepare('SELECT id, name, description, status, start_date, end_date, progress FROM projects WHERE user_id=? LIMIT 30').all(uid);
  if (projects.length) {
    lines.push('## Projects');
    for (const p of projects) {
      lines.push(`- ${p.name} [${p.status}] ${p.start_date || '?'} → ${p.end_date || '?'} (${p.progress}% done)${p.description ? ': ' + p.description.slice(0, 150) : ''}`);
      const items = db.prepare('SELECT content, done FROM project_items WHERE project_id=? ORDER BY done ASC, position ASC LIMIT 12').all(p.id);
      for (const it of items) lines.push(`    ${it.done ? '[x]' : '[ ]'} ${it.content}`);
    }
  }

  const plans = db.prepare('SELECT title, details, estimate_date, status FROM plans WHERE user_id=? LIMIT 20').all(uid);
  if (plans.length) {
    lines.push('## Future plans');
    for (const p of plans) lines.push(`- ${p.title} [${p.status}] est. ${p.estimate_date || 'TBD'}${p.details ? ': ' + p.details.slice(0, 150) : ''}`);
  }

  const ideas = db.prepare('SELECT title, content, tags FROM ideas WHERE user_id=? ORDER BY pinned DESC, updated_at DESC LIMIT 20').all(uid);
  if (ideas.length) {
    lines.push('## Brainstorming notes');
    for (const i of ideas) lines.push(`- ${i.title}${i.tags ? ' [' + i.tags + ']' : ''}: ${(i.content || '').slice(0, 200)}`);
  }

  const expTotal = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date >= ? AND type='expense'").get(uid, monthStart).t;
  const incTotal = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date >= ? AND type='income'").get(uid, monthStart).t;
  const expByCat = db.prepare("SELECT category, SUM(amount) t FROM expenses WHERE user_id=? AND date >= ? AND type='expense' GROUP BY category ORDER BY t DESC").all(uid, monthStart);
  const recentExp = db.prepare('SELECT title, amount, category, date, type FROM expenses WHERE user_id=? ORDER BY date DESC LIMIT 25').all(uid);
  if (recentExp.length) {
    lines.push(`## Money (this month: income ${incTotal.toFixed(2)}, expenses ${expTotal.toFixed(2)}, balance ${(incTotal - expTotal).toFixed(2)})`);
    lines.push('Spending by category this month: ' + (expByCat.map(c => `${c.category}: ${c.t.toFixed(2)}`).join(', ') || 'none'));
    for (const e of recentExp) lines.push(`- ${e.date} [${e.type}] ${e.title}: ${e.amount} (${e.category})`);
  }

  const debts = db.prepare("SELECT person, type, amount, paid, due_date, status FROM debts WHERE user_id=? AND status='active' LIMIT 20").all(uid);
  if (debts.length) {
    lines.push('## Debts & loans (active)');
    for (const d of debts) {
      lines.push(`- ${d.type === 'borrowed' ? 'I owe' : 'Owes me'} ${d.person}: ${(d.amount - d.paid).toFixed(2)} remaining (of ${d.amount})${d.due_date ? ', due ' + d.due_date : ''}`);
    }
  }

  const invs = db.prepare('SELECT id, name, type, partner, amount, expected_return, status FROM investments WHERE user_id=? LIMIT 20').all(uid);
  if (invs.length) {
    lines.push('## Investments ("made" = my investment, "received" = investor capital I must pay returns on)');
    for (const i of invs) {
      const profit = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investment_txns WHERE investment_id=? AND type='profit'").get(i.id).t;
      const payout = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investment_txns WHERE investment_id=? AND type='payout'").get(i.id).t;
      lines.push(`- [${i.type}] ${i.name}${i.partner ? ' (with ' + i.partner + ')' : ''}: capital ${i.amount}, ${i.type === 'made' ? 'profit received ' + profit.toFixed(2) : 'returns paid ' + payout.toFixed(2)}${i.expected_return ? ', expected: ' + i.expected_return : ''} [${i.status}]`);
    }
  }

  const habits = db.prepare(`SELECT h.name, h.id,
      (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id=h.id AND l.date >= date('now','-30 days')) AS last30
      FROM habits h WHERE h.user_id=? AND h.archived=0`).all(uid);
  if (habits.length) {
    lines.push('## Habits (completions in last 30 days)');
    for (const h of habits) lines.push(`- ${h.name}: ${h.last30}/30 days`);
  }

  const health = db.prepare('SELECT date, weight, sleep_hours, water_glasses, steps, mood FROM health WHERE user_id=? ORDER BY date DESC LIMIT 14').all(uid);
  if (health.length) {
    lines.push('## Health log (latest first; mood is 1-5)');
    for (const h of health) lines.push(`- ${h.date}: weight=${h.weight ?? '-'}, sleep=${h.sleep_hours ?? '-'}h, water=${h.water_glasses ?? '-'}, steps=${h.steps ?? '-'}, mood=${h.mood ?? '-'}`);
  }

  const trips = db.prepare('SELECT destination, start_date, end_date, budget, status, notes FROM trips WHERE user_id=? LIMIT 10').all(uid);
  if (trips.length) {
    lines.push('## Trips');
    for (const t of trips) lines.push(`- ${t.destination} [${t.status}] ${t.start_date || '?'} → ${t.end_date || '?'}, budget ${t.budget}`);
  }

  const events = db.prepare('SELECT title, date, start_time FROM events WHERE user_id=? AND date >= ? ORDER BY date LIMIT 15').all(uid, today);
  if (events.length) {
    lines.push('## Upcoming calendar events');
    for (const e of events) lines.push(`- ${e.date}${e.start_time ? ' ' + e.start_time : ''}: ${e.title}`);
  }

  return lines.join('\n');
}

async function callAnthropic({ apiKey, model, system, messages }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 2048, system, messages }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Anthropic API error (${resp.status})`);
  return (data.content || []).map(b => b.text || '').join('');
}

async function callOpenAI({ apiKey, model, baseUrl, system, messages }) {
  const url = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '') + '/v1/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `API error (${resp.status})`);
  return data.choices?.[0]?.message?.content || '';
}

router.get('/ai/history', (req, res) => {
  res.json(db.prepare('SELECT id, role, content, created_at FROM chats WHERE user_id=? ORDER BY id ASC LIMIT 200').all(req.userId));
});

router.delete('/ai/history', (req, res) => {
  db.prepare('DELETE FROM chats WHERE user_id=?').run(req.userId);
  res.json({ ok: true });
});

router.post('/ai/chat', async (req, res) => {
  const uid = req.userId;
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty' });

  const provider = getSetting(uid, 'ai_provider') || 'anthropic';
  const apiKey = getSetting(uid, 'ai_api_key');
  const model = getSetting(uid, 'ai_model');
  const baseUrl = getSetting(uid, 'ai_base_url');
  if (!apiKey) return res.status(400).json({ error: 'No AI API key configured. Go to Settings → AI Assistant and add your API key.' });

  const user = db.prepare('SELECT name, username FROM users WHERE id=?').get(uid);
  const context = buildContext(uid);
  const system = `You are the personal AI assistant inside "${user?.name || user?.username}"'s Personal OS dashboard.
Today's date is ${new Date().toISOString().slice(0, 10)}.
You have read access to their live data below. Use it to give specific, practical, personalised answers — reference their actual tasks, projects, expenses, habits, health and trips by name when relevant. Be concise and actionable. If data is missing for a question, say so and suggest what to track.

=== USER DATA SNAPSHOT ===
${context || '(No data yet — the user has not added anything.)'}
=== END DATA ===`;

  // last 10 exchanges as conversation history
  const history = db.prepare('SELECT role, content FROM chats WHERE user_id=? ORDER BY id DESC LIMIT 20').all(uid).reverse();
  const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }];

  try {
    let reply;
    if (provider === 'anthropic') reply = await callAnthropic({ apiKey, model, system, messages });
    else reply = await callOpenAI({ apiKey, model, baseUrl: provider === 'custom' ? baseUrl : '', system, messages });

    db.prepare('INSERT INTO chats (user_id, role, content) VALUES (?,?,?)').run(uid, 'user', message);
    db.prepare('INSERT INTO chats (user_id, role, content) VALUES (?,?,?)').run(uid, 'assistant', reply);

    // Auto-forward AI task reports to Telegram when enabled in Settings
    if (getSetting(uid, 'telegram_ai_reports') === 'on') {
      const { send, escapeHtml } = require('./telegram');
      send(uid, `🤖 <b>AI Task Report</b>\n\n📝 <i>${escapeHtml(message.slice(0, 300))}</i>\n\n${escapeHtml(reply)}`)
        .catch(e => console.error('Telegram AI forward:', e.message));
    }

    res.json({ reply });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
