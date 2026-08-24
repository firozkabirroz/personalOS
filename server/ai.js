const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, getSetting, DATA_DIR } = require('./db');
const { ownerId } = require('./platform');
const { PROVIDERS, credsFor, modelReady, chatCompletionsUrl, formatProviderError, formatFetchError, sanitizeKey, openaiCompatHeaders, isLocalAiUrl, isGroqEndpoint } = require('./ai-providers');
const { openaiTools, anthropicTools, executeTool } = require('./ai-tools');

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

  const tasks = await db.prepare("SELECT id, title, date, time, priority, status FROM tasks WHERE user_id=? AND (status != 'done' OR date >= ?) ORDER BY date LIMIT 40").all(uid, today);
  if (tasks.length) {
    lines.push('## Tasks');
    for (const t of tasks) lines.push(`- #${t.id} [${t.status}] ${t.title} (date: ${t.date}${t.time ? ' ' + t.time : ''}, priority: ${t.priority})`);
  }

  const projects = await db.prepare('SELECT id, name, description, status, start_date, end_date, progress FROM projects WHERE user_id=? LIMIT 30').all(uid);
  if (projects.length) {
    lines.push('## Projects');
    for (const p of projects) {
      lines.push(`- #${p.id} ${p.name} [${p.status}] ${p.start_date || '?'} → ${p.end_date || '?'} (${p.progress}% done)${p.description ? ': ' + p.description.slice(0, 150) : ''}`);
      const items = await db.prepare('SELECT id, content, done FROM project_items WHERE project_id=? ORDER BY done ASC, position ASC LIMIT 12').all(p.id);
      for (const it of items) lines.push(`    #${it.id} ${it.done ? '[x]' : '[ ]'} ${it.content}`);
    }
  }

  const plans = await db.prepare('SELECT id, title, details, estimate_date, status FROM plans WHERE user_id=? LIMIT 20').all(uid);
  if (plans.length) {
    lines.push('## Future plans');
    for (const p of plans) lines.push(`- #${p.id} ${p.title} [${p.status}] est. ${p.estimate_date || 'TBD'}${p.details ? ': ' + p.details.slice(0, 150) : ''}`);
  }

  const ideas = await db.prepare('SELECT id, title, content, tags FROM ideas WHERE user_id=? ORDER BY pinned DESC, updated_at DESC LIMIT 20').all(uid);
  if (ideas.length) {
    lines.push('## Brainstorming notes');
    for (const i of ideas) lines.push(`- #${i.id} ${i.title}${i.tags ? ' [' + i.tags + ']' : ''}: ${(i.content || '').slice(0, 200)}`);
  }

  const expTotal = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date >= ? AND type='expense'").get(uid, monthStart)).t;
  const incTotal = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date >= ? AND type='income'").get(uid, monthStart)).t;
  const expByCat = await db.prepare("SELECT category, SUM(amount) t FROM expenses WHERE user_id=? AND date >= ? AND type='expense' GROUP BY category ORDER BY t DESC").all(uid, monthStart);
  const recentExp = await db.prepare('SELECT id, title, amount, category, date, type FROM expenses WHERE user_id=? ORDER BY date DESC LIMIT 25').all(uid);
  if (recentExp.length) {
    lines.push(`## Money (this month: income ${Number(incTotal).toFixed(2)}, expenses ${Number(expTotal).toFixed(2)}, balance ${(Number(incTotal) - Number(expTotal)).toFixed(2)})`);
    lines.push('Spending by category this month: ' + (expByCat.map(c => `${c.category}: ${Number(c.t).toFixed(2)}`).join(', ') || 'none'));
    for (const e of recentExp) lines.push(`- #${e.id} ${e.date} [${e.type}] ${e.title}: ${e.amount} (${e.category})`);
  }

  const debts = await db.prepare("SELECT id, person, type, amount, paid, due_date, status FROM debts WHERE user_id=? AND status='active' LIMIT 20").all(uid);
  if (debts.length) {
    lines.push('## Debts & loans (active)');
    for (const d of debts) {
      lines.push(`- #${d.id} ${d.type === 'borrowed' ? 'I owe' : 'Owes me'} ${d.person}: ${(d.amount - d.paid).toFixed(2)} remaining (of ${d.amount})${d.due_date ? ', due ' + d.due_date : ''}`);
    }
  }

  const invs = await db.prepare('SELECT id, name, type, partner, amount, expected_return, status FROM investments WHERE user_id=? LIMIT 20').all(uid);
  if (invs.length) {
    lines.push('## Investments ("made" = my investment, "received" = investor capital I must pay returns on)');
    for (const i of invs) {
      const profit = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investment_txns WHERE investment_id=? AND type='profit'").get(i.id)).t;
      const payout = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM investment_txns WHERE investment_id=? AND type='payout'").get(i.id)).t;
      lines.push(`- #${i.id} [${i.type}] ${i.name}${i.partner ? ' (with ' + i.partner + ')' : ''}: capital ${i.amount}, ${i.type === 'made' ? 'profit received ' + Number(profit).toFixed(2) : 'returns paid ' + Number(payout).toFixed(2)}${i.expected_return ? ', expected: ' + i.expected_return : ''} [${i.status}]`);
    }
  }

  const habits = await db.prepare(`SELECT h.name, h.id,
      (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id=h.id AND l.date >= date('now','-30 days')) AS last30
      FROM habits h WHERE h.user_id=? AND h.archived=0`).all(uid);
  if (habits.length) {
    lines.push('## Habits (completions in last 30 days)');
    for (const h of habits) lines.push(`- #${h.id} ${h.name}: ${h.last30}/30 days`);
  }

  const health = await db.prepare('SELECT date, weight, sleep_hours, water_glasses, steps, mood FROM health WHERE user_id=? ORDER BY date DESC LIMIT 14').all(uid);
  if (health.length) {
    lines.push('## Health log (latest first; mood is 1-5)');
    for (const h of health) lines.push(`- ${h.date}: weight=${h.weight ?? '-'}, sleep=${h.sleep_hours ?? '-'}h, water=${h.water_glasses ?? '-'}, steps=${h.steps ?? '-'}, mood=${h.mood ?? '-'}`);
  }

  const trips = await db.prepare('SELECT id, destination, start_date, end_date, budget, status, notes FROM trips WHERE user_id=? LIMIT 10').all(uid);
  if (trips.length) {
    lines.push('## Trips');
    for (const t of trips) lines.push(`- #${t.id} ${t.destination} [${t.status}] ${t.start_date || '?'} → ${t.end_date || '?'}, budget ${t.budget}`);
  }

  const events = await db.prepare('SELECT id, title, date, start_time FROM events WHERE user_id=? AND date >= ? ORDER BY date LIMIT 15').all(uid, today);
  if (events.length) {
    lines.push('## Upcoming calendar events');
    for (const e of events) lines.push(`- #${e.id} ${e.date}${e.start_time ? ' ' + e.start_time : ''}: ${e.title}`);
  }

  return lines.join('\n').slice(0, 14000);
}

function normalizeKey(k) {
  return sanitizeKey(k);
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
  return out;
}

async function listActiveModels() {
  const rows = await db.prepare(`SELECT id, name, provider, model_id, position FROM ai_models
    WHERE active=1 ORDER BY position ASC, id ASC`).all();
  const keys = await loadPlatformAI(await ownerId());
  return rows.filter((m) => modelReady(m, keys));
}

async function resolveModel(modelDbId, keys) {
  if (modelDbId) {
    const m = await db.prepare('SELECT * FROM ai_models WHERE id=? AND active=1').get(modelDbId);
    if (m) return { model: m, requested: true };
  }
  const rows = await db.prepare('SELECT * FROM ai_models WHERE active=1 ORDER BY position ASC, id ASC').all();
  return { model: rows.find((m) => modelReady(m, keys)) || null, requested: false };
}

/** Resolve platform key + model for a chat — everything is free for everyone. */
async function resolveAIRoute(modelDbId) {
  const oid = await ownerId();
  const keys = await loadPlatformAI(oid);
  const { model, requested } = await resolveModel(modelDbId, keys);
  if (!model) return { error: 'No AI model is available. Ask the admin to add one in Admin → AI Models.' };

  const creds = credsFor(model, keys);
  if (!modelReady(model, keys)) {
    const label = PROVIDERS[creds.provider]?.label || creds.provider;
    if (requested) {
      return { error: `"${model.name}" needs a ${label} API key. Admin → AI Models-এ ${label} connect করুন।` };
    }
    return { error: `${label} API key missing. Admin → AI Models-এ ${label} key সেভ করুন।` };
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

async function callAnthropic({ apiKey, model, system, messages, userContent, uid, changes }) {
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

  const tools = uid ? anthropicTools() : null;
  let useTools = !!tools;
  for (let round = 0; round < 6; round++) {
    const payload = { model: model || 'claude-sonnet-4-6', max_tokens: 2048, system, messages: formatted };
    if (useTools) payload.tools = tools;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const raw = data?.error?.message || `Anthropic API error (${resp.status})`;
      if (useTools && looksLikeToolsUnsupported(raw)) {
        useTools = false;
        continue;
      }
      throw new Error(formatProviderError(resp.status, raw, {
        host: 'api.anthropic.com', model, apiKey, provider: 'anthropic',
      }));
    }
    const blocks = data.content || [];
    const toolUses = blocks.filter((b) => b.type === 'tool_use');
    const text = blocks.map((b) => b.text || '').join('').trim();
    if (!toolUses.length) return text;
    formatted.push({ role: 'assistant', content: blocks });
    const results = await applyToolCalls(uid, toolUses, changes);
    formatted.push({
      role: 'user',
      content: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: JSON.stringify(r.result).slice(0, 4000),
      })),
    });
  }
  return 'Done — I applied the requested changes.';
}

function clipText(text, n) {
  const s = String(text || '');
  return s.length <= n ? s : s.slice(0, n) + '\n…[truncated]';
}

function formatChanges(changes) {
  if (!changes.length) return '';
  const lines = changes.map((c) => `✓ ${c.action} ${c.resource}${c.name ? ': ' + c.name : ''}${c.id ? ' (#' + c.id + ')' : ''}`);
  return '\n\n' + lines.join('\n');
}

function looksLikeToolsUnsupported(raw) {
  return /tool|function.?call|unknown.?param|extra.?input|unsupported|not supported|unrecognized/i.test(String(raw || ''));
}

async function applyToolCalls(uid, calls, changes) {
  const bag = changes || [];
  const results = [];
  for (const call of calls) {
    const name = call.name || call.function?.name;
    const raw = call.input != null ? call.input : call.function?.arguments;
    const out = await executeTool(uid, name, raw);
    if (out.change) bag.push(out.change);
    results.push({ id: call.id, name, result: out.result });
  }
  return results;
}

function openaiChatBody({ model, system, formatted, groqReasoning, large, provider }) {
  const body = {
    model: model || 'gpt-4o-mini',
    stream: true,
    messages: [{ role: 'system', content: clipText(system, large ? 2500 : 14000) }, ...formatted.slice(large ? -4 : -10)],
  };
  const n = large ? 2048 : 3072;
  // OpenAI chat completions reject max_tokens; Groq gpt-oss needs max_completion_tokens too.
  if (provider === 'openai' || groqReasoning) {
    body.max_completion_tokens = n;
    if (groqReasoning) body.reasoning_effort = 'low';
  } else {
    body.max_tokens = n;
  }
  return body;
}

async function readOpenAiStream(resp, { deadline }) {
  if (!resp.body || typeof resp.body.getReader !== 'function') {
    const data = await resp.json().catch(() => ({}));
    const text = String(data.choices?.[0]?.message?.content || '').trim();
    return { text, truncated: false };
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let truncated = false;
  while (true) {
    if (Date.now() > deadline) {
      truncated = true;
      try { await reader.cancel(); } catch {}
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) text += delta;
      } catch { /* ignore malformed sse lines */ }
    }
  }
  return { text: text.trim(), truncated };
}

async function openAiRequest(url, apiKey, body, deadline, baseUrl) {
  const ms = Math.max(3000, deadline - Date.now());
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers: openaiCompatHeaders(apiKey, baseUrl),
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAITools({ url, apiKey, baseUrl, body, deadline, uid, provider, model, changes }) {
  const tools = openaiTools();
  const messages = body.messages.slice();
  const bag = changes || [];
  let usedTools = true;
  for (let round = 0; round < 6; round++) {
    const reqBody = {
      ...body,
      messages,
      stream: false,
    };
    if (usedTools) {
      reqBody.tools = tools;
      reqBody.tool_choice = 'auto';
    }
    let resp;
    try {
      resp = await openAiRequest(url, apiKey, reqBody, deadline, baseUrl);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const raw = String(data?.error?.message || data?.error || '');
      if (usedTools && looksLikeToolsUnsupported(raw)) {
        usedTools = false;
        continue;
      }
      let host = url;
      try { host = new URL(url).hostname; } catch {}
      throw new Error(formatProviderError(resp.status, raw || `API error (${resp.status})`, { host, model, apiKey, provider }));
    }
    const msg = data.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];
    const text = String(msg.content || '').trim();
    if (!calls.length) return text || (bag.length ? 'Done — I applied the requested changes.' : '');
    const results = await applyToolCalls(uid, calls.map((c) => ({
      id: c.id,
      name: c.function?.name,
      input: c.function?.arguments,
    })), bag);
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });
    for (const r of results) {
      messages.push({
        role: 'tool',
        tool_call_id: r.id,
        content: JSON.stringify(r.result).slice(0, 4000),
      });
    }
  }
  return bag.length ? 'Done — I applied the requested changes.' : null;
}

async function callOpenAI({ apiKey, model, baseUrl, system, messages, userContent, provider, uid, changes }) {
  const url = chatCompletionsUrl(baseUrl);
  const formatted = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? clipText(m.content, 4000) : m.content,
  }));
  if (userContent && typeof userContent === 'object') {
    const content = [{ type: 'text', text: clipText(userContent.text || '', 20000) }];
    for (const b of userContent.blocks || []) {
      if (b.kind === 'image') {
        content.push({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } });
      }
    }
    formatted[formatted.length - 1] = { role: 'user', content };
  }

  const last = formatted[formatted.length - 1];
  const lastLen = typeof last?.content === 'string' ? last.content.length
    : Array.isArray(last?.content) ? last.content.reduce((n, p) => n + String(p.text || '').length, 0) : 0;
  const large = lastLen > 1200 || String(system || '').length > 10000;
  const id = String(model || '').toLowerCase();
  const groqReasoning = (provider === 'groq' || isGroqEndpoint(baseUrl))
    && (id.includes('gpt-oss') || id.includes('qwen3.6') || id.startsWith('groq/'));
  const body = openaiChatBody({ model, system, formatted, groqReasoning, large, provider });
  const deadline = Date.now() + 52000;

  if (uid) {
    const toolText = await callOpenAITools({
      url, apiKey, baseUrl, body, deadline, uid, provider, model, changes,
    });
    if (toolText != null) return toolText;
  }

  let resp;
  try {
    resp = await openAiRequest(url, apiKey, body, deadline, baseUrl);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('This task is too large to finish in one go. Split it: ask for an outline first, then each section in a new message.');
    }
    throw new Error(formatFetchError(e, url));
  }

  let lastRaw = '';
  const readErr = async () => {
    if (lastRaw) return lastRaw;
    const data = await resp.json().catch(() => ({}));
    lastRaw = String(data?.error?.message || data?.error || `API error (${resp.status})`);
    return lastRaw;
  };

  if (!resp.ok) {
    const raw = await readErr();
    const paramErr = resp.status === 400 && /unknown|unsupported|unexpected|invalid.*param|max_tokens|reasoning|stream/i.test(String(raw));
    if (paramErr) {
      delete body.reasoning_effort;
      delete body.stream;
      // OpenAI must keep max_completion_tokens. Other OpenAI-compatible APIs may need the swap.
      if (provider !== 'openai') {
        if (body.max_completion_tokens && !body.max_tokens) {
          body.max_tokens = body.max_completion_tokens;
          delete body.max_completion_tokens;
        } else if (body.max_tokens) {
          body.max_completion_tokens = body.max_tokens;
          delete body.max_tokens;
        }
      }
      try {
        resp = await openAiRequest(url, apiKey, body, deadline, baseUrl);
        lastRaw = '';
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new Error('This task is too large to finish in one go. Split it: ask for an outline first, then each section in a new message.');
        }
        throw e;
      }
    }
  }

  if (!resp.ok) {
    const raw = await readErr();
    if (/too large|context_length|maximum context|reduce the length|prompt is too long/i.test(String(raw)) && formatted.length > 3) {
      body.messages = [{ role: 'system', content: clipText(system, 2000) }, ...formatted.slice(-2)];
      try {
        resp = await openAiRequest(url, apiKey, body, deadline, baseUrl);
        lastRaw = '';
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new Error('This task is too large to finish in one go. Split it: ask for an outline first, then each section in a new message.');
        }
        throw e;
      }
    }
  }

  if (!resp.ok) {
    const raw = await readErr();
    let host = url;
    try { host = new URL(url).hostname; } catch {}
    throw new Error(formatProviderError(resp.status, raw, { host, model, apiKey, provider }));
  }

  if (!body.stream) {
    const data = await resp.json().catch(() => ({}));
    const text = String(data.choices?.[0]?.message?.content || '').trim();
    if (text) return text;
    throw new Error('The model spent its whole reply thinking. Ask for a shorter piece, or say “continue”.');
  }

  const { text, truncated } = await readOpenAiStream(resp, { deadline });
  if (text && truncated) {
    return `${text}\n\n— Time limit reached. Send **continue** for the next part.`;
  }
  if (text) return text;
  throw new Error('The model spent its whole reply thinking. Ask for a shorter piece, or say “continue”.');
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

  const largeTask = (message || '').length > 1200;
  const context = largeTask ? '' : await buildContext(uid);
  const system = largeTask
    ? `You are a personal AI assistant inside Personal OS. Today's date is ${new Date().toISOString().slice(0, 10)}.
You can READ and WRITE the user's live data with tools: tasks, projects, project checklist items, plans, ideas, expenses, habits, trips, events, debts, investments, health.
When the user asks to add/update/complete/delete something, call the tools — do not only describe what you would do.
The user asked for a large writing task. Start with a short plan (max 6 bullets), then fully complete the first part. End with: "Send continue for the next part."`
    : `You are the personal AI assistant inside "${user?.name || user?.username}"'s Personal OS dashboard.
Today's date is ${new Date().toISOString().slice(0, 10)}.
You have READ and WRITE access to their live data via tools (os_query, os_create, os_update, os_delete, os_toggle_habit, os_log_health).
Use tools to create/update/complete tasks, running projects, project checklist items, plans, ideas, expenses/income, habits, trips, calendar events, debts, investments, and health logs whenever the user asks.
Rules:
- Prefer tools over guessing. Use record ids from the snapshot or os_query before updates.
- After making changes, briefly confirm what you did (names + ids).
- Be concise and actionable. Reply in the user's language.
- If they ask a large writing deliverable, complete the first part and invite "continue".

=== USER DATA SNAPSHOT ===
${context || '(No data yet — the user has not added anything.)'}
=== END DATA ===`;

  const history = (await db.prepare('SELECT role, content FROM chats WHERE user_id=? AND conversation_id=? ORDER BY id DESC LIMIT 10').all(uid, conv.id)).reverse();
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: typeof userContent === 'string' ? userContent : userContent.text },
  ];

  try {
    let reply;
    const changes = [];
    const contentArg = parts.length ? userContent : null;
    if (provider === 'anthropic') {
      reply = await callAnthropic({ apiKey, model, system, messages, userContent: contentArg, uid, changes });
    } else {
      reply = await callOpenAI({ apiKey, model, baseUrl, system, messages, userContent: contentArg, provider, uid, changes });
    }
    if (changes.length && !/✓\s+(created|updated|deleted|logged)/i.test(reply)) {
      reply = (reply || '').trim() + formatChanges(changes);
    }

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

    res.json({ reply, changes, model: { id: modelRow.id, name: modelRow.name }, conversation: { id: conv.id, title: conv.title } });
  } catch (e) {
    // clean up uploaded files on failure
    for (const f of files) {
      try { fs.unlinkSync(f.path); } catch {}
    }
    res.status(502).json({ error: e.message || 'The AI request failed. Try a shorter message.' });
  }
});

module.exports = router;
module.exports.router = router;
module.exports.listActiveModels = listActiveModels;
