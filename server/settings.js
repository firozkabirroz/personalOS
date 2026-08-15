const express = require('express');
const { db, getSetting, setSetting } = require('./db');

const router = express.Router();

// Keys whose values are secrets — never sent back to the client in full
const SECRET_KEYS = ['ai_api_key', 'notion_token', 'notion_tokens', 'google_tokens', 'telegram_bot_token'];

const ALLOWED_KEYS = [
  'ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url',
  'notion_token',
  'telegram_bot_token', 'telegram_chat_id', 'telegram_ai_reports', 'timezone',
  'notif_morning', 'notif_night', 'notif_finance', 'notif_payment',
  'currency', 'theme',
];

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

router.get('/settings', async (req, res) => {
  const rows = await db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(req.userId);
  const out = {};
  for (const r of rows) {
    if (r.key === 'google_tokens') { out.google_connected = !!r.value; continue; }
    if (r.key === 'notion_tokens') { out.notion_connected = !!r.value; continue; }
    out[r.key] = SECRET_KEYS.includes(r.key) ? mask(r.value) : r.value;
    if (SECRET_KEYS.includes(r.key)) out[r.key + '_set'] = !!r.value;
  }
  out.telegram_connected = !!out.telegram_chat_id;
  out.notion_connected = !!(out.notion_connected || out.notion_token_set);
  res.json(out);
});

router.post('/settings', async (req, res) => {
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (typeof value === 'string' && value.includes('••')) continue;
    await setSetting(req.userId, key, value);
  }
  res.json({ ok: true });
});

router.delete('/settings/:key', async (req, res) => {
  if (![...ALLOWED_KEYS, 'google_tokens', 'notion_tokens'].includes(req.params.key)) {
    return res.status(400).json({ error: 'Unknown setting' });
  }
  await db.prepare('DELETE FROM settings WHERE user_id=? AND key=?').run(req.userId, req.params.key);
  if (req.params.key === 'notion_tokens') {
    await db.prepare('DELETE FROM settings WHERE user_id=? AND key=?').run(req.userId, 'notion_token');
  }
  if (req.params.key === 'notion_token') {
    await db.prepare('DELETE FROM settings WHERE user_id=? AND key=?').run(req.userId, 'notion_tokens');
  }
  res.json({ ok: true });
});

module.exports = router;
