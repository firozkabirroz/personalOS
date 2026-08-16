const bcrypt = require('bcryptjs');
const { db, logActivity } = require('./db');

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

function validateUsername(raw) {
  const clean = normalizeUsername(raw);
  if (!USERNAME_RE.test(clean)) {
    const err = new Error('Username must be 3–32 characters (letters, numbers, . _ -)');
    err.status = 400;
    throw err;
  }
  return clean;
}

async function setUserCredentials(user, { username, password, currentPassword, requireCurrent }) {
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const nextUser = username != null && String(username).trim()
    ? validateUsername(username)
    : '';
  const nextPass = password != null ? String(password) : '';
  const rename = nextUser && nextUser !== user.username;
  const newPass = nextPass.length > 0;

  if (!rename && !newPass) {
    const err = new Error('Enter a new username or password');
    err.status = 400;
    throw err;
  }
  if (requireCurrent && (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.password_hash))) {
    const err = new Error('Current password is incorrect');
    err.status = 400;
    throw err;
  }
  if (newPass && nextPass.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }
  if (rename) {
    const taken = await db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(nextUser, user.id);
    if (taken) {
      const err = new Error('Username already taken');
      err.status = 409;
      throw err;
    }
  }

  const sets = [];
  const params = [];
  if (rename) { sets.push('username=?'); params.push(nextUser); }
  if (newPass) { sets.push('password_hash=?'); params.push(bcrypt.hashSync(nextPass, 10)); }
  params.push(user.id);
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).run(...params);

  const finalName = rename ? nextUser : user.username;
  if (rename) {
    await logActivity({ userId: user.id, type: 'username_changed', message: `${user.username} renamed to ${finalName}` });
  }
  if (newPass) {
    await logActivity({ userId: user.id, type: 'password_changed', message: `Password changed for ${finalName}` });
  }
  return { id: user.id, username: finalName, name: user.name, role: user.role };
}

async function defaultLoginRisks() {
  const defaults = {
    admin: process.env.DEMO_ADMIN_PASSWORD || 'admin123',
    demo: process.env.DEMO_USER_PASSWORD || 'demo123',
  };
  const rows = await db.prepare(
    "SELECT id, username, role, password_hash FROM users WHERE lower(username) IN ('admin','demo')"
  ).all();
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    defaultPassword: !!(defaults[u.username] && bcrypt.compareSync(defaults[u.username], u.password_hash)),
  }));
}

module.exports = { normalizeUsername, validateUsername, setUserCredentials, defaultLoginRisks };
