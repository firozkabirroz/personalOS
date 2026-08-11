const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, getSetting, getCredits, adjustCredits, DATA_DIR, logActivity } = require('./db');

const router = express.Router();

const CHAT_UPLOAD_DIR = path.join(DATA_DIR, 'chat-uploads');
if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: CHAT_UPLOAD_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(png|jpeg|jpg|gif|webp)|application\/pdf|text\/plain)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only images, PDF, or plain text files are allowed'), ok);
  },
});

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

function ownerId() {
  return db.prepare("SELECT id FROM users WHERE role='owner' LIMIT 1").get()?.id || null;
}

function listActiveModels() {
  return db.prepare('SELECT id, name, provider, model_id, is_free, credit_cost, position FROM ai_models WHERE active=1 ORDER BY position ASC, id ASC').all()
    .map(m => ({ ...m, is_free: !!m.is_free, credit_cost: m.is_free ? 0 : Math.max(1, Number(m.credit_cost) || 1) }));
}

function resolveModel(modelDbId) {
  if (modelDbId) {
    const m = db.prepare('SELECT * FROM ai_models WHERE id=? AND active=1').get(modelDbId);
    if (m) return m;
  }
  return db.prepare('SELECT * FROM ai_models WHERE active=1 AND is_free=1 ORDER BY position ASC LIMIT 1').get()
    || db.prepare('SELECT * FROM ai_models WHERE active=1 ORDER BY position ASC LIMIT 1').get();
}

/** Resolve platform key + model for a chat. Debits credits for paid models (customers only). */
function resolveAIRoute(uid, role, modelDbId) {
  const oid = ownerId();
  const model = resolveModel(modelDbId);
  if (!model) return { error: 'No AI model is available. Ask the admin to add one in Admin → AI Models.' };

  const isFree = !!model.is_free;
  const creditCost = isFree ? 0 : Math.max(1, Number(model.credit_cost) || 1);
  const apiKey = oid ? getSetting(oid, `admin_${model.provider}_key`) : '';
  const baseUrl = model.provider === 'custom' && oid ? getSetting(oid, 'admin_custom_base_url') : '';

  if (!apiKey) {
    return { error: `AI service সাময়িকভাবে বন্ধ আছে — admin কে "${model.provider}" key যোগ করতে বলুন।` };
  }

  // Staff: unlimited, no credit debit
  if (role !== 'user') {
    return {
      provider: model.provider, apiKey, model: model.model_id, baseUrl,
      modelRow: model, viaPlatform: false, creditCost: 0, isFree: true,
    };
  }

  if (!isFree) {
    const balance = getCredits(uid);
    if (balance < creditCost) {
      return {
        error: `এই মডেল (${model.name}) ব্যবহার করতে ${creditCost} ক্রেডিট লাগে — আপনার ব্যালেন্স ${balance}। Credits পেজ থেকে কিনুন, অথবা একটি Free মডেল বেছে নিন।`,
        needsCredits: true,
        creditCost,
        balance,
      };
    }
  }

  return {
    provider: model.provider, apiKey, model: model.model_id, baseUrl,
    modelRow: model, viaPlatform: true, creditCost, isFree,
  };
}

function fileToContentPart(file) {
  const buf = fs.readFileSync(file.path);
  const b64 = buf.toString('base64');
  if (file.mimetype.startsWith('image/')) {
    return { type: 'image', mediaType: file.mimetype, data: b64, name: file.originalname };
  }
  if (file.mimetype === 'text/plain') {
    return { type: 'text_file', text: buf.toString('utf8').slice(0, 40000), name: file.originalname };
  }
  // PDF / other — describe + note (most providers need dedicated PDF APIs; include as context note)
  return { type: 'file_note', name: file.originalname, mime: file.mimetype, size: file.size, data: b64, mediaType: file.mimetype };
}

function buildUserContent(message, parts) {
  if (!parts.length) return message;
  // Anthropic / OpenAI multimodal: array content for images; text files inlined
  const blocks = [];
  const notes = [];
  for (const p of parts) {
    if (p.type === 'image') {
      blocks.push({ kind: 'image', mediaType: p.mediaType, data: p.data });
    } else if (p.type === 'text_file') {
      notes.push(`[Attached file: ${p.name}]\n${p.text}`);
    } else {
      notes.push(`[Attached file: ${p.name} (${p.mime}, ${p.size} bytes) — binary content provided below as base64 for models that support it]`);
      if (p.mediaType === 'application/pdf') {
        blocks.push({ kind: 'document', mediaType: p.mediaType, data: p.data });
      }
    }
  }
  const text = [message, ...notes].filter(Boolean).join('\n\n');
  return { text, blocks };
}

async function callAnthropic({ apiKey, model, system, messages, userContent }) {
  const formatted = messages.map(m => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    return m;
  });
  // Replace last user message with multimodal content if needed
  if (userContent && typeof userContent === 'object') {
    const content = [];
    if (userContent.text) content.push({ type: 'text', text: userContent.text });
    for (const b of userContent.blocks || []) {
      if (b.kind === 'image') {
        content.push({ type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.data } });
      } else if (b.kind === 'document') {
        content.push({ type: 'document', source: { type: 'base64', media_type: b.mediaType, data: b.data } });
      }
    }
    formatted[formatted.length - 1] = { role: 'user', content };
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 2048, system, messages: formatted }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Anthropic API error (${resp.status})`);
  return (data.content || []).map(b => b.text || '').join('');
}

async function callOpenAI({ apiKey, model, baseUrl, system, messages, userContent }) {
  const url = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '') + '/v1/chat/completions';
  const formatted = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content }));
  if (userContent && typeof userContent === 'object') {
    const content = [{ type: 'text', text: userContent.text || '' }];
    for (const b of userContent.blocks || []) {
      if (b.kind === 'image') {
        content.push({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } });
      }
    }
    formatted[formatted.length - 1] = { role: 'user', content };
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, ...formatted] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `API error (${resp.status})`);
  return data.choices?.[0]?.message?.content || '';
}

router.get('/ai/models', (req, res) => {
  const models = listActiveModels();
  const credits = getCredits(req.userId);
  const user = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  res.json({ models, credits, unlimited: user?.role !== 'user' });
});

router.get('/ai/history', (req, res) => {
  res.json(db.prepare('SELECT id, role, content, created_at, model_id, attachments FROM chats WHERE user_id=? ORDER BY id ASC LIMIT 200').all(req.userId));
});

router.delete('/ai/history', (req, res) => {
  db.prepare('DELETE FROM chats WHERE user_id=?').run(req.userId);
  res.json({ ok: true });
});

router.get('/ai/usage', (req, res) => {
  const user = db.prepare('SELECT role, credits FROM users WHERE id=?').get(req.userId);
  const models = listActiveModels();
  if (user.role !== 'user') {
    return res.json({ unlimited: true, credits: user.credits || 0, models });
  }
  res.json({
    unlimited: false,
    credits: user.credits || 0,
    models,
    freeModels: models.filter(m => m.is_free).length,
  });
});

router.post('/ai/chat', (req, res, next) => {
  chatUpload.array('files', 4)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const uid = req.userId;
  const message = (req.body?.message || '').trim();
  const modelDbId = req.body?.model_id ? Number(req.body.model_id) : null;
  if (!message && !(req.files || []).length) return res.status(400).json({ error: 'Message is empty' });

  const user = db.prepare('SELECT id, name, username, role FROM users WHERE id=?').get(uid);
  const route = resolveAIRoute(uid, user.role, modelDbId);
  if (route.error) {
    return res.status(route.needsCredits ? 402 : 400).json({
      error: route.error,
      needsCredits: !!route.needsCredits,
      creditCost: route.creditCost,
      balance: route.balance,
    });
  }

  const { provider, apiKey, model, baseUrl, modelRow, viaPlatform, creditCost, isFree } = route;
  const files = req.files || [];
  const parts = files.map(fileToContentPart);
  const userContent = buildUserContent(message || '(see attached files)', parts);
  const attachmentMeta = JSON.stringify(files.map(f => ({ name: f.originalname, mime: f.mimetype, size: f.size, stored: f.filename })));

  const context = buildContext(uid);
  const system = `You are the personal AI assistant inside "${user?.name || user?.username}"'s Personal OS dashboard.
Today's date is ${new Date().toISOString().slice(0, 10)}.
You have read access to their live data below. Use it to give specific, practical, personalised answers — reference their actual tasks, projects, expenses, habits, health and trips by name when relevant. Be concise and actionable. If data is missing for a question, say so and suggest what to track.

=== USER DATA SNAPSHOT ===
${context || '(No data yet — the user has not added anything.)'}
=== END DATA ===`;

  const history = db.prepare('SELECT role, content FROM chats WHERE user_id=? ORDER BY id DESC LIMIT 20').all(uid).reverse();
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: typeof userContent === 'string' ? userContent : userContent.text },
  ];

  try {
    let reply;
    const contentArg = parts.length ? userContent : null;
    if (provider === 'anthropic') reply = await callAnthropic({ apiKey, model, system, messages, userContent: contentArg });
    else reply = await callOpenAI({ apiKey, model, baseUrl: provider === 'custom' ? baseUrl : '', system, messages, userContent: contentArg });

    let newBalance = getCredits(uid);
    if (viaPlatform && !isFree && creditCost > 0) {
      newBalance = adjustCredits(uid, -creditCost, {
        reason: `AI chat · ${modelRow.name}`,
        refType: 'ai_chat',
      });
      logActivity({ userId: uid, type: 'ai_chat', message: `${user.username} used ${modelRow.name} (−${creditCost} credits)` });
    }

    const displayMsg = message || '(attachment)';
    db.prepare('INSERT INTO chats (user_id, role, content, model_id, attachments) VALUES (?,?,?,?,?)')
      .run(uid, 'user', displayMsg, modelRow.id, attachmentMeta);
    db.prepare('INSERT INTO chats (user_id, role, content, model_id, attachments) VALUES (?,?,?,?,?)')
      .run(uid, 'assistant', reply, modelRow.id, '');

    if (getSetting(uid, 'telegram_ai_reports') === 'on') {
      const { send, escapeHtml } = require('./telegram');
      send(uid, `🤖 <b>AI Task Report</b>\n\n📝 <i>${escapeHtml(displayMsg.slice(0, 300))}</i>\n\n${escapeHtml(reply)}`)
        .catch(e => console.error('Telegram AI forward:', e.message));
    }

    res.json({
      reply,
      model: { id: modelRow.id, name: modelRow.name, is_free: isFree, credit_cost: creditCost },
      credits: newBalance,
      charged: isFree ? 0 : creditCost,
    });
  } catch (e) {
    // clean up uploaded files on failure
    for (const f of files) {
      try { fs.unlinkSync(f.path); } catch {}
    }
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
module.exports.router = router;
module.exports.getCredits = getCredits;
module.exports.listActiveModels = listActiveModels;
