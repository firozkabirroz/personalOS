const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATA_DIR override (e.g. a mounted volume). On Vercel the project directory
// is read-only — only /tmp is writable, so the DB lives there (ephemeral:
// fine for previews/demos, use a real host for production data).
const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? '/tmp/personal-os-data' : path.join(__dirname, '..', 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'personal-os.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'running',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  progress INTEGER DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT DEFAULT '',
  estimate_date TEXT DEFAULT '',
  status TEXT DEFAULT 'idea',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  color TEXT DEFAULT '#f59e0b',
  pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  original TEXT NOT NULL,
  mime TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'general',
  date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '✅',
  color TEXT DEFAULT '#10b981',
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight REAL,
  sleep_hours REAL,
  water_glasses INTEGER,
  steps INTEGER,
  mood INTEGER,
  notes TEXT DEFAULT '',
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  budget REAL DEFAULT 0,
  status TEXT DEFAULT 'planning',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'checklist',
  content TEXT NOT NULL,
  date TEXT DEFAULT '',
  done INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  source TEXT DEFAULT 'local',
  external_id TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  type TEXT DEFAULT 'borrowed',
  amount REAL NOT NULL DEFAULT 0,
  paid REAL DEFAULT 0,
  date TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'made',
  partner TEXT DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  expected_return TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investment_txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'profit',
  amount REAL NOT NULL DEFAULT 0,
  date TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT DEFAULT '',
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  model_id INTEGER,
  attachments TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
`);

// Migration: role column on users (owner|manager|support|user)
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
if (!userCols.includes('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'lifetime'");
if (!userCols.includes('plan_expires')) db.exec("ALTER TABLE users ADD COLUMN plan_expires TEXT DEFAULT ''");
// the first account ever created is the owner
if (!db.prepare("SELECT id FROM users WHERE role='owner'").get()) {
  const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  if (first) db.prepare("UPDATE users SET role='owner', plan='lifetime', plan_expires='' WHERE id=?").run(first.id);
}

// Migration: transaction type (expense | income) — existing rows stay expenses
const expenseCols = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
if (!expenseCols.includes('type')) {
  db.exec("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'");
}

// Migration: Google sign-in linkage + last-login tracking
if (!userCols.includes('google_id')) {
  db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL");
}
if (!userCols.includes('last_login_at')) db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT ''");

// Migration: chat metadata for model switch + file attachments
const chatCols = db.prepare('PRAGMA table_info(chats)').all().map(c => c.name);
if (!chatCols.includes('model_id')) db.exec('ALTER TABLE chats ADD COLUMN model_id INTEGER');
if (!chatCols.includes('attachments')) db.exec("ALTER TABLE chats ADD COLUMN attachments TEXT DEFAULT ''");

// Cleanup: the platform is 100% free — every subscription/credit-era table
// is gone. Everyone keeps role, everything else just works.
db.exec('DROP TABLE IF EXISTS credit_packs');
db.exec('DROP TABLE IF EXISTS credit_ledger');
db.exec('DROP TABLE IF EXISTS payments');
db.exec('DROP TABLE IF EXISTS saas_plans');
db.exec('DROP TABLE IF EXISTS ai_usage');
// everyone is lifetime now — plan columns stay for compatibility but are inert
db.exec("UPDATE users SET plan='lifetime', plan_expires=''");

// Seed default AI models once — every model is free for every user.
if (!db.prepare('SELECT id FROM ai_models LIMIT 1').get()) {
  const insModel = db.prepare(`INSERT INTO ai_models (name, provider, model_id, position) VALUES (?,?,?,?)`);
  insModel.run('GPT-4o mini', 'openai', 'gpt-4o-mini', 1);
  insModel.run('Claude Haiku 4.5', 'anthropic', 'claude-haiku-4-5-20251001', 2);
  insModel.run('Claude Sonnet 5', 'anthropic', 'claude-sonnet-5', 3);
  insModel.run('Claude Opus 4.8', 'anthropic', 'claude-opus-4-8', 4);
}

// Demo account seeding for ephemeral hosts (Vercel) or when SEED_DEMO=1.
// On serverless each instance boots a fresh /tmp database, so an account you
// registered on one instance doesn't exist on the next — logins look "invalid".
// Seeding the same known accounts on every cold start keeps login working.
if (process.env.SEED_DEMO === '1' || process.env.VERCEL) {
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const bcrypt = require('bcryptjs');
    const adminPass = process.env.DEMO_ADMIN_PASSWORD || 'admin123';
    const demoPass = process.env.DEMO_USER_PASSWORD || 'demo123';
    db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires)
      VALUES ('admin', ?, 'Admin', 'owner', 'lifetime', '')`).run(bcrypt.hashSync(adminPass, 10));
    db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires)
      VALUES ('demo', ?, 'Demo User', 'user', 'lifetime', '')`).run(bcrypt.hashSync(demoPass, 10));
    console.log('Seeded demo accounts: admin / demo');
  }
}

function getSetting(userId, key) {
  const row = db.prepare('SELECT value FROM settings WHERE user_id=? AND key=?').get(userId, key);
  return row ? row.value : '';
}

function setSetting(userId, key, value) {
  db.prepare(`INSERT INTO settings (user_id, key, value) VALUES (?,?,?)
    ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value`).run(userId, key, String(value ?? ''));
}

function logActivity({ userId, type, message }) {
  db.prepare('INSERT INTO activity_log (user_id, type, message) VALUES (?,?,?)').run(userId || null, type, message);
}

module.exports = { db, getSetting, setSetting, logActivity, DATA_DIR };
