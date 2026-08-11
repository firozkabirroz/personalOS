const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, getSetting, setSetting } = require('./db');
const { getPlatformSetting, logActivity } = require('./platform');
const { UPLOAD_DIR } = require('./files');

const router = express.Router();

// ============ GOOGLE (Calendar + Drive) ============
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

function redirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/google/callback`;
}

router.get('/google/auth-url', (req, res) => {
  const clientId = getPlatformSetting('platform_google_client_id');
  if (!clientId) return res.status(400).json({ error: 'Google isn\'t set up by the admin yet. Ask them to configure it in Admin → Integrations.' });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: String(req.userId),
  });
  res.json({ url, redirect_uri: redirectUri(req) });
});

// OAuth callback — no auth header here, identified via state
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.send(`<script>window.close()</script>Google authorization failed: ${error || 'no code'}`);
  const uid = parseInt(state, 10);
  const clientId = getPlatformSetting('platform_google_client_id');
  const clientSecret = getPlatformSetting('platform_google_client_secret');
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri(req), grant_type: 'authorization_code',
      }),
    });
    const tokens = await resp.json();
    if (!resp.ok) throw new Error(tokens.error_description || tokens.error);
    tokens.obtained_at = Date.now();
    setSetting(uid, 'google_tokens', JSON.stringify(tokens));
    logActivity({ userId: uid, type: 'google_connected', message: 'Connected Google Calendar/Drive' });
    res.send('<body style="font-family:sans-serif;background:#0f1117;color:#e2e4ea;display:grid;place-items:center;height:100vh"><div><h2>✅ Google connected</h2><p>You can close this window and return to Personal OS.</p></div></body>');
  } catch (e) {
    res.send(`<body style="font-family:sans-serif"><h3>Google connection failed</h3><p>${e.message}</p></body>`);
  }
});

async function googleToken(uid) {
  const raw = getSetting(uid, 'google_tokens');
  if (!raw) throw new Error('Google is not connected. Go to Settings → Integrations.');
  let tokens = JSON.parse(raw);
  const expired = !tokens.obtained_at || (Date.now() - tokens.obtained_at) > (tokens.expires_in - 120) * 1000;
  if (expired && tokens.refresh_token) {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: getPlatformSetting('platform_google_client_id'),
        client_secret: getPlatformSetting('platform_google_client_secret'),
        grant_type: 'refresh_token',
      }),
    });
    const fresh = await resp.json();
    if (!resp.ok) throw new Error('Google token refresh failed — reconnect in Settings.');
    tokens = { ...tokens, ...fresh, obtained_at: Date.now() };
    setSetting(uid, 'google_tokens', JSON.stringify(tokens));
  }
  return tokens.access_token;
}

router.post('/google/calendar/sync', async (req, res) => {
  try {
    const token = await googleToken(req.userId);
    const timeMin = new Date(Date.now() - 7 * 86400e3).toISOString();
    const timeMax = new Date(Date.now() + 90 * 86400e3).toISOString();
    const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
      new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' }),
      { headers: { authorization: `Bearer ${token}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || 'Calendar API error');

    db.prepare("DELETE FROM events WHERE user_id=? AND source='google'").run(req.userId);
    const insert = db.prepare('INSERT INTO events (user_id, title, date, start_time, end_time, source, external_id, notes) VALUES (?,?,?,?,?,?,?,?)');
    let count = 0;
    for (const ev of data.items || []) {
      const start = ev.start?.dateTime || ev.start?.date || '';
      const end = ev.end?.dateTime || '';
      insert.run(req.userId, ev.summary || '(no title)', start.slice(0, 10),
        start.length > 10 ? start.slice(11, 16) : '', end.length > 10 ? end.slice(11, 16) : '',
        'google', ev.id, ev.location || '');
      count++;
    }
    res.json({ ok: true, imported: count });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.get('/google/drive/list', async (req, res) => {
  try {
    const token = await googleToken(req.userId);
    const resp = await fetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      pageSize: '50', orderBy: 'modifiedTime desc',
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    }), { headers: { authorization: `Bearer ${token}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || 'Drive API error');
    res.json(data.files || []);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Upload one of the stored project files to Google Drive
router.post('/google/drive/upload/:fileId', async (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(req.params.fileId, req.userId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const token = await googleToken(req.userId);
    const content = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const boundary = 'pos_' + Date.now();
    const meta = JSON.stringify({ name: file.original });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${file.mime || 'application/octet-stream'}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || 'Drive upload failed');
    res.json({ ok: true, id: data.id, link: data.webViewLink });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ============ NOTION (OAuth one-click + legacy token) ============
function notionRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/notion/callback`;
}

router.get('/notion/auth-url', (req, res) => {
  const clientId = getPlatformSetting('platform_notion_client_id');
  if (!clientId) return res.status(400).json({ error: 'Notion isn\'t set up by the admin yet. Ask them to configure it in Admin → Integrations.' });
  const url = 'https://api.notion.com/v1/oauth/authorize?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: notionRedirectUri(req),
    state: String(req.userId),
  });
  res.json({ url, redirect_uri: notionRedirectUri(req) });
});

router.get('/notion/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.send(`<script>window.close()</script>Notion authorization failed: ${error || 'no code'}`);
  const uid = parseInt(state, 10);
  const clientId = getPlatformSetting('platform_notion_client_id');
  const clientSecret = getPlatformSetting('platform_notion_client_secret');
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: notionRedirectUri(req),
      }),
    });
    const tokens = await resp.json();
    if (!resp.ok) throw new Error(tokens.error_description || tokens.message || tokens.error || 'Token exchange failed');
    // Notion OAuth returns access_token (no refresh for most public integrations)
    setSetting(uid, 'notion_token', tokens.access_token);
    setSetting(uid, 'notion_tokens', JSON.stringify({ ...tokens, obtained_at: Date.now() }));
    logActivity({ userId: uid, type: 'notion_connected', message: 'Connected Notion via OAuth' });
    res.send('<body style="font-family:sans-serif;background:#0f1117;color:#e2e4ea;display:grid;place-items:center;height:100vh"><div><h2>✅ Notion connected</h2><p>You can close this window and return to Personal OS.</p></div></body>');
  } catch (e) {
    res.send(`<body style="font-family:sans-serif"><h3>Notion connection failed</h3><p>${e.message}</p></body>`);
  }
});

function notionHeaders(uid) {
  const token = getSetting(uid, 'notion_token');
  if (!token) throw new Error('Notion is not connected. Go to Settings and tap Connect Notion.');
  return {
    authorization: `Bearer ${token}`,
    'notion-version': '2022-06-28',
    'content-type': 'application/json',
  };
}

router.get('/notion/search', async (req, res) => {
  try {
    const resp = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: notionHeaders(req.userId),
      body: JSON.stringify({ query: req.query.q || '', page_size: 25, filter: { value: 'page', property: 'object' } }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message || 'Notion API error');
    const pages = (data.results || []).map(p => {
      const titleProp = Object.values(p.properties || {}).find(v => v.type === 'title');
      const title = titleProp?.title?.map(t => t.plain_text).join('') || p.title?.map?.(t => t.plain_text).join('') || '(untitled)';
      return { id: p.id, title, last_edited: p.last_edited_time };
    });
    res.json(pages);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

async function notionBlockText(uid, blockId, depth = 0) {
  if (depth > 2) return '';
  const resp = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, {
    headers: notionHeaders(uid),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.message || 'Notion API error');
  const lines = [];
  for (const b of data.results || []) {
    const rt = b[b.type]?.rich_text;
    if (rt) {
      const text = rt.map(t => t.plain_text).join('');
      if (text.trim()) {
        const prefix = b.type === 'bulleted_list_item' ? '• ' : b.type === 'numbered_list_item' ? '1. ' :
          b.type.startsWith('heading') ? '## ' : b.type === 'to_do' ? (b.to_do.checked ? '[x] ' : '[ ] ') : '';
        lines.push(prefix + text);
      }
    }
    if (b.has_children) {
      const child = await notionBlockText(uid, b.id, depth + 1);
      if (child) lines.push(child);
    }
  }
  return lines.join('\n');
}

// Import a Notion page as a brainstorming note
router.post('/notion/import', async (req, res) => {
  const { page_id, title } = req.body || {};
  if (!page_id) return res.status(400).json({ error: 'page_id required' });
  try {
    const content = await notionBlockText(req.userId, page_id);
    const info = db.prepare('INSERT INTO ideas (user_id, title, content, tags, color) VALUES (?,?,?,?,?)')
      .run(req.userId, title || 'Notion import', content || '(empty page)', 'notion', '#8b5cf6');
    res.json(db.prepare('SELECT * FROM ideas WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
