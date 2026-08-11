const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting, getCredits, adjustCredits } = require('./db');
const { ownerId, mask, logActivity } = require('./platform');

const STAFF_ROLES = ['owner', 'manager', 'support'];

const CONFIG_DEFAULTS = {
  saas_trial_days: '0',
  saas_currency: '৳',
  saas_signup_credits: '10',
  saas_payment_info: 'bKash (Send Money): 01XXXXXXXXX\nReference: আপনার username লিখুন।\nটাকা পাঠানোর পর নিচে Transaction ID (TrxID) জমা দিন — approve হলে credits যোগ হবে।',
};

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

function getCreditPacks({ activeOnly = false } = {}) {
  let sql = 'SELECT * FROM credit_packs';
  if (activeOnly) sql += ' WHERE active = 1';
  sql += ' ORDER BY position ASC, id ASC';
  return db.prepare(sql).all();
}

function getCreditPack(key) {
  return db.prepare('SELECT * FROM credit_packs WHERE key=?').get(key);
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

/** App access is always free — never lock users out. */
function isExpired() {
  return false;
}

function subscriptionGate(req, res, next) {
  next();
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

function grantSignupCredits(userId) {
  const bonus = Math.max(0, parseInt(saasConfig().saas_signup_credits, 10) || 0);
  if (bonus > 0) {
    adjustCredits(userId, bonus, { reason: 'Signup bonus', refType: 'signup' });
  }
  return bonus;
}

// ============ Public routes ============
const publicRouter = express.Router();

publicRouter.get('/public/pricing', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const cfg = saasConfig();
  const packs = getCreditPacks({ activeOnly: true }).map(p => ({
    key: p.key, name: p.name, credits: p.credits, price: p.price,
  }));
  const freeModels = db.prepare('SELECT name FROM ai_models WHERE active=1 AND is_free=1 ORDER BY position').all().map(m => m.name);
  res.json({
    currency: cfg.saas_currency,
    signup_credits: Number(cfg.saas_signup_credits) || 0,
    free_forever: true,
    free_models: freeModels,
    credit_packs: packs,
    // legacy shape for old landing pages
    trial_days: 0,
    plans: packs.map(p => ({
      key: p.key, name: p.name, monthly_price: p.price, yearly_price: p.price,
      ai_message_limit: p.credits, model_name: `${p.credits} credits`, is_free: 0,
    })),
  });
});

// ============ User billing / credits ============
const router = express.Router();

router.get('/billing/info', (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, plan, plan_expires, tier_key, credits FROM users WHERE id=?').get(req.userId);
  const cfg = saasConfig();
  const payments = db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.userId);
  const packs = getCreditPacks({ activeOnly: true });
  const ledger = db.prepare('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 30').all(req.userId);
  const models = db.prepare('SELECT id, name, is_free, credit_cost FROM ai_models WHERE active=1 ORDER BY position').all();
  res.json({
    user: { ...user, credits: user.credits || 0 },
    expired: false,
    daysLeft: null,
    config: cfg,
    payments,
    packs,
    ledger,
    models,
    credits: user.credits || 0,
  });
});

router.post('/billing/submit', (req, res) => {
  const { pack_key, trx_id, method } = req.body || {};
  const pack = getCreditPack(pack_key);
  if (!pack || !pack.active) return res.status(400).json({ error: 'Choose a valid credit pack' });
  if (!trx_id || !trx_id.trim()) return res.status(400).json({ error: 'Transaction ID is required' });
  const pending = db.prepare("SELECT id FROM payments WHERE user_id=? AND status='pending'").get(req.userId);
  if (pending) return res.status(400).json({ error: 'You already have a payment awaiting approval. Please wait.' });
  const cfg = saasConfig();
  const info = db.prepare(`INSERT INTO payments (user_id, plan, months, amount, method, trx_id, tier_key, credits, pack_key)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    req.userId, 'credits', 0, Number(pack.price) || 0, (method || 'bKash').trim(),
    trx_id.trim(), pack.key, pack.credits, pack.key);
  const user = db.prepare('SELECT username FROM users WHERE id=?').get(req.userId);
  notifyOwner(`💳 <b>Credit pack purchase</b>\nUser: ${user.username}\nPack: ${pack.name} (${pack.credits} credits) — ${cfg.saas_currency}${pack.price}\nTrxID: <code>${trx_id.trim()}</code>`);
  logActivity({ userId: req.userId, type: 'payment_submitted', message: `${user.username} bought ${pack.name} (${pack.credits} credits) — ${cfg.saas_currency}${pack.price}` });
  res.json(db.prepare('SELECT * FROM payments WHERE id=?').get(info.lastInsertRowid));
});

function notifyCustomerPayment(userId, text) {
  const prefOn = (getSetting(userId, 'notif_payment') || 'on') === 'on';
  if (!prefOn || !getSetting(userId, 'telegram_chat_id')) return;
  try {
    const { send } = require('./telegram');
    send(userId, text).catch(() => {});
  } catch {}
}

// ============ Admin overview ============
router.get('/admin/overview', requireAdmin, (req, res) => {
  const today = todayStr();
  const monthStart = today.slice(0, 8) + '01';
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c;
  res.json({
    users,
    active: users,
    expired: 0,
    pendingPayments: db.prepare("SELECT COUNT(*) c FROM payments WHERE status='pending'").get().c,
    openTickets: db.prepare("SELECT COUNT(*) c FROM tickets WHERE status='open'").get().c,
    revenueMonth: db.prepare("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE status='approved' AND decided_at >= ?").get(monthStart).t,
    revenueTotal: db.prepare("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE status='approved'").get().t,
    creditsSoldMonth: db.prepare("SELECT COALESCE(SUM(credits),0) t FROM payments WHERE status='approved' AND decided_at >= ?").get(monthStart).t,
    expiringSoon: 0,
  });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT id, username, name, role, plan, plan_expires, credits, created_at, last_login_at FROM users WHERE role='user' ORDER BY id ASC`).all();
  res.json(rows.map(u => ({ ...u, credits: u.credits || 0, expired: false, isOwner: false })));
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

  let credits = Number(p.credits) || 0;
  if (!credits && p.pack_key) {
    const pack = getCreditPack(p.pack_key);
    if (pack) credits = pack.credits;
  }
  // Legacy subscription payments: grant a default credit amount based on amount paid
  if (!credits && p.amount > 0) credits = Math.max(10, Math.round(Number(p.amount)));

  db.prepare("UPDATE payments SET status='approved', decided_at=?, credits=? WHERE id=?").run(todayStr(), credits, p.id);
  let balance = getCredits(user.id);
  if (credits > 0) {
    balance = adjustCredits(user.id, credits, {
      reason: `Purchase approved · ${p.pack_key || p.tier_key || 'pack'}`,
      refType: 'payment',
      refId: p.id,
    });
  }
  logActivity({ userId: user.id, type: 'payment_approved', message: `+${credits} credits for ${user.username} (balance ${balance})` });
  notifyCustomerPayment(user.id, `✅ <b>Payment approved!</b>\n+${credits} credits added. New balance: <b>${balance}</b>`);
  res.json({ ok: true, credits, balance });
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

/** Grant / remove credits (replaces plan extend/lock). */
router.post('/admin/users/:id/credits', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Owner account cannot be changed this way' });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'amount must be a non-zero number' });
  const reason = (req.body?.reason || 'Admin adjustment').slice(0, 200);
  const balance = adjustCredits(user.id, Math.trunc(amount), { reason, refType: 'admin' });
  logActivity({ userId: user.id, type: 'credits_adjusted', message: `${user.username} credits ${amount > 0 ? '+' : ''}${Math.trunc(amount)} by admin (${reason}) → ${balance}` });
  res.json({ ok: true, credits: balance });
});

// Keep old plan endpoint as soft aliases (grant credits instead of locking)
router.post('/admin/users/:id/plan', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Owner account cannot be changed' });
  const { action, months, amount } = req.body || {};
  if (action === 'extend' || action === 'grant') {
    const credits = Number(amount) || (Number(months) || 1) * 50;
    const balance = adjustCredits(user.id, credits, { reason: 'Admin grant', refType: 'admin' });
    logActivity({ userId: user.id, type: 'credits_adjusted', message: `${user.username} granted +${credits} credits by admin` });
    return res.json({ ok: true, credits: balance });
  }
  if (action === 'lifetime') {
    const balance = adjustCredits(user.id, 1000, { reason: 'Admin lifetime bonus', refType: 'admin' });
    return res.json({ ok: true, credits: balance });
  }
  if (action === 'lock') {
    // Soft-lock: zero credits (app still usable with free models)
    const current = getCredits(user.id);
    if (current > 0) adjustCredits(user.id, -current, { reason: 'Admin reset credits', refType: 'admin' });
    logActivity({ userId: user.id, type: 'credits_adjusted', message: `${user.username} credits reset by admin` });
    return res.json({ ok: true, credits: 0 });
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

// ============ Team ============
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
  const info = db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires, tier_key, credits) VALUES (?,?,?,?,?,?,?,?)')
    .run(clean, hash, (name || username).trim(), role, 'lifetime', '', 'business', 0);
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

// ============ AI keys ============
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

// ============ AI model catalog (free vs paid) ============
router.get('/admin/ai-models', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM ai_models ORDER BY position ASC, id ASC').all());
});

router.post('/admin/ai-models', requireAdmin, (req, res) => {
  const { name, provider, model_id, input_cost, output_cost, is_free, credit_cost } = req.body || {};
  if (!name?.trim() || !model_id?.trim()) return res.status(400).json({ error: 'Name and model ID are required' });
  if (!['anthropic', 'openai', 'custom'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) m FROM ai_models').get().m;
  const free = is_free ? 1 : 0;
  const cost = free ? 0 : Math.max(1, Number(credit_cost) || 1);
  const info = db.prepare(`INSERT INTO ai_models (name, provider, model_id, input_cost, output_cost, position, is_free, credit_cost)
    VALUES (?,?,?,?,?,?,?,?)`).run(name.trim(), provider, model_id.trim(), Number(input_cost) || 0, Number(output_cost) || 0, maxPos + 1, free, cost);
  res.json(db.prepare('SELECT * FROM ai_models WHERE id=?').get(info.lastInsertRowid));
});

router.put('/admin/ai-models/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM ai_models WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const { name, provider, model_id, input_cost, output_cost, active, is_free, credit_cost } = req.body || {};
  const free = is_free !== undefined ? (is_free ? 1 : 0) : m.is_free;
  const cost = free ? 0 : (credit_cost !== undefined ? Math.max(1, Number(credit_cost) || 1) : m.credit_cost);
  db.prepare(`UPDATE ai_models SET name=?, provider=?, model_id=?, input_cost=?, output_cost=?, active=?, is_free=?, credit_cost=? WHERE id=?`)
    .run(name?.trim() || m.name, provider || m.provider, model_id?.trim() || m.model_id,
      input_cost !== undefined ? Number(input_cost) : m.input_cost, output_cost !== undefined ? Number(output_cost) : m.output_cost,
      active !== undefined ? (active ? 1 : 0) : m.active, free, cost, m.id);
  res.json(db.prepare('SELECT * FROM ai_models WHERE id=?').get(m.id));
});

router.delete('/admin/ai-models/:id', requireAdmin, (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) c FROM saas_plans WHERE ai_model_id=?').get(req.params.id).c;
  if (inUse) return res.status(400).json({ error: 'A legacy plan still references this model — deactivate it instead' });
  const info = db.prepare('DELETE FROM ai_models WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ============ Credit packs (replaces subscription plans in UI) ============
router.get('/admin/credit-packs', requireAdmin, (req, res) => res.json(getCreditPacks()));
router.get('/admin/plans', requireAdmin, (req, res) => res.json(getCreditPacks())); // alias for old admin UI

router.post('/admin/credit-packs', requireAdmin, (req, res) => {
  const { key, name, credits, price } = req.body || {};
  if (!key?.trim() || !name?.trim()) return res.status(400).json({ error: 'Key and name are required' });
  const clean = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (db.prepare('SELECT id FROM credit_packs WHERE key=?').get(clean)) return res.status(409).json({ error: 'A pack with this key already exists' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) m FROM credit_packs').get().m;
  const info = db.prepare(`INSERT INTO credit_packs (key, name, credits, price, position) VALUES (?,?,?,?,?)`)
    .run(clean, name.trim(), Math.max(1, Number(credits) || 1), Number(price) || 0, maxPos + 1);
  res.json(db.prepare('SELECT * FROM credit_packs WHERE id=?').get(info.lastInsertRowid));
});

function upsertPackFromBody(body, existing) {
  const name = body.name?.trim() || existing?.name;
  const credits = body.credits !== undefined ? Math.max(1, Number(body.credits) || 1)
    : (body.ai_message_limit !== undefined ? Math.max(1, Number(body.ai_message_limit) || 1) : existing?.credits);
  const price = body.price !== undefined ? Number(body.price)
    : (body.monthly_price !== undefined ? Number(body.monthly_price) : existing?.price);
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing?.active;
  return { name, credits, price, active };
}

router.post('/admin/plans', requireAdmin, (req, res) => {
  const { key, name, monthly_price, ai_message_limit, credits, price } = req.body || {};
  if (!key?.trim() || !name?.trim()) return res.status(400).json({ error: 'Key and name are required' });
  const clean = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (db.prepare('SELECT id FROM credit_packs WHERE key=?').get(clean)) return res.status(409).json({ error: 'A pack with this key already exists' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) m FROM credit_packs').get().m;
  const info = db.prepare(`INSERT INTO credit_packs (key, name, credits, price, position) VALUES (?,?,?,?,?)`)
    .run(clean, name.trim(), Math.max(1, Number(credits ?? ai_message_limit) || 1), Number(price ?? monthly_price) || 0, maxPos + 1);
  res.json(db.prepare('SELECT * FROM credit_packs WHERE id=?').get(info.lastInsertRowid));
});

router.put('/admin/credit-packs/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM credit_packs WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const u = upsertPackFromBody(req.body || {}, p);
  db.prepare(`UPDATE credit_packs SET name=?, credits=?, price=?, active=? WHERE id=?`).run(u.name, u.credits, u.price, u.active, p.id);
  res.json(db.prepare('SELECT * FROM credit_packs WHERE id=?').get(p.id));
});

router.put('/admin/plans/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM credit_packs WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const u = upsertPackFromBody(req.body || {}, p);
  db.prepare(`UPDATE credit_packs SET name=?, credits=?, price=?, active=? WHERE id=?`).run(u.name, u.credits, u.price, u.active, p.id);
  res.json(db.prepare('SELECT * FROM credit_packs WHERE id=?').get(p.id));
});

router.delete('/admin/credit-packs/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM credit_packs WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM credit_packs WHERE id=?').run(p.id);
  res.json({ ok: true });
});

router.delete('/admin/plans/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM credit_packs WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM credit_packs WHERE id=?').run(p.id);
  res.json({ ok: true });
});

module.exports = {
  router, publicRouter, subscriptionGate, isExpired, saasConfig, addDays, notifyOwner,
  STAFF_ROLES, getPlans, getPlan, getCreditPacks, requireAdmin, requireOwner, grantSignupCredits,
};
