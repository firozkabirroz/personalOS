const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const { getPlatformSetting, logActivity } = require('./platform');

// Persistent JWT secret so sessions survive server restarts.
// On serverless hosts (Vercel) set the JWT_SECRET env var — the filesystem
// there is ephemeral AND every instance has its own /tmp, so a file-based
// secret differs per instance and constantly logs users out. If the env var
// is missing on Vercel, fall back to a secret derived from the deployment's
// commit SHA: identical across all instances of one deployment, so sessions
// hold. It's weaker than a real secret — the guide tells users to set one.
const SECRET_FILE = path.join(DATA_DIR, '.jwt-secret');
let JWT_SECRET;
if (process.env.JWT_SECRET) {
  JWT_SECRET = process.env.JWT_SECRET;
} else if (process.env.VERCEL) {
  const seed = [
    process.env.VERCEL_GIT_COMMIT_SHA || '',
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '',
    'personal-os-jwt',
  ].join('|');
  JWT_SECRET = crypto.createHash('sha256').update(seed).digest('hex');
  console.warn('JWT_SECRET env var is not set — using a deployment-derived fallback. Set JWT_SECRET in Vercel project settings for real security.');
} else if (fs.existsSync(SECRET_FILE)) {
  JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
} else {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, JWT_SECRET);
}

const router = express.Router();

router.get('/status', async (req, res) => {
  const count = (await db.prepare('SELECT COUNT(*) AS c FROM users').get()).c;
  res.json({ hasUsers: count > 0 });
});

router.post('/register', async (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = await db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const { notifyOwner } = require('./billing');
  const isFirst = (await db.prepare('SELECT COUNT(*) c FROM users').get()).c === 0;

  const hash = bcrypt.hashSync(password, 10);
  const info = await db.prepare('INSERT INTO users (username, password_hash, name, role, plan, plan_expires, last_login_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
    .run(username.trim().toLowerCase(), hash, (name || username).trim(),
      isFirst ? 'owner' : 'user',
      'lifetime',
      '');

  if (!isFirst) await notifyOwner(`🆕 <b>New user registered</b>\nUsername: ${username.trim().toLowerCase()}`);
  await logActivity({ userId: info.lastInsertRowid, type: 'registered', message: `${username.trim().toLowerCase()} registered${isFirst ? ' (owner)' : ''}` });
  const token = jwt.sign({ uid: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: info.lastInsertRowid, username: username.trim().toLowerCase(), name: (name || username).trim() } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
});

// ============ Google sign-in / sign-up (platform-wide OAuth app, admin-configured) ============
function googleRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

router.get('/google/start', async (req, res) => {
  const clientId = await getPlatformSetting('platform_google_client_id');
  if (!clientId) return res.redirect('/app?gerror=' + encodeURIComponent('Google sign-in is not set up yet. Ask the admin to configure it.'));
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
  const fail = (msg) => res.redirect('/app?gerror=' + encodeURIComponent(msg));
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
    const clientId = await getPlatformSetting('platform_google_client_id');
    const clientSecret = await getPlatformSetting('platform_google_client_secret');
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

    let user = await db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!user) {
      const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const existing = await db.prepare('SELECT * FROM users WHERE username = ?').get(email);
      if (existing && !existing.google_id && profile.verified_email === true && emailLooksValid) {
        await db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, existing.id);
        user = { ...existing, google_id: googleId };
      }
    }

    if (!user) {
      const { notifyOwner } = require('./billing');
      const isFirst = (await db.prepare('SELECT COUNT(*) c FROM users').get()).c === 0;
      const randomHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
      const info = await db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires, google_id)
        VALUES (?,?,?,?,?,?,?)`).run(
        email, randomHash, profile.name || email,
        isFirst ? 'owner' : 'user',
        'lifetime',
        '',
        googleId);
      if (!isFirst) await notifyOwner(`🆕 <b>New user registered via Google</b>\nUsername: ${email}`);
      await logActivity({ userId: info.lastInsertRowid, type: 'registered', message: `${email} registered via Google${isFirst ? ' (owner)' : ''}` });
      user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    } else {
      await logActivity({ userId: user.id, type: 'google_login', message: `${user.username} signed in via Google` });
    }

    await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    const appToken = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect('/app?glogin=' + appToken);
  } catch (e) {
    fail(e.message || 'Google sign-in failed');
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current, next } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  try {
    const { setUserCredentials } = require('./credentials');
    await setUserCredentials(user, { password: next, currentPassword: current, requireCurrent: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status === 400 && /incorrect/i.test(e.message) ? 401 : (e.status || 400)).json({ error: e.message });
  }
});

router.post('/account', requireAuth, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  try {
    const { setUserCredentials } = require('./credentials');
    const updated = await setUserCredentials(user, {
      username: req.body?.username,
      password: req.body?.next || req.body?.password,
      currentPassword: req.body?.current || req.body?.currentPassword,
      requireCurrent: true,
    });
    res.json({ ok: true, user: updated });
  } catch (e) {
    res.status(e.status === 400 && /incorrect/i.test(e.message) ? 401 : (e.status || 400)).json({ error: e.message });
  }
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

router.get('/me', requireAuth, async (req, res) => {
  const user = await db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: { ...user, expired: false } });
});

module.exports = { router, requireAuth, JWT_SECRET };
