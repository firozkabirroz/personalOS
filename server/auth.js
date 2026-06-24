const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

// Persistent JWT secret so sessions survive server restarts
const SECRET_FILE = path.join(DATA_DIR, '.jwt-secret');
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) {
  JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
} else {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, JWT_SECRET);
}

const router = express.Router();

router.get('/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  res.json({ hasUsers: count > 0 });
});

router.post('/register', (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const { saasConfig, addDays, notifyOwner } = require('./billing');
  const isFirst = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0;
  const trialDays = Math.max(0, parseInt(saasConfig().saas_trial_days, 10) || 7);

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires) VALUES (?,?,?,?,?,?)')
    .run(username.trim().toLowerCase(), hash, (name || username).trim(),
      isFirst ? 'owner' : 'user',
      isFirst ? 'lifetime' : 'trial',
      isFirst ? '' : addDays(trialDays));

  if (!isFirst) notifyOwner(`🆕 <b>New user registered</b>\nUsername: ${username.trim().toLowerCase()}\nTrial: ${trialDays} days`);
  const token = jwt.sign({ uid: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: info.lastInsertRowid, username: username.trim().toLowerCase(), name: (name || username).trim() } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user || !bcrypt.compareSync(current || '', user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!next || next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.userId);
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, plan, plan_expires FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const { isExpired } = require('./billing');
  res.json({ user: { ...user, expired: isExpired(user) } });
});

module.exports = { router, requireAuth, JWT_SECRET };
