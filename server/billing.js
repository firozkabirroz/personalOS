// Platform administration — Personal OS is 100% free: no subscriptions,
// no payments, no credits. This module keeps the admin APIs (users, team,
// AI keys, AI model catalog) and the public pricing endpoint the landing
// page uses (which now simply says "free").
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./db');
const { ownerId, mask, logActivity } = require('./platform');

const STAFF_ROLES = ['owner', 'manager', 'support'];

// AI provider keys used platform-wide (one key covers every model of that
// provider in the ai_models catalog). Masked like a normal secret setting.
const AI_KEY_FIELDS = ['admin_anthropic_key', 'admin_openai_key', 'admin_custom_key', 'admin_custom_base_url'];

/** Everything is free — kept as a no-op for compatibility. */
function subscriptionGate(req, res, next) {
  next();
}

function isExpired() {
  return false;
}

function requireOwner(req, res, next) {
  const user = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  if (!user || user.role !== 'owner') return res.status(403).json({ error: 'Only the owner can do this' });
  next();
}

function requireAdmin(req, res, next) {
  const user = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  if (!user || !['owner', 'manager'].includes(user.role)) return res.status(403).json({ error: 'Admin access only' });
  next();
}

function notifyOwner(text) {
  const oid = ownerId();
  if (!oid) return;
  try {
    const { send } = require('./telegram');
    send(oid, text).catch(() => {});
  } catch {}
}

// ============ Public routes (no auth — used by the landing page) ============
const publicRouter = express.Router();

publicRouter.get('/public/pricing', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const models = db.prepare('SELECT name FROM ai_models WHERE active=1 ORDER BY position').all().map(m => m.name);
  res.json({ free_forever: true, models });
});

// ============ Admin routes (owner + manager) ============
const router = express.Router();

router.get('/admin/overview', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
  res.json({
    users: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c,
    newThisWeek: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND created_at >= ?").get(weekAgo).c,
    activeToday: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND last_login_at >= ?").get(today).c,
    openTickets: db.prepare("SELECT COUNT(*) c FROM tickets WHERE status='open'").get().c,
    aiChatsTotal: db.prepare("SELECT COUNT(*) c FROM chats WHERE role='user'").get().c,
    aiModels: db.prepare('SELECT COUNT(*) c FROM ai_models WHERE active=1').get().c,
  });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT id, username, name, role, created_at, last_login_at FROM users WHERE role='user' ORDER BY id ASC`).all();
  res.json(rows);
});

router.delete('/admin/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'user') return res.status(400).json({ error: 'Use Team management to remove staff accounts' });
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.json({ ok: true });
});

// ============ Team management (owner only) ============
router.get('/admin/team', requireOwner, (req, res) => {
  const rows = db.prepare(`SELECT id, username, name, role, created_at FROM users WHERE role IN ('owner','manager','support') ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, id ASC`).all();
  res.json(rows);
});

router.post('/admin/team', requireOwner, (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!['manager', 'support'].includes(role)) return res.status(400).json({ error: 'Role must be manager or support' });
  const clean = username.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE username=?').get(clean)) return res.status(409).json({ error: 'Username already taken' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires) VALUES (?,?,?,?,?,?)')
    .run(clean, hash, (name || username).trim(), role, 'lifetime', '');
  logActivity({ userId: info.lastInsertRowid, type: 'team_member_added', message: `${clean} added to team as ${role}` });
  res.json(db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id=?').get(info.lastInsertRowid));
});

router.post('/admin/team/:id/role', requireOwner, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Cannot change the owner\'s role' });
  const { role } = req.body || {};
  if (!['manager', 'support'].includes(role)) return res.status(400).json({ error: 'Role must be manager or support' });
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
  res.json({ ok: true });
});

router.delete('/admin/team/:id', requireOwner, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Owner account cannot be deleted' });
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.json({ ok: true });
});

// ============ AI provider keys (platform-wide) ============
router.get('/admin/ai-keys', requireAdmin, (req, res) => {
  const oid = ownerId();
  const out = {};
  for (const key of AI_KEY_FIELDS) {
    const val = oid ? getSetting(oid, key) : '';
    if (key.endsWith('_base_url')) { out[key] = val; continue; }
    out[key] = mask(val);
    out[key + '_set'] = !!val;
  }
  res.json(out);
});

router.post('/admin/ai-keys', requireAdmin, (req, res) => {
  const oid = ownerId();
  for (const key of AI_KEY_FIELDS) {
    const val = req.body[key];
    if (typeof val === 'string' && !val.includes('••')) setSetting(oid, key, val.trim());
  }
  res.json({ ok: true });
});

// ============ AI model catalog — every model is free for every user ============
router.get('/admin/ai-models', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, provider, model_id, position, active FROM ai_models ORDER BY position ASC, id ASC').all());
});

router.post('/admin/ai-models', requireAdmin, (req, res) => {
  const { name, provider, model_id } = req.body || {};
  if (!name?.trim() || !model_id?.trim()) return res.status(400).json({ error: 'Name and model ID are required' });
  if (!['anthropic', 'openai', 'custom'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) m FROM ai_models').get().m;
  const info = db.prepare(`INSERT INTO ai_models (name, provider, model_id, position)
    VALUES (?,?,?,?)`).run(name.trim(), provider, model_id.trim(), maxPos + 1);
  res.json(db.prepare('SELECT id, name, provider, model_id, position, active FROM ai_models WHERE id=?').get(info.lastInsertRowid));
});

router.put('/admin/ai-models/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM ai_models WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const { name, provider, model_id, active } = req.body || {};
  db.prepare(`UPDATE ai_models SET name=?, provider=?, model_id=?, active=? WHERE id=?`)
    .run(name?.trim() || m.name, provider || m.provider, model_id?.trim() || m.model_id,
      active !== undefined ? (active ? 1 : 0) : m.active, m.id);
  res.json(db.prepare('SELECT id, name, provider, model_id, position, active FROM ai_models WHERE id=?').get(m.id));
});

router.delete('/admin/ai-models/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM ai_models WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = {
  router, publicRouter, subscriptionGate, isExpired, notifyOwner,
  STAFF_ROLES, requireAdmin, requireOwner,
};
