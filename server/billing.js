const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./db');
const { ownerId, mask, logActivity } = require('./platform');

const STAFF_ROLES = ['owner', 'manager', 'support'];

const CONFIG_DEFAULTS = {
  saas_trial_days: '7',
  saas_currency: '৳',
  saas_payment_info: 'bKash (Send Money): 01XXXXXXXXX\nReference: আপনার username লিখুন।\nটাকা পাঠানোর পর নিচে Transaction ID (TrxID) জমা দিন — ২৪ ঘণ্টার মধ্যে অ্যাকাউন্ট চালু হবে।',
};

// AI provider keys used platform-wide (one key covers every model of that
// provider in the ai_models catalog). Masked like a normal secret setting.
const AI_KEY_FIELDS = ['admin_anthropic_key', 'admin_openai_key', 'admin_custom_key', 'admin_custom_base_url'];

function getPlans({ activeOnly = false } = {}) {
  let sql = `SELECT p.*, m.name AS model_name, m.provider AS model_provider, m.model_id AS model_ref
    FROM saas_plans p LEFT JOIN ai_models m ON m.id = p.ai_model_id`;
  if (activeOnly) sql += ' WHERE p.active = 1';
  sql += ' ORDER BY p.position ASC, p.id ASC';
  return db.prepare(sql).all();
}

function getPlan(key) {
  return db.prepare(`SELECT p.*, m.name AS model_name, m.provider AS model_provider, m.model_id AS model_ref
    FROM saas_plans p LEFT JOIN ai_models m ON m.id = p.ai_model_id WHERE p.key = ?`).get(key);
}

function saasConfig() {
  const oid = ownerId();
  const cfg = {};
  for (const [k, def] of Object.entries(CONFIG_DEFAULTS)) {
    cfg[k] = (oid ? getSetting(oid, k) : '') || def;
  }
  return cfg;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(fromDate, months) {
  const base = (fromDate && fromDate >= todayStr()) ? fromDate : todayStr();
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isExpired(user) {
  if (!user) return true;
  if (user.role !== 'user') return false;          // owner/staff never locked
  if (user.plan === 'lifetime') return false;
  if (!user.plan_expires) return true;
  return user.plan_expires < todayStr();
}

// Gate: blocks all app APIs when the subscription is over (billing/admin/auth stay open)
function subscriptionGate(req, res, next) {
  const p = req.path;
  if (p.startsWith('/billing') || p.startsWith('/admin') || p.startsWith('/auth') || p.startsWith('/support') || p === '/google/callback') return next();
  const user = db.prepare('SELECT role, plan, plan_expires FROM users WHERE id=?').get(req.userId);
  if (isExpired(user)) {
    return res.status(402).json({ error: 'Your subscription has expired. Please renew to continue.', expired: true });
  }
  next();
}

function requireOwner(req, res, next) {
  const user = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  if (!user || user.role !== 'owner') return res.status(403).json({ error: 'Only the owner can do this' });
  next();
}

// Owner or manager — day-to-day admin work (customers, payments, pricing)
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
  // The landing page may be hosted on a different domain (e.g. root domain
  // vs. an "app." subdomain) — this is public, non-sensitive pricing data.
  res.set('Access-Control-Allow-Origin', '*');
  const cfg = saasConfig();
  const plans = getPlans({ activeOnly: true }).map(p => ({
    key: p.key, name: p.name, monthly_price: p.monthly_price, yearly_price: p.yearly_price,
    ai_message_limit: p.ai_message_limit, model_name: p.model_name, is_free: !!p.is_free,
  }));
  res.json({ currency: cfg.saas_currency, trial_days: Number(cfg.saas_trial_days) || 0, plans });
});

// ============ User billing routes ============
const router = express.Router();

router.get('/billing/info', (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, plan, plan_expires, tier_key FROM users WHERE id=?').get(req.userId);
  const cfg = saasConfig();
  const payments = db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.userId);
  const daysLeft = user.plan_expires ? Math.ceil((new Date(user.plan_expires + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400e3) : null;
  const currentTier = getPlan(user.tier_key || 'free');
  const plans = getPlans({ activeOnly: true });
  const usage = user.role === 'user' && currentTier ? require('./ai').getUsage(user.id) : 0;
  res.json({ user, expired: isExpired(user), daysLeft, config: cfg, payments, currentTier, plans, usage });
});

router.post('/billing/free', (req, res) => {
  const plan = getPlan('free');
  if (!plan) return res.status(400).json({ error: 'Free tier is not configured' });
  db.prepare("UPDATE users SET tier_key='free' WHERE id=?").run(req.userId);
  res.json({ ok: true });
});

router.post('/billing/submit', (req, res) => {
  const { tier_key, cycle, trx_id, method } = req.body || {};
  const plan = getPlan(tier_key);
  if (!plan || plan.is_free || !plan.active) return res.status(400).json({ error: 'Choose a valid paid plan' });
  if (!['monthly', 'yearly'].includes(cycle)) return res.status(400).json({ error: 'Choose monthly or yearly' });
  if (!trx_id || !trx_id.trim()) return res.status(400).json({ error: 'Transaction ID is required' });
  const pending = db.prepare("SELECT id FROM payments WHERE user_id=? AND status='pending'").get(req.userId);
  if (pending) return res.status(400).json({ error: 'You already have a payment awaiting approval. Please wait.' });
  const cfg = saasConfig();
  const months = cycle === 'yearly' ? 12 : 1;
  const amount = Number(cycle === 'yearly' ? plan.yearly_price : plan.monthly_price) || 0;
  const info = db.prepare(`INSERT INTO payments (user_id, plan, months, amount, method, trx_id, tier_key)
    VALUES (?,?,?,?,?,?,?)`).run(req.userId, cycle, months, amount, (method || 'bKash').trim(), trx_id.trim(), plan.key);
  const user = db.prepare('SELECT username FROM users WHERE id=?').get(req.userId);
  notifyOwner(`💳 <b>New payment submitted</b>\nUser: ${user.username}\nPlan: ${plan.name} / ${cycle} (${months} months) — ${cfg.saas_currency}${amount}\nTrxID: <code>${trx_id.trim()}</code>\n\nApprove it from the Admin Panel.`);
  logActivity({ userId: req.userId, type: 'payment_submitted', message: `${user.username} submitted ${plan.name} / ${cycle} — ${cfg.saas_currency}${amount}` });
  res.json(db.prepare('SELECT * FROM payments WHERE id=?').get(info.lastInsertRowid));
});

// Ping the customer on Telegram about a payment decision, respecting their notification preference
function notifyCustomerPayment(userId, text) {
  const prefOn = (getSetting(userId, 'notif_payment') || 'on') === 'on';
  if (!prefOn || !getSetting(userId, 'telegram_chat_id')) return;
  try {
    const { send } = require('./telegram');
    send(userId, text).catch(() => {});
  } catch {}
}

// ============ Admin routes (owner + manager) ============
router.get('/admin/overview', requireAdmin, (req, res) => {
  const today = todayStr();
  const monthStart = today.slice(0, 8) + '01';
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c;
  const active = db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND (plan='lifetime' OR plan_expires >= ?)").get(today).c;
  res.json({
    users,
    active,
    expired: users - active,
    pendingPayments: db.prepare("SELECT COUNT(*) c FROM payments WHERE status='pending'").get().c,
    openTickets: db.prepare("SELECT COUNT(*) c FROM tickets WHERE status='open'").get().c,
    revenueMonth: db.prepare("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE status='approved' AND decided_at >= ?").get(monthStart).t,
    revenueTotal: db.prepare("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE status='approved'").get().t,
    expiringSoon: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user' AND plan != 'lifetime' AND plan_expires >= ? AND plan_expires <= ?").get(today, addDays(7)).c,
  });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  const today = todayStr();
  const rows = db.prepare(`SELECT id, username, name, role, plan, plan_expires, created_at FROM users WHERE role='user' ORDER BY id ASC`).all();
  res.json(rows.map(u => ({ ...u, expired: isExpired(u), isOwner: false })));
});

router.get('/admin/payments', requireAdmin, (req, res) => {
  let sql = `SELECT p.*, u.username, u.name FROM payments p JOIN users u ON u.id = p.user_id`;
  const params = [];
  if (req.query.status) { sql += ' WHERE p.status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY p.id DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

router.post('/admin/payments/:id/approve', requireAdmin, (req, res) => {
  const p = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pending payment not found' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(p.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const newExpiry = addMonths(user.plan_expires, p.months);
  db.prepare('UPDATE users SET plan=?, plan_expires=?, tier_key=? WHERE id=?').run(p.plan, newExpiry, p.tier_key || user.tier_key, user.id);
  db.prepare("UPDATE payments SET status='approved', decided_at=? WHERE id=?").run(todayStr(), p.id);
  logActivity({ userId: user.id, type: 'payment_approved', message: `Payment approved for ${user.username}, valid until ${newExpiry}` });
  notifyCustomerPayment(user.id, `✅ <b>Payment approved!</b>\nYour plan is now active until <b>${newExpiry}</b>. Thanks for subscribing!`);
  res.json({ ok: true, plan_expires: newExpiry });
});

router.post('/admin/payments/:id/reject', requireAdmin, (req, res) => {
  const p = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pending payment not found' });
  const note = (req.body?.note || '').slice(0, 300);
  db.prepare("UPDATE payments SET status='rejected', note=?, decided_at=? WHERE id=?").run(note, todayStr(), p.id);
  const user = db.prepare('SELECT username FROM users WHERE id=?').get(p.user_id);
  logActivity({ userId: p.user_id, type: 'payment_rejected', message: `Payment rejected for ${user?.username || p.user_id}${note ? ': ' + note : ''}` });
  notifyCustomerPayment(p.user_id, `❌ <b>Payment could not be approved</b>${note ? '\nReason: ' + note : ''}\nPlease check your transaction ID and resubmit, or contact support.`);
  res.json({ ok: true });
});

router.post('/admin/users/:id/plan', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Owner account cannot be changed' });
  const { action, months } = req.body || {};
  if (action === 'extend') {
    const m = Number(months) || 1;
    const newExpiry = addMonths(user.plan_expires, m);
    db.prepare("UPDATE users SET plan=?, plan_expires=? WHERE id=?").run(m >= 12 ? 'yearly' : 'monthly', newExpiry, user.id);
    logActivity({ userId: user.id, type: 'plan_changed', message: `${user.username} extended by admin, now valid until ${newExpiry}` });
    return res.json({ ok: true, plan_expires: newExpiry });
  }
  if (action === 'lifetime') {
    db.prepare("UPDATE users SET plan='lifetime', plan_expires='' WHERE id=?").run(user.id);
    logActivity({ userId: user.id, type: 'plan_changed', message: `${user.username} set to lifetime by admin` });
    return res.json({ ok: true });
  }
  if (action === 'lock') {
    db.prepare("UPDATE users SET plan='expired', plan_expires=? WHERE id=?").run('2000-01-01', user.id);
    logActivity({ userId: user.id, type: 'plan_changed', message: `${user.username} locked by admin` });
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'Unknown action' });
});

router.delete('/admin/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'user') return res.status(400).json({ error: 'Use Team management to remove staff accounts' });
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.json({ ok: true });
});

router.get('/admin/config', requireAdmin, (req, res) => res.json(saasConfig()));

router.post('/admin/config', requireAdmin, (req, res) => {
  const oid = ownerId();
  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    if (req.body[key] !== undefined) setSetting(oid, key, String(req.body[key]));
  }
  res.json({ ok: true });
});

// ============ Team management (owner only — decides who has admin power) ============
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
  const info = db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires, tier_key) VALUES (?,?,?,?,?,?,?)')
    .run(clean, hash, (name || username).trim(), role, 'lifetime', '', 'business');
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

// ============ AI provider keys (owner + manager — platform-wide, real money) ============
router.get('/admin/ai-keys', requireAdmin, (req, res) => {
  const oid = ownerId();
  const out = {};
  for (const key of AI_KEY_FIELDS) {
    const val = oid ? getSetting(oid, key) : '';
    if (key.endsWith('_base_url')) { out[key] = val; continue; } // not a secret
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

// ============ AI model catalog (owner + manager) ============
router.get('/admin/ai-models', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM ai_models ORDER BY position ASC, id ASC').all());
});

router.post('/admin/ai-models', requireAdmin, (req, res) => {
  const { name, provider, model_id, input_cost, output_cost } = req.body || {};
  if (!name?.trim() || !model_id?.trim()) return res.status(400).json({ error: 'Name and model ID are required' });
  if (!['anthropic', 'openai', 'custom'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) m FROM ai_models').get().m;
  const info = db.prepare(`INSERT INTO ai_models (name, provider, model_id, input_cost, output_cost, position)
    VALUES (?,?,?,?,?,?)`).run(name.trim(), provider, model_id.trim(), Number(input_cost) || 0, Number(output_cost) || 0, maxPos + 1);
  res.json(db.prepare('SELECT * FROM ai_models WHERE id=?').get(info.lastInsertRowid));
});

router.put('/admin/ai-models/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM ai_models WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const { name, provider, model_id, input_cost, output_cost, active } = req.body || {};
  db.prepare(`UPDATE ai_models SET name=?, provider=?, model_id=?, input_cost=?, output_cost=?, active=? WHERE id=?`)
    .run(name?.trim() || m.name, provider || m.provider, model_id?.trim() || m.model_id,
      input_cost !== undefined ? Number(input_cost) : m.input_cost, output_cost !== undefined ? Number(output_cost) : m.output_cost,
      active !== undefined ? (active ? 1 : 0) : m.active, m.id);
  res.json(db.prepare('SELECT * FROM ai_models WHERE id=?').get(m.id));
});

router.delete('/admin/ai-models/:id', requireAdmin, (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) c FROM saas_plans WHERE ai_model_id=?').get(req.params.id).c;
  if (inUse) return res.status(400).json({ error: 'A plan is still using this model — reassign it first' });
  const info = db.prepare('DELETE FROM ai_models WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ============ Subscription plan tiers (owner + manager) ============
router.get('/admin/plans', requireAdmin, (req, res) => res.json(getPlans()));

router.post('/admin/plans', requireAdmin, (req, res) => {
  const { key, name, monthly_price, yearly_price, ai_model_id, ai_message_limit, is_free } = req.body || {};
  if (!key?.trim() || !name?.trim()) return res.status(400).json({ error: 'Key and name are required' });
  const clean = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (db.prepare('SELECT id FROM saas_plans WHERE key=?').get(clean)) return res.status(409).json({ error: 'A plan with this key already exists' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) m FROM saas_plans').get().m;
  const info = db.prepare(`INSERT INTO saas_plans (key, name, monthly_price, yearly_price, ai_model_id, ai_message_limit, is_free, position)
    VALUES (?,?,?,?,?,?,?,?)`).run(clean, name.trim(), Number(monthly_price) || 0, Number(yearly_price) || 0,
      ai_model_id || null, Number(ai_message_limit) || 0, is_free ? 1 : 0, maxPos + 1);
  res.json(getPlan(clean) || db.prepare('SELECT * FROM saas_plans WHERE id=?').get(info.lastInsertRowid));
});

router.put('/admin/plans/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM saas_plans WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { name, monthly_price, yearly_price, ai_model_id, ai_message_limit, is_free, active } = req.body || {};
  db.prepare(`UPDATE saas_plans SET name=?, monthly_price=?, yearly_price=?, ai_model_id=?, ai_message_limit=?, is_free=?, active=? WHERE id=?`).run(
    name?.trim() || p.name,
    monthly_price !== undefined ? Number(monthly_price) : p.monthly_price,
    yearly_price !== undefined ? Number(yearly_price) : p.yearly_price,
    ai_model_id !== undefined ? (ai_model_id || null) : p.ai_model_id,
    ai_message_limit !== undefined ? Number(ai_message_limit) : p.ai_message_limit,
    is_free !== undefined ? (is_free ? 1 : 0) : p.is_free,
    active !== undefined ? (active ? 1 : 0) : p.active,
    p.id);
  res.json(getPlan(p.key));
});

router.delete('/admin/plans/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM saas_plans WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const inUse = db.prepare('SELECT COUNT(*) c FROM users WHERE tier_key=?').get(p.key).c;
  if (inUse) return res.status(400).json({ error: `${inUse} customer(s) are on this plan — deactivate it instead of deleting` });
  db.prepare('DELETE FROM saas_plans WHERE id=?').run(p.id);
  res.json({ ok: true });
});

module.exports = { router, publicRouter, subscriptionGate, isExpired, saasConfig, addDays, notifyOwner, STAFF_ROLES, getPlans, getPlan, requireAdmin, requireOwner };
