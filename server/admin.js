const express = require('express');
const { db, getSetting } = require('./db');
const { getPlatformSetting, setPlatformSetting, mask } = require('./platform');
const { requireAdmin } = require('./billing');
const { getUsage } = require('./ai');

const router = express.Router();

// ============ Platform integrations (Google OAuth app — one platform-wide client
// used for both login and Calendar/Drive connect). Telegram stays per-user (each
// customer brings their own bot via @BotFather), so there's nothing platform-wide
// to configure for it here. ============
router.get('/admin/integrations', requireAdmin, (req, res) => {
  const gid = getPlatformSetting('platform_google_client_id');
  const gsecret = getPlatformSetting('platform_google_client_secret');
  res.json({
    platform_google_client_id: gid || '',
    platform_google_client_secret_set: !!gsecret,
    platform_google_client_secret: mask(gsecret),
  });
});

router.post('/admin/integrations', requireAdmin, async (req, res) => {
  const { platform_google_client_id, platform_google_client_secret } = req.body || {};
  if (typeof platform_google_client_id === 'string' && platform_google_client_id.trim()) {
    setPlatformSetting('platform_google_client_id', platform_google_client_id.trim());
  }
  if (typeof platform_google_client_secret === 'string' && platform_google_client_secret.trim() && !platform_google_client_secret.includes('••')) {
    setPlatformSetting('platform_google_client_secret', platform_google_client_secret.trim());
  }
  res.json({ ok: true });
});

// ============ Per-user activity/data drill-down ============
router.get('/admin/users/:id/detail', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, plan, plan_expires, tier_key, created_at, last_login_at FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const count = (table) => db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE user_id=?`).get(user.id).c;
  const counts = {
    tasks: count('tasks'),
    projects: count('projects'),
    expenses: count('expenses'),
    habits: count('habits'),
    tickets: count('tickets'),
  };

  const integrations = {
    google_connected: !!getSetting(user.id, 'google_tokens'),
    telegram_connected: !!getSetting(user.id, 'telegram_chat_id'),
  };

  const payments = db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 10').all(user.id);
  const activity = db.prepare('SELECT * FROM activity_log WHERE user_id=? ORDER BY id DESC LIMIT 20').all(user.id);

  res.json({
    user,
    counts,
    aiUsage: user.role === 'user' ? { used: getUsage(user.id) } : null,
    integrations,
    payments,
    activity,
  });
});

// ============ Platform-wide activity feed ============
router.get('/admin/activity', requireAdmin, (req, res) => {
  let sql = `SELECT a.*, u.username, u.name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id`;
  const params = [];
  if (req.query.type) { sql += ' WHERE a.type = ?'; params.push(req.query.type); }
  sql += ' ORDER BY a.id DESC LIMIT 150';
  res.json(db.prepare(sql).all(...params));
});

// ============ Growth stats (signups + revenue, last 30 days) ============
router.get('/admin/stats/growth', requireAdmin, (req, res) => {
  const days = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(day.getDate() - i);
    days.push(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
  }

  const signupRows = db.prepare(`SELECT date(created_at) d, COUNT(*) c FROM users WHERE role='user' AND created_at >= ? GROUP BY d`).all(days[0]);
  const signupMap = Object.fromEntries(signupRows.map(r => [r.d, r.c]));

  const revenueRows = db.prepare(`SELECT decided_at d, COALESCE(SUM(amount),0) t FROM payments WHERE status='approved' AND decided_at >= ? GROUP BY d`).all(days[0]);
  const revenueMap = Object.fromEntries(revenueRows.map(r => [r.d, r.t]));

  res.json({
    signups: days.map(d => ({ label: d.slice(5), value: signupMap[d] || 0 })),
    revenue: days.map(d => ({ label: d.slice(5), value: revenueMap[d] || 0 })),
  });
});

module.exports = { router };
