const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

const router = express.Router();

router.get('/files', async (req, res) => {
  let sql = `SELECT f.*, p.name AS project_name, p.color AS project_color
             FROM files f LEFT JOIN projects p ON p.id = f.project_id
             WHERE f.user_id = ?`;
  const params = [req.userId];
  if (req.query.project_id) { sql += ' AND f.project_id = ?'; params.push(req.query.project_id); }
  sql += ' ORDER BY f.created_at DESC';
  res.json(await db.prepare(sql).all(...params));
});

router.post('/files', upload.array('files', 20), async (req, res) => {
  const projectId = req.body.project_id || null;
  const saved = [];
  for (const f of req.files || []) {
    const info = await db.prepare(`INSERT INTO files (user_id, project_id, filename, original, mime, size)
      VALUES (?,?,?,?,?,?)`).run(req.userId, projectId, f.filename, f.originalname, f.mimetype, f.size);
    saved.push(await db.prepare('SELECT * FROM files WHERE id=?').get(info.lastInsertRowid));
  }
  res.json(saved);
});

router.get('/files/:id/download', async (req, res) => {
  const file = await db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.download(path.join(UPLOAD_DIR, file.filename), file.original);
});

router.put('/files/:id', async (req, res) => {
  const file = await db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!file) return res.status(404).json({ error: 'File not found' });
  await db.prepare('UPDATE files SET project_id=? WHERE id=?').run(req.body.project_id || null, file.id);
  res.json(await db.prepare('SELECT * FROM files WHERE id=?').get(file.id));
});

router.delete('/files/:id', async (req, res) => {
  const file = await db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!file) return res.status(404).json({ error: 'File not found' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, file.filename)); } catch {}
  await db.prepare('DELETE FROM files WHERE id=?').run(file.id);
  res.json({ ok: true });
});

module.exports = { router, UPLOAD_DIR };
