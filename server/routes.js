const express = require('express');
const { db } = require('./db');

const router = express.Router();

// Resource definitions: table -> writable fields
const RESOURCES = {
  tasks:      ['title', 'notes', 'date', 'time', 'priority', 'status'],
  projects:   ['name', 'description', 'status', 'start_date', 'end_date', 'progress', 'color'],
  project_items: ['project_id', 'content', 'done', 'position'],
  plans:      ['title', 'details', 'estimate_date', 'status'],
  ideas:      ['title', 'content', 'tags', 'color', 'pinned'],
  expenses:   ['title', 'amount', 'category', 'date', 'notes', 'type'],
  habits:     ['name', 'icon', 'color', 'archived'],
  trips:      ['destination', 'start_date', 'end_date', 'budget', 'status', 'notes'],
  trip_items: ['trip_id', 'type', 'content', 'date', 'done'],
  events:     ['title', 'date', 'start_time', 'end_time', 'source', 'external_id', 'notes'],
  debts:      ['person', 'type', 'amount', 'paid', 'date', 'due_date', 'notes', 'status'],
  investments: ['name', 'type', 'partner', 'amount', 'expected_return', 'start_date', 'end_date', 'status', 'notes'],
  investment_txns: ['investment_id', 'type', 'amount', 'date', 'notes'],
};

const ORDER = {
  tasks: 'date ASC, time ASC, id DESC',
  projects: 'CASE status WHEN \'running\' THEN 0 WHEN \'upcoming\' THEN 1 ELSE 2 END, start_date ASC',
  project_items: 'position ASC, id ASC',
  plans: 'estimate_date ASC, id DESC',
  ideas: 'pinned DESC, updated_at DESC',
  expenses: 'date DESC, id DESC',
  habits: 'archived ASC, id ASC',
  trips: 'start_date ASC, id DESC',
  trip_items: 'done ASC, date ASC, id ASC',
  events: 'date ASC, start_time ASC',
  debts: "CASE status WHEN 'active' THEN 0 ELSE 1 END, due_date ASC, id DESC",
  investments: "CASE status WHEN 'active' THEN 0 ELSE 1 END, start_date DESC",
  investment_txns: 'date DESC, id DESC',
};

// Auto-progress: project progress % = completed points / total points
async function recomputeProgress(uid, projectId) {
  if (!projectId) return;
  const total = (await db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id=? AND user_id=?').get(projectId, uid)).c;
  if (!total) return; // no points → manual progress stays as-is
  const done = (await db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id=? AND user_id=? AND done=1').get(projectId, uid)).c;
  await db.prepare('UPDATE projects SET progress=? WHERE id=? AND user_id=?').run(Math.round((done / total) * 100), projectId, uid);
}

for (const [table, fields] of Object.entries(RESOURCES)) {
  router.get(`/${table}`, async (req, res) => {
    let sql = `SELECT * FROM ${table} WHERE user_id = ?`;
    const params = [req.userId];
    // simple filtering: any writable field passed as query param
    for (const f of fields) {
      if (req.query[f] !== undefined) { sql += ` AND ${f} = ?`; params.push(req.query[f]); }
    }
    sql += ` ORDER BY ${ORDER[table] || 'id DESC'}`;
    res.json(await db.prepare(sql).all(...params));
  });

  router.post(`/${table}`, async (req, res) => {
    const cols = ['user_id'];
    const vals = [req.userId];
    for (const f of fields) {
      if (req.body[f] !== undefined) { cols.push(f); vals.push(req.body[f]); }
    }
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    try {
      const info = await db.prepare(sql).run(...vals);
      if (table === 'project_items') await recomputeProgress(req.userId, req.body.project_id);
      res.json(await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put(`/${table}/:id`, async (req, res) => {
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    if (table === 'ideas') sets.push(`updated_at = datetime('now')`);
    vals.push(req.params.id, req.userId);
    const info = await db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (table === 'project_items') await recomputeProgress(req.userId, row.project_id);
    res.json(row);
  });

  router.delete(`/${table}/:id`, async (req, res) => {
    const prev = table === 'project_items'
      ? await db.prepare('SELECT project_id FROM project_items WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
      : null;
    const info = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    if (prev) await recomputeProgress(req.userId, prev.project_id);
    res.json({ ok: true });
  });
}

// ---- Habit logs (toggle by habit+date) ----
router.get('/habit_logs', async (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM habit_logs WHERE user_id = ?';
  const params = [req.userId];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  res.json(await db.prepare(sql).all(...params));
});

router.post('/habit_logs/toggle', async (req, res) => {
  const { habit_id, date } = req.body || {};
  if (!habit_id || !date) return res.status(400).json({ error: 'habit_id and date required' });
  const existing = await db.prepare('SELECT id FROM habit_logs WHERE user_id=? AND habit_id=? AND date=?').get(req.userId, habit_id, date);
  if (existing) {
    await db.prepare('DELETE FROM habit_logs WHERE id = ?').run(existing.id);
    return res.json({ done: false });
  }
  await db.prepare('INSERT INTO habit_logs (user_id, habit_id, date) VALUES (?,?,?)').run(req.userId, habit_id, date);
  res.json({ done: true });
});

// ---- Health (upsert by date) ----
router.get('/health', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM health WHERE user_id = ? ORDER BY date DESC LIMIT 90').all(req.userId);
  res.json(rows);
});

router.post('/health', async (req, res) => {
  const { date, weight, sleep_hours, water_glasses, steps, mood, notes } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date required' });
  await db.prepare(`INSERT INTO health (user_id, date, weight, sleep_hours, water_glasses, steps, mood, notes)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      weight=excluded.weight, sleep_hours=excluded.sleep_hours, water_glasses=excluded.water_glasses,
      steps=excluded.steps, mood=excluded.mood, notes=excluded.notes`)
    .run(req.userId, date, weight ?? null, sleep_hours ?? null, water_glasses ?? null, steps ?? null, mood ?? null, notes || '');
  res.json(await db.prepare('SELECT * FROM health WHERE user_id=? AND date=?').get(req.userId, date));
});

router.delete('/health/:id', async (req, res) => {
  await db.prepare('DELETE FROM health WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// ---- Dashboard summary ----
router.get('/dashboard', async (req, res) => {
  const uid = req.userId;
  // client sends its local date; fall back to server date
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  res.json({
    today,
    tasksToday: await db.prepare('SELECT * FROM tasks WHERE user_id=? AND date=? ORDER BY status ASC, time ASC').all(uid, today),
    overdueTasks: (await db.prepare("SELECT COUNT(*) c FROM tasks WHERE user_id=? AND date < ? AND status != 'done'").get(uid, today)).c,
    runningProjects: await db.prepare("SELECT * FROM projects WHERE user_id=? AND status='running' ORDER BY end_date ASC LIMIT 6").all(uid),
    upcomingProjects: await db.prepare("SELECT * FROM projects WHERE user_id=? AND status='upcoming' ORDER BY start_date ASC LIMIT 4").all(uid),
    plans: await db.prepare('SELECT * FROM plans WHERE user_id=? ORDER BY estimate_date ASC LIMIT 4').all(uid),
    monthExpenses: (await db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND date >= ? AND type='expense'").get(uid, monthStart)).total,
    monthIncome: (await db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND date >= ? AND type='income'").get(uid, monthStart)).total,
    habits: await db.prepare('SELECT h.*, (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id=h.id AND l.date=?) AS done_today FROM habits h WHERE h.user_id=? AND h.archived=0').all(today, uid),
    eventsToday: await db.prepare('SELECT * FROM events WHERE user_id=? AND date=? ORDER BY start_time').all(uid, today),
    upcomingEvents: await db.prepare('SELECT * FROM events WHERE user_id=? AND date > ? ORDER BY date, start_time LIMIT 5').all(uid, today),
    latestHealth: await db.prepare('SELECT * FROM health WHERE user_id=? ORDER BY date DESC LIMIT 1').get(uid) || null,
    activeTrip: await db.prepare("SELECT * FROM trips WHERE user_id=? AND status != 'completed' ORDER BY start_date ASC LIMIT 1").get(uid) || null,
    ideasCount: (await db.prepare('SELECT COUNT(*) c FROM ideas WHERE user_id=?').get(uid)).c,
  });
});

module.exports = router;
