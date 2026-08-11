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

CREATE TABLE IF NOT EXISTS credit_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  position INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  reason TEXT DEFAULT '',
  ref_type TEXT DEFAULT '',
  ref_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'monthly',
  months INTEGER DEFAULT 1,
  amount REAL DEFAULT 0,
  method TEXT DEFAULT '',
  trx_id TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  decided_at TEXT DEFAULT '',
  tier_key TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_cost REAL DEFAULT 0,
  output_cost REAL DEFAULT 0,
  position INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  is_free INTEGER DEFAULT 0,
  credit_cost INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saas_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_price REAL DEFAULT 0,
  yearly_price REAL DEFAULT 0,
  ai_model_id INTEGER REFERENCES ai_models(id) ON DELETE SET NULL,
  ai_message_limit INTEGER DEFAULT 0,
  is_free INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, month)
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

// Migration: SaaS columns on users — role (owner|user), plan, expiry
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
if (!userCols.includes('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'trial'");
if (!userCols.includes('plan_expires')) db.exec("ALTER TABLE users ADD COLUMN plan_expires TEXT DEFAULT ''");
// the first account ever created is the owner — full lifetime access
if (!db.prepare("SELECT id FROM users WHERE role='owner'").get()) {
  const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  if (first) db.prepare("UPDATE users SET role='owner', plan='lifetime', plan_expires='', tier_key='business' WHERE id=?").run(first.id);
}

// Migration: transaction type (expense | income) — existing rows stay expenses
const expenseCols = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
if (!expenseCols.includes('type')) {
  db.exec("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'");
}

// Migration: subscription tier on users (which AI model/limit they get) + payments.tier_key
if (!userCols.includes('tier_key')) {
  db.exec("ALTER TABLE users ADD COLUMN tier_key TEXT DEFAULT 'free'");
  // staff accounts created before this column existed should get full access, not the free-tier default
  db.exec("UPDATE users SET tier_key='business' WHERE role IN ('owner','manager','support')");
}
const paymentCols = db.prepare('PRAGMA table_info(payments)').all().map(c => c.name);
if (!paymentCols.includes('tier_key')) db.exec("ALTER TABLE payments ADD COLUMN tier_key TEXT DEFAULT ''");

// Migration: Google sign-in linkage + last-login tracking
if (!userCols.includes('google_id')) {
  db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL");
}
if (!userCols.includes('last_login_at')) db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT ''");

// Migration: credit balance on users (replaces subscription gating for AI paid models)
if (!userCols.includes('credits')) {
  db.exec('ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0');
}

// Migration: free vs paid AI models with per-message credit cost
const modelCols = db.prepare('PRAGMA table_info(ai_models)').all().map(c => c.name);
if (!modelCols.includes('is_free')) db.exec('ALTER TABLE ai_models ADD COLUMN is_free INTEGER DEFAULT 0');
if (!modelCols.includes('credit_cost')) db.exec('ALTER TABLE ai_models ADD COLUMN credit_cost INTEGER DEFAULT 1');

// Migration: chat metadata for model switch + file attachments
const chatCols = db.prepare('PRAGMA table_info(chats)').all().map(c => c.name);
if (!chatCols.includes('model_id')) db.exec('ALTER TABLE chats ADD COLUMN model_id INTEGER');
if (!chatCols.includes('attachments')) db.exec("ALTER TABLE chats ADD COLUMN attachments TEXT DEFAULT ''");

// Migration: payments can grant credits (credit-pack purchases)
if (!paymentCols.includes('credits')) db.exec('ALTER TABLE payments ADD COLUMN credits INTEGER DEFAULT 0');
if (!paymentCols.includes('pack_key')) db.exec("ALTER TABLE payments ADD COLUMN pack_key TEXT DEFAULT ''");

// Seed default AI models once (free + paid). Existing DBs keep their catalog.
if (!db.prepare('SELECT id FROM ai_models LIMIT 1').get()) {
  const insModel = db.prepare(`INSERT INTO ai_models (name, provider, model_id, input_cost, output_cost, position, is_free, credit_cost) VALUES (?,?,?,?,?,?,?,?)`);
  const gpt4oMini = insModel.run('GPT-4o mini', 'openai', 'gpt-4o-mini', 0.15, 0.60, 1, 1, 0).lastInsertRowid;
  const haiku = insModel.run('Claude Haiku 4.5', 'anthropic', 'claude-haiku-4-5-20251001', 1.00, 5.00, 2, 0, 1).lastInsertRowid;
  const sonnet = insModel.run('Claude Sonnet 5', 'anthropic', 'claude-sonnet-5', 3.00, 15.00, 3, 0, 3).lastInsertRowid;
  insModel.run('Claude Opus 4.8', 'anthropic', 'claude-opus-4-8', 5.00, 25.00, 4, 0, 5);

  const insPlan = db.prepare(`INSERT INTO saas_plans (key, name, monthly_price, yearly_price, ai_model_id, ai_message_limit, is_free, position) VALUES (?,?,?,?,?,?,?,?)`);
  insPlan.run('free', 'Free', 0, 0, gpt4oMini, 0, 1, 1);
  insPlan.run('starter', 'Starter', 0, 0, gpt4oMini, 0, 1, 2);
  insPlan.run('pro', 'Pro', 0, 0, haiku, 0, 1, 3);
  insPlan.run('business', 'Business', 0, 0, sonnet, 0, 1, 4);
} else {
  // Ensure at least one free model exists on upgraded installs
  const hasFree = db.prepare('SELECT id FROM ai_models WHERE is_free=1 AND active=1 LIMIT 1').get();
  if (!hasFree) {
    const cheapest = db.prepare('SELECT id FROM ai_models WHERE active=1 ORDER BY input_cost ASC, id ASC LIMIT 1').get();
    if (cheapest) db.prepare('UPDATE ai_models SET is_free=1, credit_cost=0 WHERE id=?').run(cheapest.id);
  }
}

// Seed default credit packs once
if (!db.prepare('SELECT id FROM credit_packs LIMIT 1').get()) {
  const insPack = db.prepare(`INSERT INTO credit_packs (key, name, credits, price, position) VALUES (?,?,?,?,?)`);
  insPack.run('starter', 'Starter Pack', 50, 100, 1);
  insPack.run('plus', 'Plus Pack', 150, 250, 2);
  insPack.run('pro', 'Pro Pack', 400, 600, 3);
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
    db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires, tier_key, credits)
      VALUES ('admin', ?, 'Admin', 'owner', 'lifetime', '', 'business', 0)`).run(bcrypt.hashSync(adminPass, 10));
    db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires, tier_key, credits)
      VALUES ('demo', ?, 'Demo User', 'user', 'lifetime', '', 'free', 100)`).run(bcrypt.hashSync(demoPass, 10));
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

function getCredits(userId) {
  return db.prepare('SELECT credits FROM users WHERE id=?').get(userId)?.credits || 0;
}

/** Atomically adjust a user's credit balance and write a ledger row. Returns new balance. */
function adjustCredits(userId, delta, { reason = '', refType = '', refId = null } = {}) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET credits = MAX(0, COALESCE(credits,0) + ?) WHERE id=?').run(delta, userId);
    const balance = getCredits(userId);
    db.prepare(`INSERT INTO credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id)
      VALUES (?,?,?,?,?,?)`).run(userId, delta, balance, reason, refType, refId);
    return balance;
  });
  return tx();
}

module.exports = { db, getSetting, setSetting, logActivity, getCredits, adjustCredits, DATA_DIR };
