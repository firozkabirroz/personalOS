// Platform administration — Personal OS is 100% free: no subscriptions,
// no payments, no credits. This module keeps the admin APIs (users, team,
// AI keys, AI model catalog) and the public pricing endpoint the landing
// page uses (which now simply says "free").
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./db');
const { ownerId, mask, logActivity } = require('./platform');
const { setUserCredentials, defaultLoginRisks } = require('./credentials');
const { KEY_FIELDS, PROVIDER_IDS, PROVIDERS, inferProvider, looksLikeUrl, GROQ_MODEL_MIGRATIONS, GROQ_DEFAULT_MODEL, sanitizeKey, assertUsableKey, probeChat, credsFor, DEFAULT_TEST_MODELS, isLocalAiUrl, isGroqEndpoint, normalizeBaseUrl, guessKeyProvider } = require('./ai-providers');

const STAFF_ROLES = ['owner', 'manager', 'support'];

// AI provider keys used platform-wide (one key covers every model of that
// provider in the ai_models catalog). Masked like a normal secret setting.
const AI_KEY_FIELDS = KEY_FIELDS;

/** Everything is free — kept as a no-op for compatibility. */
function subscriptionGate(req, res, next) {
  next();
}

function isExpired() {
  return false;
}

async function requireOwner(req, res, next) {
  const user = await db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  if (!user || user.role !== 'owner') return res.status(403).json({ error: 'Only the owner can do this' });
  next();
}

async function requireAdmin(req, res, next) {
  const user = await db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  if (!user || !['owner', 'manager'].includes(user.role)) return res.status(403).json({ error: 'Admin access only' });
  next();
}

async function notifyOwner(text) {
  const oid = await ownerId();
  if (!oid) return;
  try {
    const { send } = require('./telegram');
    send(oid, text).catch(() => {});
  } catch {}
}

// ============ Public routes (no auth — used by the landing page) ============
const publicRouter = express.Router();

publicRouter.get('/public/pricing', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const models = (await db.prepare('SELECT name FROM ai_models WHERE active=1 ORDER BY position').all()).map(m => m.name);
  res.json({ free_forever: true, models });
});

// ============ Admin routes (owner + manager) ============
const router = express.Router();

router.get('/admin/overview', requireAdmin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
  res.json({
    users: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get()).c,
    newThisWeek: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND created_at >= ?").get(weekAgo)).c,
    activeToday: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND last_login_at >= ?").get(today)).c,
    openTickets: (await db.prepare("SELECT COUNT(*) c FROM tickets WHERE status='open'").get()).c,
    aiChatsTotal: (await db.prepare("SELECT COUNT(*) c FROM chats WHERE role='user'").get()).c,
    aiModels: (await db.prepare('SELECT COUNT(*) c FROM ai_models WHERE active=1').get()).c,
    loginRisks: await defaultLoginRisks(),
  });
});

router.get('/admin/users', requireAdmin, async (req, res) => {
  const rows = await db.prepare(`SELECT id, username, name, role, created_at, last_login_at FROM users WHERE role='user' ORDER BY id ASC`).all();
  res.json(rows);
});

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'user') return res.status(400).json({ error: 'Use Team management to remove staff accounts' });
  await db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.json({ ok: true });
});

router.post('/admin/users/:id/credentials', requireAdmin, async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const actor = await db.prepare('SELECT id, role FROM users WHERE id=?').get(req.userId);
  const isSelf = Number(target.id) === Number(req.userId);
  if (actor.role !== 'owner' && target.role !== 'user' && !isSelf) {
    return res.status(403).json({ error: 'Only the owner can change staff logins' });
  }
  try {
    const user = await setUserCredentials(target, {
      username: req.body?.username,
      password: req.body?.password,
      currentPassword: req.body?.currentPassword,
      requireCurrent: isSelf,
    });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// ============ Team management (owner only) ============
router.get('/admin/team', requireOwner, async (req, res) => {
  const rows = await db.prepare(`SELECT id, username, name, role, created_at FROM users WHERE role IN ('owner','manager','support') ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, id ASC`).all();
  res.json(rows);
});

router.post('/admin/team', requireOwner, async (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!['manager', 'support'].includes(role)) return res.status(400).json({ error: 'Role must be manager or support' });
  const clean = username.trim().toLowerCase();
  if (await db.prepare('SELECT id FROM users WHERE username=?').get(clean)) return res.status(409).json({ error: 'Username already taken' });
  const hash = bcrypt.hashSync(password, 10);
  const info = await db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires) VALUES (?,?,?,?,?,?)')
    .run(clean, hash, (name || username).trim(), role, 'lifetime', '');
  await logActivity({ userId: info.lastInsertRowid, type: 'team_member_added', message: `${clean} added to team as ${role}` });
  res.json(await db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id=?').get(info.lastInsertRowid));
});

router.post('/admin/team/:id/role', requireOwner, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Cannot change the owner\'s role' });
  const { role } = req.body || {};
  if (!['manager', 'support'].includes(role)) return res.status(400).json({ error: 'Role must be manager or support' });
  await db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
  res.json({ ok: true });
});

router.delete('/admin/team/:id', requireOwner, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Owner account cannot be deleted' });
  await db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.json({ ok: true });
});

// ============ AI provider keys (platform-wide) ============
router.get('/admin/ai-keys', requireAdmin, async (req, res) => {
  const oid = await ownerId();
  const out = {};
  for (const key of AI_KEY_FIELDS) {
    const val = oid ? await getSetting(oid, key) : '';
    if (key.endsWith('_base_url')) { out[key] = val; continue; }
    out[key] = mask(val);
    out[key + '_set'] = !!val;
  }
  res.json(out);
});

router.post('/admin/ai-keys', requireAdmin, async (req, res) => {
  const oid = await ownerId();
  if (!oid) return res.status(500).json({ error: 'Owner account missing — cannot save platform keys' });
  const saved = [];
  try {
    for (const key of AI_KEY_FIELDS) {
      const val = req.body?.[key];
      if (typeof val === 'string' && val.trim() && !val.includes('••')) {
        let trimmed = val.trim();
        if (key.endsWith('_base_url')) {
          trimmed = normalizeBaseUrl(trimmed);
        } else {
          if (key === 'admin_custom_key' && looksLikeUrl(trimmed)) {
            await setSetting(oid, 'admin_custom_base_url', normalizeBaseUrl(trimmed));
            saved.push('admin_custom_base_url');
            continue;
          }
          const provider = Object.keys(PROVIDERS).find((id) => PROVIDERS[id].keyField === key) || '';
          try {
            trimmed = assertUsableKey(trimmed, provider);
          } catch (e) {
            return res.status(e.status || 400).json({ error: e.message });
          }
          if (looksLikeUrl(trimmed)) {
            return res.status(400).json({ error: 'That is a base URL, not an API key. Paste the secret into the key field and the endpoint into Custom base URL.' });
          }
        }
        await setSetting(oid, key, trimmed);
        saved.push(key);
      }
    }
    const customKey = sanitizeKey(await getSetting(oid, 'admin_custom_key'));
    const customUrl = String(await getSetting(oid, 'admin_custom_base_url') || '').trim();
    if (guessKeyProvider(customKey) === 'groq' && !customUrl) {
      await setSetting(oid, 'admin_custom_base_url', PROVIDERS.groq.baseUrl);
      saved.push('admin_custom_base_url');
    }
    const groqSlot = sanitizeKey(await getSetting(oid, 'admin_groq_key'));
    if (guessKeyProvider(customKey) === 'groq' && !groqSlot) {
      await setSetting(oid, 'admin_groq_key', customKey);
      saved.push('admin_groq_key');
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save API settings: ' + e.message });
  }
  if (!saved.length) return res.status(400).json({ error: 'Nothing to save — paste a key or base URL' });
  res.json({ ok: true, saved });
});

router.post('/admin/ai-test', requireAdmin, async (req, res) => {
  const oid = await ownerId();
  if (!oid) return res.status(500).json({ error: 'Owner account missing' });
  const body = req.body || {};
  const provider = PROVIDER_IDS.includes(body.provider)
    ? body.provider
    : inferProvider(body.model_id, 'custom');
  const spec = PROVIDERS[provider] || PROVIDERS.custom;
  const keyField = spec.keyField;

  const live = (field) => {
    const val = body[field];
    if (typeof val !== 'string' || !val.trim() || val.includes('••')) return '';
    return field.endsWith('_base_url') ? val.trim().replace(/\/+$/, '') : sanitizeKey(val);
  };

  const packed = {
    groq: sanitizeKey(await getSetting(oid, 'admin_groq_key')),
    gemini: sanitizeKey(await getSetting(oid, 'admin_gemini_key')),
    openrouter: sanitizeKey(await getSetting(oid, 'admin_openrouter_key')),
    cerebras: sanitizeKey(await getSetting(oid, 'admin_cerebras_key')),
    custom: sanitizeKey(await getSetting(oid, 'admin_custom_key')),
    openai: sanitizeKey(await getSetting(oid, 'admin_openai_key')),
    anthropic: sanitizeKey(await getSetting(oid, 'admin_anthropic_key')),
    customUrl: String(await getSetting(oid, 'admin_custom_base_url') || '').trim(),
  };
  const liveKey = live(keyField);
  if (liveKey) {
    if (looksLikeUrl(liveKey)) {
      return res.status(400).json({ error: 'That is a base URL, not an API key. Paste the secret into the key field.' });
    }
    try { packed[provider] = assertUsableKey(liveKey, provider); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  }
  const liveUrl = live('admin_custom_base_url');
  if (liveUrl) packed.customUrl = normalizeBaseUrl(liveUrl);
  else packed.customUrl = normalizeBaseUrl(packed.customUrl);
  if (!packed.customUrl && guessKeyProvider(packed.custom) === 'groq') {
    packed.customUrl = PROVIDERS.groq.baseUrl;
  }

  const dummy = { model_id: body.model_id, provider };
  const creds = credsFor(dummy, packed);
  let modelId = String(body.model_id || '').trim();
  if (GROQ_MODEL_MIGRATIONS[modelId]) modelId = GROQ_MODEL_MIGRATIONS[modelId].model_id;
  if (!modelId) {
    modelId = (await db.prepare('SELECT model_id FROM ai_models WHERE provider=? AND active=1 ORDER BY position ASC LIMIT 1').get(provider))?.model_id
      || (isGroqEndpoint(creds.baseUrl) ? GROQ_DEFAULT_MODEL : '')
      || DEFAULT_TEST_MODELS[provider]
      || '';
  }
  if (provider === 'custom' && !creds.baseUrl) {
    return res.status(400).json({ error: 'Save a Custom base URL first (OpenAI-compatible, e.g. https://api.together.xyz/v1).' });
  }
  if (!creds.apiKey && !(provider === 'custom' && isLocalAiUrl(creds.baseUrl))) {
    return res.status(400).json({ error: `Save a ${spec.label} API key first, then Test.` });
  }
  if (!modelId) {
    return res.status(400).json({ error: 'Enter a model ID to test (or add one to the catalog).' });
  }

  const result = await probeChat({
    provider,
    apiKey: creds.apiKey || 'not-needed',
    baseUrl: creds.baseUrl,
    modelId,
  });
  if (!result.ok) return res.status(502).json(result);
  res.json(result);
});

// ============ AI model catalog — every model is free for every user ============
router.get('/admin/ai-models', requireAdmin, async (req, res) => {
  res.json(await db.prepare('SELECT id, name, provider, model_id, position, active FROM ai_models ORDER BY position ASC, id ASC').all());
});

router.post('/admin/ai-models', requireAdmin, async (req, res) => {
  const { name, provider, model_id } = req.body || {};
  if (!name?.trim() || !model_id?.trim()) return res.status(400).json({ error: 'Name and model ID are required' });
  const prov = PROVIDER_IDS.includes(provider) ? provider : inferProvider(model_id, 'custom');
  const maxPos = (await db.prepare('SELECT COALESCE(MAX(position),0) m FROM ai_models').get()).m;
  const info = await db.prepare(`INSERT INTO ai_models (name, provider, model_id, position)
    VALUES (?,?,?,?)`).run(name.trim(), prov, model_id.trim(), maxPos + 1);
  res.json(await db.prepare('SELECT id, name, provider, model_id, position, active FROM ai_models WHERE id=?').get(info.lastInsertRowid));
});

router.put('/admin/ai-models/:id', requireAdmin, async (req, res) => {
  const m = await db.prepare('SELECT * FROM ai_models WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const { name, provider, model_id, active } = req.body || {};
  const nextProvider = PROVIDER_IDS.includes(provider) ? provider : m.provider;
  await db.prepare(`UPDATE ai_models SET name=?, provider=?, model_id=?, active=? WHERE id=?`)
    .run(name?.trim() || m.name, nextProvider, model_id?.trim() || m.model_id,
      active !== undefined ? (active ? 1 : 0) : m.active, m.id);
  res.json(await db.prepare('SELECT id, name, provider, model_id, position, active FROM ai_models WHERE id=?').get(m.id));
});

router.delete('/admin/ai-models/:id', requireAdmin, async (req, res) => {
  const info = await db.prepare('DELETE FROM ai_models WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = {
  router, publicRouter, subscriptionGate, isExpired, notifyOwner,
  STAFF_ROLES, requireAdmin, requireOwner,
};
