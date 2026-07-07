const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./db');

const STAFF_ROLES = ['owner', 'manager', 'support'];

// ============ Helpers ============
function ownerId() {
  return db.prepare("SELECT id FROM users WHERE role='owner' ORDER BY id ASC LIMIT 1").get()?.id || null;
}

const CONFIG_DEFAULTS = {
  saas_monthly_price: '299',
  saas_yearly_price: '2999',
  saas_trial_days: '7',
  saas_currency: '৳',
  saas_payment_info: 'bKash (Send Money): 01XXXXXXXXX\nReference: আপনার username লিখুন।\nটাকা পাঠানোর পর নিচে Transaction ID (TrxID) জমা দিন — ২৪ ঘণ্টার মধ্যে অ্যাকাউন্ট চালু হবে।',
};

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
  res.json({
    monthly: Number(cfg.saas_monthly_price) || 0,
    yearly: Number(cfg.saas_yearly_price) || 0,
    currency: cfg.saas_currency,
    trial_days: Number(cfg.saas_trial_days) || 0,
  });
});

// ============ User billing routes ============
const router = express.Router();

router.get('/billing/info', (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, plan, plan_expires FROM users WHERE id=?').get(req.userId);
  const cfg = saasConfig();
  const payments = db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.userId);
  const daysLeft = user.plan_expires ? Math.ceil((new Date(user.plan_expires + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400e3) : null;
  res.json({ user, expired: isExpired(user), daysLeft, config: cfg, payments });
});

router.post('/billing/submit', (req, res) => {
  const { plan, trx_id, method } = req.body || {};
  if (!['monthly', 'yearly'].includes(plan)) return res.status(400).json({ error: 'Choose a plan' });
  if (!trx_id || !trx_id.trim()) return res.status(400).json({ error: 'Transaction ID is required' });
  const pending = db.prepare("SELECT id FROM payments WHERE user_id=? AND status='pending'").get(req.userId);
  if (pending) return res.status(400).json({ error: 'You already have a payment awaiting approval. Please wait.' });
  const cfg = saasConfig();
  const months = plan === 'yearly' ? 12 : 1;
  const amount = Number(plan === 'yearly' ? cfg.saas_yearly_price : cfg.saas_monthly_price) || 0;
  const info = db.prepare(`INSERT INTO payments (user_id, plan, months, amount, method, trx_id)
    VALUES (?,?,?,?,?,?)`).run(req.userId, plan, months, amount, (method || 'bKash').trim(), trx_id.trim());
  const user = db.prepare('SELECT username FROM users WHERE id=?').get(req.userId);
  notifyOwner(`💳 <b>New payment submitted</b>\nUser: ${user.username}\nPlan: ${plan} (${months} months) — ${cfg.saas_currency}${amount}\nTrxID: <code>${trx_id.trim()}</code>\n\nApprove it from the Admin Panel.`);
  res.json(db.prepare('SELECT * FROM payments WHERE id=?').get(info.lastInsertRowid));
});

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
  db.prepare('UPDATE users SET plan=?, plan_expires=? WHERE id=?').run(p.plan, newExpiry, user.id);
  db.prepare("UPDATE payments SET status='approved', decided_at=? WHERE id=?").run(todayStr(), p.id);
  res.json({ ok: true, plan_expires: newExpiry });
});

router.post('/admin/payments/:id/reject', requireAdmin, (req, res) => {
  const info = db.prepare("UPDATE payments SET status='rejected', note=?, decided_at=? WHERE id=? AND status='pending'")
    .run((req.body?.note || '').slice(0, 300), todayStr(), req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Pending payment not found' });
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
    return res.json({ ok: true, plan_expires: newExpiry });
  }
  if (action === 'lifetime') {
    db.prepare("UPDATE users SET plan='lifetime', plan_expires='' WHERE id=?").run(user.id);
    return res.json({ ok: true });
  }
  if (action === 'lock') {
    db.prepare("UPDATE users SET plan='expired', plan_expires=? WHERE id=?").run('2000-01-01', user.id);
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
  const info = db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires) VALUES (?,?,?,?,?,?)')
    .run(clean, hash, (name || username).trim(), role, 'lifetime', '');
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

module.exports = { router, publicRouter, subscriptionGate, isExpired, saasConfig, addDays, notifyOwner, STAFF_ROLES };
