// Personal OS tools the chat model can call — same tables as the app UI.
const { db } = require('./db');

const RESOURCES = {
  tasks: ['title', 'notes', 'date', 'time', 'priority', 'status'],
  projects: ['name', 'description', 'status', 'start_date', 'end_date', 'progress', 'color'],
  project_items: ['project_id', 'content', 'done', 'position'],
  plans: ['title', 'details', 'estimate_date', 'status'],
  ideas: ['title', 'content', 'tags', 'color', 'pinned'],
  expenses: ['title', 'amount', 'category', 'date', 'notes', 'type'],
  habits: ['name', 'icon', 'color', 'archived'],
  trips: ['destination', 'start_date', 'end_date', 'budget', 'status', 'notes'],
  trip_items: ['trip_id', 'type', 'content', 'date', 'done'],
  events: ['title', 'date', 'start_time', 'end_time', 'notes'],
  debts: ['person', 'type', 'amount', 'paid', 'date', 'due_date', 'notes', 'status'],
  investments: ['name', 'type', 'partner', 'amount', 'expected_return', 'start_date', 'end_date', 'status', 'notes'],
  investment_txns: ['investment_id', 'type', 'amount', 'date', 'notes'],
};

const SEARCH_COL = {
  tasks: 'title',
  projects: 'name',
  project_items: 'content',
  plans: 'title',
  ideas: 'title',
  expenses: 'title',
  habits: 'name',
  trips: 'destination',
  trip_items: 'content',
  events: 'title',
  debts: 'person',
  investments: 'name',
  investment_txns: 'notes',
};

const PARENT = {
  project_items: { col: 'project_id', table: 'projects' },
  trip_items: { col: 'trip_id', table: 'trips' },
  investment_txns: { col: 'investment_id', table: 'investments' },
};

const RESOURCE_ENUM = Object.keys(RESOURCES);

const INT_FIELDS = new Set(['done', 'pinned', 'progress', 'archived', 'position', 'mood', 'steps', 'water_glasses']);
const NUM_FIELDS = new Set(['amount', 'budget', 'paid', 'weight', 'sleep_hours']);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pick(resource, data) {
  const allowed = RESOURCES[resource];
  if (!allowed || !data || typeof data !== 'object') return {};
  const out = {};
  for (const f of allowed) {
    if (data[f] === undefined || data[f] === null) continue;
    let v = data[f];
    if (INT_FIELDS.has(f)) v = Number(v) ? Number(v) : (v === true || v === 'true' || v === '1' ? 1 : 0);
    else if (NUM_FIELDS.has(f)) v = Number(v) || 0;
    else v = String(v);
    out[f] = v;
  }
  return out;
}

async function owned(table, uid, id) {
  if (!id) return null;
  return await db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(id, uid);
}

async function recomputeProgress(uid, projectId) {
  if (!projectId) return;
  const total = (await db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id=? AND user_id=?').get(projectId, uid)).c;
  if (!total) return;
  const done = (await db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id=? AND user_id=? AND done=1').get(projectId, uid)).c;
  await db.prepare('UPDATE projects SET progress=? WHERE id=? AND user_id=?').run(Math.round((done / total) * 100), projectId, uid);
}

async function assertParent(uid, resource, data) {
  const spec = PARENT[resource];
  if (!spec) return;
  const pid = data[spec.col];
  if (!pid) throw new Error(`${spec.col} is required`);
  if (!(await owned(spec.table, uid, pid))) throw new Error(`That ${spec.table.replace(/s$/, '')} was not found`);
}

function label(resource, row) {
  if (!row) return resource;
  return row.title || row.name || row.destination || row.person || row.content || `#${row.id}`;
}

const TOOL_DEFS = [
  {
    name: 'os_query',
    description: 'Search or list the user\'s Personal OS records. Always use this before updating if you do not have the id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resource: { type: 'string', enum: RESOURCE_ENUM },
        q: { type: 'string', description: 'Optional text search (name/title)' },
        status: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        project_id: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['resource'],
    },
  },
  {
    name: 'os_create',
    description: 'Create a new record. For tasks, date defaults to today. For projects, status is running/upcoming/done. For expenses, type is expense or income.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resource: { type: 'string', enum: RESOURCE_ENUM },
        data: { type: 'object', description: 'Fields for that resource' },
      },
      required: ['resource', 'data'],
    },
  },
  {
    name: 'os_update',
    description: 'Update an existing record by id. Use os_query first to get the id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resource: { type: 'string', enum: RESOURCE_ENUM },
        id: { type: 'integer' },
        data: { type: 'object' },
      },
      required: ['resource', 'id', 'data'],
    },
  },
  {
    name: 'os_delete',
    description: 'Delete a record by id. Only when the user clearly asks to remove it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resource: { type: 'string', enum: RESOURCE_ENUM },
        id: { type: 'integer' },
      },
      required: ['resource', 'id'],
    },
  },
  {
    name: 'os_toggle_habit',
    description: 'Mark a habit complete or incomplete for a date (toggles).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        habit_id: { type: 'integer' },
        date: { type: 'string', description: 'YYYY-MM-DD, default today' },
      },
      required: ['habit_id'],
    },
  },
  {
    name: 'os_log_health',
    description: 'Create or update today\'s (or a given date\'s) health log: weight, sleep_hours, water_glasses, steps, mood 1-5, notes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        date: { type: 'string' },
        weight: { type: 'number' },
        sleep_hours: { type: 'number' },
        water_glasses: { type: 'integer' },
        steps: { type: 'integer' },
        mood: { type: 'integer' },
        notes: { type: 'string' },
      },
    },
  },
];

function openaiTools() {
  return TOOL_DEFS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function anthropicTools() {
  return TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

async function runQuery(uid, args) {
  const resource = args.resource;
  if (!RESOURCES[resource]) throw new Error('Unknown resource');
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 50);
  let sql = `SELECT * FROM ${resource} WHERE user_id=?`;
  const params = [uid];
  if (args.status) { sql += ' AND status=?'; params.push(String(args.status)); }
  if (args.date) { sql += ' AND date=?'; params.push(String(args.date)); }
  if (args.project_id && resource === 'project_items') { sql += ' AND project_id=?'; params.push(Number(args.project_id)); }
  const q = String(args.q || '').trim();
  if (q && SEARCH_COL[resource]) {
    sql += ` AND ${SEARCH_COL[resource]} LIKE ?`;
    params.push(`%${q}%`);
  }
  sql += ` ORDER BY id DESC LIMIT ${limit}`;
  return await db.prepare(sql).all(...params);
}

async function runCreate(uid, args) {
  const resource = args.resource;
  if (!RESOURCES[resource]) throw new Error('Unknown resource');
  const data = pick(resource, args.data || {});
  if (resource === 'tasks') {
    if (!data.title) throw new Error('Task title is required');
    if (!data.date) data.date = todayIso();
    if (!data.status) data.status = 'pending';
  }
  if (resource === 'projects' && !data.name) throw new Error('Project name is required');
  if (resource === 'plans' && !data.title) throw new Error('Plan title is required');
  if (resource === 'ideas' && !data.title) throw new Error('Idea title is required');
  if (resource === 'expenses') {
    if (!data.title) throw new Error('Expense title is required');
    if (!data.date) data.date = todayIso();
    if (!data.type) data.type = 'expense';
  }
  if (resource === 'habits' && !data.name) throw new Error('Habit name is required');
  if (resource === 'trips' && !data.destination) throw new Error('Trip destination is required');
  if (resource === 'events') {
    if (!data.title) throw new Error('Event title is required');
    if (!data.date) data.date = todayIso();
  }
  if (resource === 'debts' && !data.person) throw new Error('Person is required');
  if (resource === 'investments' && !data.name) throw new Error('Investment name is required');
  if (resource === 'project_items' && !data.content) throw new Error('Item content is required');
  await assertParent(uid, resource, data);
  const cols = ['user_id'];
  const vals = [uid];
  for (const [k, v] of Object.entries(data)) { cols.push(k); vals.push(v); }
  const info = await db.prepare(`INSERT INTO ${resource} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
  const row = await db.prepare(`SELECT * FROM ${resource} WHERE id=?`).get(info.lastInsertRowid);
  if (resource === 'project_items') await recomputeProgress(uid, row.project_id);
  return row;
}

async function runUpdate(uid, args) {
  const resource = args.resource;
  if (!RESOURCES[resource]) throw new Error('Unknown resource');
  const id = Number(args.id);
  const existing = await owned(resource, uid, id);
  if (!existing) throw new Error('Not found');
  const data = pick(resource, args.data || {});
  if (!Object.keys(data).length) throw new Error('No fields to update');
  await assertParent(uid, resource, { ...existing, ...data });
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(data)) { sets.push(`${k}=?`); vals.push(v); }
  if (resource === 'ideas') sets.push(`updated_at=datetime('now')`);
  vals.push(id, uid);
  await db.prepare(`UPDATE ${resource} SET ${sets.join(', ')} WHERE id=? AND user_id=?`).run(...vals);
  const row = await db.prepare(`SELECT * FROM ${resource} WHERE id=?`).get(id);
  if (resource === 'project_items') await recomputeProgress(uid, row.project_id);
  return row;
}

async function runDelete(uid, args) {
  const resource = args.resource;
  if (!RESOURCES[resource]) throw new Error('Unknown resource');
  const id = Number(args.id);
  const existing = await owned(resource, uid, id);
  if (!existing) throw new Error('Not found');
  await db.prepare(`DELETE FROM ${resource} WHERE id=? AND user_id=?`).run(id, uid);
  if (resource === 'project_items') await recomputeProgress(uid, existing.project_id);
  return { ok: true, id, name: label(resource, existing) };
}

async function runToggleHabit(uid, args) {
  const habit_id = Number(args.habit_id);
  const date = String(args.date || todayIso());
  if (!(await owned('habits', uid, habit_id))) throw new Error('Habit not found');
  const existing = await db.prepare('SELECT id FROM habit_logs WHERE user_id=? AND habit_id=? AND date=?').get(uid, habit_id, date);
  if (existing) {
    await db.prepare('DELETE FROM habit_logs WHERE id=?').run(existing.id);
    return { done: false, habit_id, date };
  }
  await db.prepare('INSERT INTO habit_logs (user_id, habit_id, date) VALUES (?,?,?)').run(uid, habit_id, date);
  return { done: true, habit_id, date };
}

async function runLogHealth(uid, args) {
  const date = String(args.date || todayIso());
  const weight = args.weight ?? null;
  const sleep_hours = args.sleep_hours ?? null;
  const water_glasses = args.water_glasses ?? null;
  const steps = args.steps ?? null;
  const mood = args.mood ?? null;
  const notes = args.notes || '';
  await db.prepare(`INSERT INTO health (user_id, date, weight, sleep_hours, water_glasses, steps, mood, notes)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      weight=COALESCE(excluded.weight, health.weight),
      sleep_hours=COALESCE(excluded.sleep_hours, health.sleep_hours),
      water_glasses=COALESCE(excluded.water_glasses, health.water_glasses),
      steps=COALESCE(excluded.steps, health.steps),
      mood=COALESCE(excluded.mood, health.mood),
      notes=CASE WHEN excluded.notes='' THEN health.notes ELSE excluded.notes END`)
    .run(uid, date, weight, sleep_hours, water_glasses, steps, mood, notes);
  return await db.prepare('SELECT * FROM health WHERE user_id=? AND date=?').get(uid, date);
}

async function executeTool(uid, name, rawArgs) {
  let args = rawArgs;
  if (typeof args === 'string') {
    try { args = JSON.parse(args || '{}'); } catch { args = {}; }
  }
  args = args || {};
  try {
    if (name === 'os_query') {
      const rows = await runQuery(uid, args);
      return { ok: true, result: rows, change: null };
    }
    if (name === 'os_create') {
      const row = await runCreate(uid, args);
      return { ok: true, result: row, change: { action: 'created', resource: args.resource, id: row.id, name: label(args.resource, row) } };
    }
    if (name === 'os_update') {
      const row = await runUpdate(uid, args);
      return { ok: true, result: row, change: { action: 'updated', resource: args.resource, id: row.id, name: label(args.resource, row) } };
    }
    if (name === 'os_delete') {
      const row = await runDelete(uid, args);
      return { ok: true, result: row, change: { action: 'deleted', resource: args.resource, id: row.id, name: row.name } };
    }
    if (name === 'os_toggle_habit') {
      const row = await runToggleHabit(uid, args);
      return { ok: true, result: row, change: { action: row.done ? 'logged' : 'unlogged', resource: 'habits', id: row.habit_id, name: `habit ${row.date}` } };
    }
    if (name === 'os_log_health') {
      const row = await runLogHealth(uid, args);
      return { ok: true, result: row, change: { action: 'updated', resource: 'health', id: row.id, name: row.date } };
    }
    return { ok: false, result: { error: `Unknown tool ${name}` }, change: null };
  } catch (e) {
    return { ok: false, result: { error: e.message || String(e) }, change: null };
  }
}

module.exports = { openaiTools, anthropicTools, executeTool, RESOURCES };
