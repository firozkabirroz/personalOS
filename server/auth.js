const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const { getPlatformSetting, logActivity } = require('./platform');

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
  const info = db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires, last_login_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
    .run(username.trim().toLowerCase(), hash, (name || username).trim(),
      isFirst ? 'owner' : 'user',
      isFirst ? 'lifetime' : 'trial',
      isFirst ? '' : addDays(trialDays));

  if (!isFirst) notifyOwner(`🆕 <b>New user registered</b>\nUsername: ${username.trim().toLowerCase()}\nTrial: ${trialDays} days`);
  logActivity({ userId: info.lastInsertRowid, type: 'registered', message: `${username.trim().toLowerCase()} registered${isFirst ? ' (owner)' : ''}` });
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
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
});

// ============ Google sign-in / sign-up (platform-wide OAuth app, admin-configured) ============
function googleRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

router.get('/google/start', (req, res) => {
  const clientId = getPlatformSetting('platform_google_client_id');
  if (!clientId) return res.redirect('/?gerror=' + encodeURIComponent('Google sign-in is not set up yet. Ask the admin to configure it.'));
  const state = jwt.sign({ purpose: 'google-login', nonce: crypto.randomBytes(8).toString('hex') }, JWT_SECRET, { expiresIn: '10m' });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const fail = (msg) => res.redirect('/?gerror=' + encodeURIComponent(msg));
  if (error) return fail('Google sign-in was cancelled or failed.');
  if (!code || !state) return fail('Google sign-in failed — missing code.');

  let payload;
  try {
    payload = jwt.verify(state, JWT_SECRET);
    if (payload.purpose !== 'google-login') throw new Error('bad purpose');
  } catch {
    return fail('Google sign-in link expired or is invalid — please try again.');
  }

  try {
    const clientId = getPlatformSetting('platform_google_client_id');
    const clientSecret = getPlatformSetting('platform_google_client_secret');
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: googleRedirectUri(req), grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(tokens.error_description || tokens.error || 'Token exchange failed');

    const profResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profResp.json();
    if (!profResp.ok || !profile.email) throw new Error('Could not read Google profile');

    const googleId = String(profile.id);
    const email = String(profile.email).trim().toLowerCase();

    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!user) {
      const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(email);
      if (existing && !existing.google_id && profile.verified_email === true && emailLooksValid) {
        db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, existing.id);
        user = { ...existing, google_id: googleId };
      }
    }

    if (!user) {
      const { saasConfig, addDays, notifyOwner } = require('./billing');
      const isFirst = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0;
      const trialDays = Math.max(0, parseInt(saasConfig().saas_trial_days, 10) || 7);
      const randomHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
      const info = db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires, google_id)
        VALUES (?,?,?,?,?,?,?)`).run(
        email, randomHash, profile.name || email,
        isFirst ? 'owner' : 'user',
        isFirst ? 'lifetime' : 'trial',
        isFirst ? '' : addDays(trialDays),
        googleId);
      if (!isFirst) notifyOwner(`🆕 <b>New user registered via Google</b>\nUsername: ${email}\nTrial: ${trialDays} days`);
      logActivity({ userId: info.lastInsertRowid, type: 'registered', message: `${email} registered via Google${isFirst ? ' (owner)' : ''}` });
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    } else {
      logActivity({ userId: user.id, type: 'google_login', message: `${user.username} signed in via Google` });
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    const appToken = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect('/?glogin=' + appToken);
  } catch (e) {
    fail(e.message || 'Google sign-in failed');
  }
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
  const user = db.prepare('SELECT id, username, name, role, plan, plan_expires, tier_key FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const { isExpired } = require('./billing');
  res.json({ user: { ...user, expired: isExpired(user) } });
});

module.exports = { router, requireAuth, JWT_SECRET };
