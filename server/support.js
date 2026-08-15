const express = require('express');
const { db } = require('./db');
const { logActivity } = require('./platform');

const STAFF_ROLES = ['owner', 'manager', 'support'];

async function getUser(uid) {
  return await db.prepare('SELECT id, username, name, role FROM users WHERE id=?').get(uid);
}
function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

const router = express.Router();

// List tickets: staff see everyone's, customers see only their own
router.get('/support/tickets', async (req, res) => {
  const me = await getUser(req.userId);
  let sql, params;
  if (isStaff(me.role)) {
    sql = `SELECT t.*, u.username, u.name AS user_name,
           (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
           FROM tickets t JOIN users u ON u.id = t.user_id`;
    params = [];
    if (req.query.status) { sql += ' WHERE t.status = ?'; params.push(req.query.status); }
    sql += ' ORDER BY t.updated_at DESC';
  } else {
    sql = `SELECT t.*, (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
           FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`;
    params = [req.userId];
  }
  res.json(await db.prepare(sql).all(...params));
});

router.post('/support/tickets', async (req, res) => {
  const { subject, message } = req.body || {};
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
  const info = await db.prepare('INSERT INTO tickets (user_id, subject) VALUES (?,?)').run(req.userId, subject.trim());
  await db.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, message) VALUES (?,?,?)').run(info.lastInsertRowid, req.userId, message.trim());

  const me = await getUser(req.userId);
  await logActivity({ userId: req.userId, type: 'ticket_created', message: `${me.username} opened ticket: ${subject.trim()}` });
  const owner = await db.prepare("SELECT id FROM users WHERE role='owner' LIMIT 1").get();
  if (owner && !isStaff(me.role)) {
    try {
      const { send, escapeHtml } = require('./telegram');
      send(owner.id, `🎫 <b>New support ticket</b>\nFrom: ${escapeHtml(me.username)}\nSubject: ${escapeHtml(subject.trim())}`).catch(() => {});
    } catch {}
  }
  res.json(await db.prepare('SELECT * FROM tickets WHERE id=?').get(info.lastInsertRowid));
});

async function loadTicket(req, res, next) {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const me = await getUser(req.userId);
  if (!isStaff(me.role) && ticket.user_id !== req.userId) return res.status(403).json({ error: 'Not your ticket' });
  req.ticket = ticket;
  req.me = me;
  next();
}

router.get('/support/tickets/:id', loadTicket, async (req, res) => {
  const messages = await db.prepare(`SELECT m.*, u.username, u.name, u.role FROM ticket_messages m
    JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id ASC`).all(req.params.id);
  const customer = await db.prepare('SELECT username, name FROM users WHERE id=?').get(req.ticket.user_id);
  res.json({ ticket: req.ticket, customer, messages });
});

router.post('/support/tickets/:id/reply', loadTicket, async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
  await db.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, message) VALUES (?,?,?)').run(req.ticket.id, req.userId, message.trim());
  const staffReplying = isStaff(req.me.role);
  const newStatus = staffReplying ? 'pending' : 'open'; // pending = waiting on customer, open = needs staff attention
  await db.prepare("UPDATE tickets SET status=?, updated_at=datetime('now') WHERE id=?").run(newStatus, req.ticket.id);

  if (!staffReplying) {
    // customer replied — notify assigned staff or the owner
    const notifyId = req.ticket.assigned_to || (await db.prepare("SELECT id FROM users WHERE role='owner' LIMIT 1").get())?.id;
    if (notifyId) {
      try {
        const { send, escapeHtml } = require('./telegram');
        send(notifyId, `💬 <b>Ticket reply</b>\nFrom: ${escapeHtml(req.me.username)}\nSubject: ${escapeHtml(req.ticket.subject)}`).catch(() => {});
      } catch {}
    }
  }
  res.json({ ok: true, status: newStatus });
});

router.post('/support/tickets/:id/status', loadTicket, async (req, res) => {
  if (!isStaff(req.me.role)) return res.status(403).json({ error: 'Only staff can change ticket status' });
  const { status } = req.body || {};
  if (!['open', 'pending', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.prepare("UPDATE tickets SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.ticket.id);
  res.json({ ok: true });
});

router.post('/support/tickets/:id/assign', loadTicket, async (req, res) => {
  if (!isStaff(req.me.role)) return res.status(403).json({ error: 'Staff only' });
  const { assigned_to } = req.body || {};
  await db.prepare('UPDATE tickets SET assigned_to=? WHERE id=?').run(assigned_to || null, req.ticket.id);
  res.json({ ok: true });
});

module.exports = { router, isStaff, STAFF_ROLES };
