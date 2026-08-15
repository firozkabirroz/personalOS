const path = require('path');
const fs = require('fs');

const PG_NOW = `to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')`;

const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? '/tmp/personal-os-data' : path.join(__dirname, '..', 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const useNeon = !!process.env.DATABASE_URL;

function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function translateSql(sql) {
  return sql
    .replace(/date\('now',\s*'-(\d+) days'\)/gi, `to_char((now() at time zone 'utc') - interval '$1 days', 'YYYY-MM-DD')`)
    .replace(/datetime\('now'\)/gi, PG_NOW)
    .replace(/\bdate\(([a-zA-Z_][\w.]*)\)/g, 'left($1, 10)')
    .replace(/ON CONFLICT\s*\(/gi, 'ON CONFLICT (');
}

function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

function splitStatements(sql) {
  return sql.split(';').map((s) => s.trim()).filter((s) => s && !s.startsWith('--'));
}

function wrapSqlite(raw) {
  return {
    exec: async (sql) => { raw.exec(sql); },
    pragma: async (stmt) => {
      if (typeof raw.pragma === 'function') raw.pragma(stmt);
      else raw.exec(`PRAGMA ${stmt}`);
    },
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get: async (...args) => stmt.get(...args),
        all: async (...args) => stmt.all(...args),
        run: async (...args) => {
          const info = stmt.run(...args);
          return {
            changes: Number(info.changes),
            lastInsertRowid: Number(info.lastInsertRowid),
          };
        },
      };
    },
  };
}

function wrapNeon() {
  const { Pool } = require('@neondatabase/serverless');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  async function query(sql, params) {
    const pgSql = toPgPlaceholders(translateSql(sql));
    return pool.query(pgSql, params);
  }

  return {
    exec: async (sql) => {
      for (const part of splitStatements(translateSql(sql))) {
        await pool.query(part);
      }
    },
    pragma: async () => {},
    prepare(sql) {
      return {
        get: async (...args) => {
          const result = await query(sql, args);
          const row = result.rows[0];
          return row ? normalizeRow(row) : undefined;
        },
        all: async (...args) => {
          const result = await query(sql, args);
          return (result.rows || []).map(normalizeRow);
        },
        run: async (...args) => {
          let q = sql;
          if (/^\s*insert\b/i.test(q) && !/\breturning\b/i.test(q)) q += ' RETURNING id';
          const result = await query(q, args);
          const row = result.rows && result.rows[0];
          return {
            changes: Number(result.rowCount ?? 0),
            lastInsertRowid: row && row.id != null ? Number(row.id) : 0,
          };
        },
      };
    },
  };
}

const SQLITE_SCHEMA = `
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
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New chat',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
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
`;

const PG_TS = `DEFAULT ${PG_NOW}`;

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  created_at TEXT ${PG_TS},
  role TEXT DEFAULT 'user',
  plan TEXT DEFAULT 'lifetime',
  plan_expires TEXT DEFAULT '',
  google_id TEXT,
  last_login_at TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'running',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  progress INTEGER DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS project_items (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT DEFAULT '',
  estimate_date TEXT DEFAULT '',
  status TEXT DEFAULT 'idea',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  color TEXT DEFAULT '#f59e0b',
  pinned INTEGER DEFAULT 0,
  created_at TEXT ${PG_TS},
  updated_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  original TEXT NOT NULL,
  mime TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'general',
  date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  type TEXT DEFAULT 'expense',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '✅',
  color TEXT DEFAULT '#10b981',
  archived INTEGER DEFAULT 0,
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  UNIQUE(habit_id, date)
);
CREATE TABLE IF NOT EXISTS health (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight DOUBLE PRECISION,
  sleep_hours DOUBLE PRECISION,
  water_glasses INTEGER,
  steps INTEGER,
  mood INTEGER,
  notes TEXT DEFAULT '',
  UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  budget DOUBLE PRECISION DEFAULT 0,
  status TEXT DEFAULT 'planning',
  notes TEXT DEFAULT '',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS trip_items (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'checklist',
  content TEXT NOT NULL,
  date TEXT DEFAULT '',
  done INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  type TEXT DEFAULT 'borrowed',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid DOUBLE PRECISION DEFAULT 0,
  date TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS investments (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'made',
  partner TEXT DEFAULT '',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  expected_return TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS investment_txns (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'profit',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
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
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT ${PG_TS},
  updated_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT ${PG_TS},
  model_id INTEGER,
  attachments TEXT DEFAULT '',
  conversation_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chats_conversation ON chats(conversation_id);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New chat',
  created_at TEXT ${PG_TS},
  updated_at TEXT ${PG_TS}
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT ${PG_TS}
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT ${PG_TS}
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
`;

function openAdapter() {
  if (useNeon) {
    return wrapNeon();
  }
  if (process.env.VERCEL) {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch {
      throw new Error('Set DATABASE_URL (Neon) in Vercel env, or use Node.js 22.x.');
    }
    return wrapSqlite(new DatabaseSync(path.join(DATA_DIR, 'personal-os.db')));
  }
  const Database = require('better-sqlite3');
  return wrapSqlite(new Database(path.join(DATA_DIR, 'personal-os.db')));
}

const db = openAdapter();

async function migrateSqlite() {
  await db.pragma('journal_mode = WAL');
  await db.pragma('foreign_keys = ON');
  await db.exec(SQLITE_SCHEMA);

  const userCols = (await db.prepare('PRAGMA table_info(users)').all()).map((c) => c.name);
  if (!userCols.includes('role')) await db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  if (!userCols.includes('plan')) await db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'lifetime'");
  if (!userCols.includes('plan_expires')) await db.exec("ALTER TABLE users ADD COLUMN plan_expires TEXT DEFAULT ''");
  if (!(await db.prepare("SELECT id FROM users WHERE role='owner'").get())) {
    const first = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (first) await db.prepare("UPDATE users SET role='owner', plan='lifetime', plan_expires='' WHERE id=?").run(first.id);
  }

  const expenseCols = (await db.prepare('PRAGMA table_info(expenses)').all()).map((c) => c.name);
  if (!expenseCols.includes('type')) await db.exec("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'");

  if (!userCols.includes('google_id')) {
    await db.exec('ALTER TABLE users ADD COLUMN google_id TEXT');
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL');
  }
  if (!userCols.includes('last_login_at')) await db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT ''");

  const chatCols = (await db.prepare('PRAGMA table_info(chats)').all()).map((c) => c.name);
  if (!chatCols.includes('model_id')) await db.exec('ALTER TABLE chats ADD COLUMN model_id INTEGER');
  if (!chatCols.includes('attachments')) await db.exec("ALTER TABLE chats ADD COLUMN attachments TEXT DEFAULT ''");
  if (!chatCols.includes('conversation_id')) {
    await db.exec('ALTER TABLE chats ADD COLUMN conversation_id INTEGER');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_chats_conversation ON chats(conversation_id)');
  }
}

async function seedAndCleanup() {
  const orphanUsers = await db.prepare('SELECT DISTINCT user_id FROM chats WHERE conversation_id IS NULL').all();
  for (const { user_id } of orphanUsers) {
    const info = await db.prepare("INSERT INTO conversations (user_id, title) VALUES (?, 'Earlier conversation')").run(user_id);
    await db.prepare('UPDATE chats SET conversation_id=? WHERE user_id=? AND conversation_id IS NULL').run(info.lastInsertRowid, user_id);
  }

  await db.exec('DROP TABLE IF EXISTS credit_packs');
  await db.exec('DROP TABLE IF EXISTS credit_ledger');
  await db.exec('DROP TABLE IF EXISTS payments');
  await db.exec('DROP TABLE IF EXISTS saas_plans');
  await db.exec('DROP TABLE IF EXISTS ai_usage');
  await db.exec("UPDATE users SET plan='lifetime', plan_expires=''");

  if (!(await db.prepare('SELECT id FROM ai_models LIMIT 1').get())) {
    const insModel = db.prepare('INSERT INTO ai_models (name, provider, model_id, position) VALUES (?,?,?,?)');
    await insModel.run('GPT-4o mini', 'openai', 'gpt-4o-mini', 1);
    await insModel.run('Claude Haiku 4.5', 'anthropic', 'claude-haiku-4-5-20251001', 2);
    await insModel.run('Claude Sonnet 5', 'anthropic', 'claude-sonnet-5', 3);
    await insModel.run('Claude Opus 4.8', 'anthropic', 'claude-opus-4-8', 4);
  }

  // Persistent Neon should still get demo accounts on a blank database so
  // first login works. After that, registered users stay.
  if (process.env.SEED_DEMO === '1' || process.env.VERCEL || useNeon) {
    if (!(await db.prepare('SELECT id FROM users LIMIT 1').get())) {
      const bcrypt = require('bcryptjs');
      const adminPass = process.env.DEMO_ADMIN_PASSWORD || 'admin123';
      const demoPass = process.env.DEMO_USER_PASSWORD || 'demo123';
      await db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires)
        VALUES ('admin', ?, 'Admin', 'owner', 'lifetime', '')`).run(bcrypt.hashSync(adminPass, 10));
      await db.prepare(`INSERT INTO users (username, password_hash, name, role, plan, plan_expires)
        VALUES ('demo', ?, 'Demo User', 'user', 'lifetime', '')`).run(bcrypt.hashSync(demoPass, 10));
      console.log('Seeded demo accounts: admin / demo');
    }
  }
}

async function init() {
  if (useNeon) await db.exec(PG_SCHEMA);
  else await migrateSqlite();
  await seedAndCleanup();
}

const ready = init().catch((err) => {
  console.error('Database init failed:', err);
  throw err;
});

async function getSetting(userId, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE user_id=? AND key=?').get(userId, key);
  return row ? row.value : '';
}

async function setSetting(userId, key, value) {
  await db.prepare(`INSERT INTO settings (user_id, key, value) VALUES (?,?,?)
    ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value`).run(userId, key, String(value ?? ''));
}

async function logActivity({ userId, type, message }) {
  await db.prepare('INSERT INTO activity_log (user_id, type, message) VALUES (?,?,?)').run(userId || null, type, message);
}

module.exports = { db, getSetting, setSetting, logActivity, DATA_DIR, ready, useNeon };
