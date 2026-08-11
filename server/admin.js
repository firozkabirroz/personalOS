const express = require('express');
const { db, getSetting } = require('./db');
const { getPlatformSetting, setPlatformSetting, mask } = require('./platform');
const { requireAdmin } = require('./billing');

const router = express.Router();

// ============ Platform integrations (Google + Notion OAuth apps) ============
router.get('/admin/integrations', requireAdmin, (req, res) => {
  const gid = getPlatformSetting('platform_google_client_id');
  const gsecret = getPlatformSetting('platform_google_client_secret');
  const nid = getPlatformSetting('platform_notion_client_id');
  const nsecret = getPlatformSetting('platform_notion_client_secret');
  res.json({
    platform_google_client_id: gid || '',
    platform_google_client_secret_set: !!gsecret,
    platform_google_client_secret: mask(gsecret),
    platform_notion_client_id: nid || '',
    platform_notion_client_secret_set: !!nsecret,
    platform_notion_client_secret: mask(nsecret),
  });
});

router.post('/admin/integrations', requireAdmin, async (req, res) => {
  const body = req.body || {};
  for (const key of [
    'platform_google_client_id', 'platform_google_client_secret',
    'platform_notion_client_id', 'platform_notion_client_secret',
  ]) {
    const val = body[key];
    if (typeof val === 'string' && val.trim() && !val.includes('••')) {
      setPlatformSetting(key, val.trim());
    }
  }
  res.json({ ok: true });
});

// ============ Per-user activity/data drill-down ============
router.get('/admin/users/:id/detail', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, created_at, last_login_at FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const count = (table) => db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE user_id=?`).get(user.id).c;
  const counts = {
    tasks: count('tasks'),
    projects: count('projects'),
    expenses: count('expenses'),
    habits: count('habits'),
    tickets: count('tickets'),
    chats: count('chats'),
    ideas: count('ideas'),
    events: count('events'),
  };

  const integrations = {
    google_connected: !!getSetting(user.id, 'google_tokens'),
    notion_connected: !!(getSetting(user.id, 'notion_token') || getSetting(user.id, 'notion_tokens')),
    telegram_connected: !!getSetting(user.id, 'telegram_chat_id'),
  };

  const activity = db.prepare('SELECT * FROM activity_log WHERE user_id=? ORDER BY id DESC LIMIT 30').all(user.id);
  const recentChats = db.prepare('SELECT id, role, content, created_at, model_id FROM chats WHERE user_id=? ORDER BY id DESC LIMIT 40').all(user.id);
  const recentTasks = db.prepare('SELECT id, title, date, status, priority FROM tasks WHERE user_id=? ORDER BY id DESC LIMIT 15').all(user.id);
  const recentExpenses = db.prepare('SELECT id, title, amount, category, date, type FROM expenses WHERE user_id=? ORDER BY id DESC LIMIT 15').all(user.id);

  res.json({
    user,
    counts,
    integrations,
    activity,
    recentChats: recentChats.reverse(),
    recentTasks,
    recentExpenses,
  });
});

router.get('/admin/users/:id/data/:module', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const allowed = {
    tasks: 'SELECT * FROM tasks WHERE user_id=? ORDER BY date DESC LIMIT 200',
    projects: 'SELECT * FROM projects WHERE user_id=? ORDER BY id DESC LIMIT 100',
    expenses: 'SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC LIMIT 200',
    habits: 'SELECT * FROM habits WHERE user_id=? ORDER BY id DESC LIMIT 100',
    ideas: 'SELECT * FROM ideas WHERE user_id=? ORDER BY updated_at DESC LIMIT 100',
    chats: 'SELECT id, role, content, created_at, model_id, attachments FROM chats WHERE user_id=? ORDER BY id DESC LIMIT 200',
    events: 'SELECT * FROM events WHERE user_id=? ORDER BY date DESC LIMIT 200',
    trips: 'SELECT * FROM trips WHERE user_id=? ORDER BY id DESC LIMIT 50',
  };
  const sql = allowed[req.params.module];
  if (!sql) return res.status(400).json({ error: 'Unknown module' });
  res.json(db.prepare(sql).all(user.id));
});

// ============ Platform-wide activity feed ============
router.get('/admin/activity', requireAdmin, (req, res) => {
  let sql = `SELECT a.*, u.username, u.name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id`;
  const params = [];
  if (req.query.type) { sql += ' WHERE a.type = ?'; params.push(req.query.type); }
  sql += ' ORDER BY a.id DESC LIMIT 150';
  res.json(db.prepare(sql).all(...params));
});

// ============ Growth stats (signups + AI chats, last 30 days) ============
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

  const chatRows = db.prepare(`SELECT date(created_at) d, COUNT(*) c FROM chats WHERE role='user' AND created_at >= ? GROUP BY d`).all(days[0]);
  const chatMap = Object.fromEntries(chatRows.map(r => [r.d, r.c]));

  res.json({
    signups: days.map(d => ({ label: d.slice(5), value: signupMap[d] || 0 })),
    aiChats: days.map(d => ({ label: d.slice(5), value: chatMap[d] || 0 })),
  });
});

module.exports = { router };
