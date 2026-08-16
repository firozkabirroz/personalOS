const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, getSetting, setSetting, DATA_DIR } = require('./db');
const { ownerId } = require('./platform');
const { PROVIDERS, inferProvider, keyForProvider, chatCompletionsUrl, formatProviderError, sanitizeKey } = require('./ai-providers');

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
async function buildContext(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const lines = [];

  const tasks = await db.prepare("SELECT title, date, time, priority, status FROM tasks WHERE user_id=? AND (status != 'done' OR date >= ?) ORDER BY date LIMIT 40").all(uid, today);
  if (tasks.length) {
    lines.push('## Tasks');
    for (const t of tasks) lines.push(`- [${t.status}] ${t.title} (date: ${t.date}${t.time ? ' ' + t.time : ''}, priority: ${t.priority})`);
  }

  const projects = await db.prepare('SELECT id, name, description, status, start_date, end_date, progress FROM projects WHERE user_id=? LIMIT 30').all(uid);
  if (projects.length) {
    lines.push('## Projects');
    for (const p of projects) {
      lines.push(`- ${p.name} [${p.status}] ${p.start_date || '?'} → ${p.end_date || '?'} (${p.progress}% done)${p.description ? ': ' + p.description.slice(0, 150) : ''}`);
      const items = await db.prepare('SELECT content, done FROM project_items WHERE project_id=? ORDER BY done ASC, position ASC LIMIT 12').all(p.id);
      for (const it of items) lines.push(`    ${it.done ? '[x]' : '[ ]'} ${it.content}`);
    }
  }

  const plans = await db.prepare('SELECT title, details, estimate_date, status FROM plans WHERE user_id=? LIMIT 20').all(uid);
  if (plans.length) {
    lines.push('## Future plans');
    for (const p of plans) lines.push(`- ${p.title} [${p.status}] est. ${p.estimate_date || 'TBD'}${p.details ? ': ' + p.details.slice(0, 150) : ''}`);
  }

  const ideas = await db.prepare('SELECT title, content, tags FROM ideas WHERE user_id=? ORDER BY pinned DESC, updated_at DESC LIMIT 20').all(uid);
  if (ideas.length) {
    lines.push('## Brainstorming notes');
    for (const i of ideas) lines.push(`- ${i.title}${i.tags ? ' [' + i.tags + ']' : ''}: ${(i.content || '').slice(0, 200)}`);
  }

  const expTotal = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date >= ? AND type='expense'").get(uid, monthStart)).t;
  const incTotal = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date >= ? AND type='income'").get(uid, monthStart)).t;
  const expByCat = await db.prepare("SELECT category, SUM(amount) t FROM expenses WHERE user_id=? AND date >= ? AND type='expense' GROUP BY category ORDER BY t DESC").all(uid, monthStart);
  const recentExp = await db.prepare('SELECT title, amount, category, date, type FROM expenses WHERE user_id=? ORDER BY date DESC LIMIT 25').all(uid);
  if (recentExp.length) {
    lines.push(`## Money (this month: income ${Number(incTotal).toFixed(2)}, expenses ${Number(expTotal).toFixed(2)}, balance ${(Number(incTotal) - Number(expTotal)).toFixed(2)})`);
    lines.push('Spending by category this month: ' + (expByCat.map(c => `${c.category}: ${Number(c.t).toFixed(2)}`).join(', ') || 'none'));
    for (const e of recentExp) lines.push(`- ${e.date} [${e.type}] ${e.title}: ${e.amount} (${e.category})`);
  }

  const debts = await db.prepare("SELECT person, type, amount, paid, due_date, status FROM debts WHERE user_id=? AND status='active' LIMIT 20").all(uid);
  if (debts.length) {
    lines.push('## Debts & loans (active)');
    for (const d of debts) {
      lines.push(`- ${d.type === 'borrowed' ? 'I owe' : 'Owes me'} ${d.person}: ${(d.amount - d.paid).toFixed(2)} remaining (of ${d.amount})${d.due_date ? ', due ' + d.due_date : ''}`);
    }
  }

  const invs = await db.prepare('SELECT id, name, type, partner, amount, expected_return, status FROM investments WHERE user_id=? LIMIT 20').all(uid);
  if (invs.length) {
    lines.push('## Investments ("made" = my investment, "received" = investor capital I must pay returns on)');
    for (const i of invs) {
      const profit = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investment_txns WHERE investment_id=? AND type='profit'").get(i.id)).t;
      const payout = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investment_txns WHERE investment_id=? AND type='payout'").get(i.id)).t;
      lines.push(`- [${i.type}] ${i.name}${i.partner ? ' (with ' + i.partner + ')' : ''}: capital ${i.amount}, ${i.type === 'made' ? 'profit received ' + Number(profit).toFixed(2) : 'returns paid ' + Number(payout).toFixed(2)}${i.expected_return ? ', expected: ' + i.expected_return : ''} [${i.status}]`);
    }
  }

  const habits = await db.prepare(`SELECT h.name, h.id,
      (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id=h.id AND l.date >= date('now','-30 days')) AS last30
      FROM habits h WHERE h.user_id=? AND h.archived=0`).all(uid);
  if (habits.length) {
    lines.push('## Habits (completions in last 30 days)');
    for (const h of habits) lines.push(`- ${h.name}: ${h.last30}/30 days`);
  }

  const health = await db.prepare('SELECT date, weight, sleep_hours, water_glasses, steps, mood FROM health WHERE user_id=? ORDER BY date DESC LIMIT 14').all(uid);
  if (health.length) {
    lines.push('## Health log (latest first; mood is 1-5)');
    for (const h of health) lines.push(`- ${h.date}: weight=${h.weight ?? '-'}, sleep=${h.sleep_hours ?? '-'}h, water=${h.water_glasses ?? '-'}, steps=${h.steps ?? '-'}, mood=${h.mood ?? '-'}`);
  }

  const trips = await db.prepare('SELECT destination, start_date, end_date, budget, status, notes FROM trips WHERE user_id=? LIMIT 10').all(uid);
  if (trips.length) {
    lines.push('## Trips');
    for (const t of trips) lines.push(`- ${t.destination} [${t.status}] ${t.start_date || '?'} → ${t.end_date || '?'}, budget ${t.budget}`);
  }

  const events = await db.prepare('SELECT title, date, start_time FROM events WHERE user_id=? AND date >= ? ORDER BY date LIMIT 15').all(uid, today);
  if (events.length) {
    lines.push('## Upcoming calendar events');
    for (const e of events) lines.push(`- ${e.date}${e.start_time ? ' ' + e.start_time : ''}: ${e.title}`);
  }

  return lines.join('\n');
}

function normalizeKey(k) {
  return sanitizeKey(k);
}

function isLocalAiUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(url || ''));
}

async function loadPlatformAI(oid) {
  if (!oid) {
    return { openai: '', anthropic: '', groq: '', gemini: '', openrouter: '', cerebras: '', custom: '', customUrl: '' };
  }
  const fields = {
    openai: 'admin_openai_key',
    anthropic: 'admin_anthropic_key',
    groq: 'admin_groq_key',
    gemini: 'admin_gemini_key',
    openrouter: 'admin_openrouter_key',
    cerebras: 'admin_cerebras_key',
    custom: 'admin_custom_key',
  };
  const out = { customUrl: String(await getSetting(oid, 'admin_custom_base_url') || '').trim() };
  await Promise.all(Object.entries(fields).map(async ([name, field]) => {
    out[name] = normalizeKey(await getSetting(oid, field));
  }));
  const groq = keyForProvider('groq', out);
  if (groq && groq !== out.groq) {
    out.groq = groq;
    try { await setSetting(oid, 'admin_groq_key', groq); } catch { /* ignore */ }
  }
  return out;
}

function credsFor(model, keys) {
  if (!model) return { provider: 'custom', apiKey: '', baseUrl: '' };
  const provider = inferProvider(model.model_id, model.provider);
  const spec = PROVIDERS[provider] || PROVIDERS.custom;
  if (provider === 'anthropic') return { provider, apiKey: keyForProvider('anthropic', keys), baseUrl: '' };
  if (provider === 'openai') return { provider, apiKey: keyForProvider('openai', keys), baseUrl: spec.baseUrl };
  if (provider === 'custom') return { provider, apiKey: keys.custom, baseUrl: keys.customUrl };
  return { provider, apiKey: keyForProvider(provider, keys), baseUrl: spec.baseUrl };
}

function modelReady(model, keys) {
  const { provider, apiKey, baseUrl } = credsFor(model, keys);
  if (provider === 'custom') return !!(baseUrl && (apiKey || isLocalAiUrl(baseUrl)));
  if (provider === 'anthropic' || provider === 'openai') return !!apiKey;
  return !!(apiKey && baseUrl);
}

async function listActiveModels() {
  const rows = await db.prepare(`SELECT id, name, provider, model_id, position FROM ai_models
    WHERE active=1 ORDER BY CASE provider
      WHEN 'groq' THEN 0 WHEN 'gemini' THEN 1 WHEN 'openrouter' THEN 2 WHEN 'cerebras' THEN 3
      WHEN 'custom' THEN 4 ELSE 5 END, position ASC, id ASC`).all();
  const keys = await loadPlatformAI(await ownerId());
  const ready = rows.filter((m) => modelReady(m, keys));
  return ready;
}

async function resolveModel(modelDbId, keys) {
  if (modelDbId) {
    const m = await db.prepare('SELECT * FROM ai_models WHERE id=? AND active=1').get(modelDbId);
    if (m && modelReady(m, keys)) return m;
  }
  const rows = await db.prepare(`SELECT * FROM ai_models WHERE active=1
    ORDER BY CASE provider
      WHEN 'groq' THEN 0 WHEN 'gemini' THEN 1 WHEN 'openrouter' THEN 2 WHEN 'cerebras' THEN 3
      WHEN 'custom' THEN 4 ELSE 5 END, position ASC, id ASC`).all();
  return rows.find((m) => modelReady(m, keys)) || null;
}

/** Resolve platform key + model for a chat — everything is free for everyone. */
async function resolveAIRoute(modelDbId) {
  const oid = await ownerId();
  const keys = await loadPlatformAI(oid);
  const model = await resolveModel(modelDbId, keys);
  if (!model) return { error: 'No AI model is available. Ask the admin to add one in Admin → AI Models.' };

  const creds = credsFor(model, keys);
  if (!modelReady(model, keys)) {
    const fallback = (await db.prepare('SELECT * FROM ai_models WHERE active=1').all())
      .find((m) => modelReady(m, keys));
    if (fallback) {
      const fb = credsFor(fallback, keys);
      return { provider: fb.provider, apiKey: fb.apiKey, model: fallback.model_id, baseUrl: fb.baseUrl, modelRow: fallback };
    }
    return { error: `${creds.provider} API key missing. Admin → AI Models-এ ${PROVIDERS[creds.provider]?.label || creds.provider} key সেভ করুন।` };
  }

  return {
    provider: creds.provider,
    apiKey: creds.apiKey || (isLocalAiUrl(creds.baseUrl) ? 'not-needed' : ''),
    model: model.model_id,
    baseUrl: creds.baseUrl,
    modelRow: model,
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
  const url = chatCompletionsUrl(baseUrl);
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
  let data = {};
  try { data = await resp.json(); } catch {}
  if (!resp.ok) {
    const raw = data?.error?.message || data?.error || `API error (${resp.status})`;
    let host = url;
    try { host = new URL(url).hostname; } catch {}
    throw new Error(formatProviderError(resp.status, raw, { host, model, apiKey }));
  }
  return data.choices?.[0]?.message?.content || '';
}

router.get('/ai/models', async (req, res) => {
  res.json({ models: await listActiveModels() });
});

// ============ Conversations (chat topics) ============
router.get('/ai/conversations', async (req, res) => {
  const rows = await db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM chats WHERE conversation_id = c.id) AS message_count,
      (SELECT content FROM chats WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC`).all(req.userId);
  res.json(rows);
});

router.post('/ai/conversations', async (req, res) => {
  const title = (req.body?.title || '').trim() || 'New chat';
  const info = await db.prepare('INSERT INTO conversations (user_id, title) VALUES (?,?)').run(req.userId, title.slice(0, 80));
  res.json(await db.prepare('SELECT * FROM conversations WHERE id=?').get(info.lastInsertRowid));
});

router.put('/ai/conversations/:id', async (req, res) => {
  const title = (req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const info = await db.prepare('UPDATE conversations SET title=? WHERE id=? AND user_id=?').run(title.slice(0, 80), req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Conversation not found' });
  res.json(await db.prepare('SELECT * FROM conversations WHERE id=?').get(req.params.id));
});

router.delete('/ai/conversations/:id', async (req, res) => {
  const conv = await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  await db.prepare('DELETE FROM chats WHERE conversation_id=? AND user_id=?').run(conv.id, req.userId);
  await db.prepare('DELETE FROM conversations WHERE id=?').run(conv.id);
  res.json({ ok: true });
});

router.get('/ai/history', async (req, res) => {
  const convId = Number(req.query.conversation_id) || 0;
  if (convId) {
    const conv = await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').get(convId, req.userId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    return res.json(await db.prepare('SELECT id, role, content, created_at, model_id, attachments, conversation_id FROM chats WHERE user_id=? AND conversation_id=? ORDER BY id ASC LIMIT 200').all(req.userId, convId));
  }
  res.json(await db.prepare('SELECT id, role, content, created_at, model_id, attachments, conversation_id FROM chats WHERE user_id=? ORDER BY id ASC LIMIT 200').all(req.userId));
});

router.delete('/ai/history', async (req, res) => {
  await db.prepare('DELETE FROM chats WHERE user_id=?').run(req.userId);
  await db.prepare('DELETE FROM conversations WHERE user_id=?').run(req.userId);
  res.json({ ok: true });
});

router.get('/ai/usage', async (req, res) => {
  res.json({ unlimited: true, models: await listActiveModels() });
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

  const user = await db.prepare('SELECT id, name, username, role FROM users WHERE id=?').get(uid);
  const route = await resolveAIRoute(modelDbId);
  if (route.error) return res.status(400).json({ error: route.error });

  // Resolve the conversation this message belongs to — create one if needed
  let conv = null;
  const reqConvId = Number(req.body?.conversation_id) || 0;
  if (reqConvId) conv = await db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(reqConvId, uid);
  if (!conv) {
    const autoTitle = (message || 'New chat').slice(0, 60);
    const info = await db.prepare('INSERT INTO conversations (user_id, title) VALUES (?,?)').run(uid, autoTitle);
    conv = await db.prepare('SELECT * FROM conversations WHERE id=?').get(info.lastInsertRowid);
  } else if (conv.title === 'New chat' && message) {
    await db.prepare('UPDATE conversations SET title=? WHERE id=?').run(message.slice(0, 60), conv.id);
    conv.title = message.slice(0, 60);
  }

  const { provider, apiKey, model, baseUrl, modelRow } = route;
  const files = req.files || [];
  const parts = files.map(fileToContentPart);
  const userContent = buildUserContent(message || '(see attached files)', parts);
  const attachmentMeta = JSON.stringify(files.map(f => ({ name: f.originalname, mime: f.mimetype, size: f.size, stored: f.filename })));

  const context = await buildContext(uid);
  const system = `You are the personal AI assistant inside "${user?.name || user?.username}"'s Personal OS dashboard.
Today's date is ${new Date().toISOString().slice(0, 10)}.
You have read access to their live data below. Use it to give specific, practical, personalised answers — reference their actual tasks, projects, expenses, habits, health and trips by name when relevant. Be concise and actionable. If data is missing for a question, say so and suggest what to track.

=== USER DATA SNAPSHOT ===
${context || '(No data yet — the user has not added anything.)'}
=== END DATA ===`;

  const history = (await db.prepare('SELECT role, content FROM chats WHERE user_id=? AND conversation_id=? ORDER BY id DESC LIMIT 20').all(uid, conv.id)).reverse();
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: typeof userContent === 'string' ? userContent : userContent.text },
  ];

  try {
    let reply;
    const contentArg = parts.length ? userContent : null;
    if (provider === 'anthropic') reply = await callAnthropic({ apiKey, model, system, messages, userContent: contentArg });
    else reply = await callOpenAI({ apiKey, model, baseUrl, system, messages, userContent: contentArg });

    const displayMsg = message || '(attachment)';
    await db.prepare('INSERT INTO chats (user_id, role, content, model_id, attachments, conversation_id) VALUES (?,?,?,?,?,?)')
      .run(uid, 'user', displayMsg, modelRow.id, attachmentMeta, conv.id);
    await db.prepare('INSERT INTO chats (user_id, role, content, model_id, attachments, conversation_id) VALUES (?,?,?,?,?,?)')
      .run(uid, 'assistant', reply, modelRow.id, '', conv.id);
    await db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id=?").run(conv.id);

    if (await getSetting(uid, 'telegram_ai_reports') === 'on') {
      const { send, escapeHtml } = require('./telegram');
      send(uid, `🤖 <b>AI Task Report</b>\n\n📝 <i>${escapeHtml(displayMsg.slice(0, 300))}</i>\n\n${escapeHtml(reply)}`)
        .catch(e => console.error('Telegram AI forward:', e.message));
    }

    res.json({ reply, model: { id: modelRow.id, name: modelRow.name }, conversation: { id: conv.id, title: conv.title } });
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
module.exports.listActiveModels = listActiveModels;
