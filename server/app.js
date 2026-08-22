// Express app factory — shared by the normal server (server/index.js)
// and the Vercel serverless entry (api/index.js).
const express = require('express');
const path = require('path');
const { router: authRouter, requireAuth } = require('./auth');
const routes = require('./routes');
const { router: filesRouter } = require('./files');
const settingsRouter = require('./settings');
const aiRouter = require('./ai');
const integrationsRouter = require('./integrations');
const { router: telegramRouter, runTelegramTick } = require('./telegram');
const { router: billingRouter, publicRouter: billingPublicRouter, subscriptionGate } = require('./billing');
const { router: supportRouter } = require('./support');
const { router: adminRouter } = require('./admin');

const app = express();

// Behind cPanel/Passenger, Vercel, or any reverse proxy: trust X-Forwarded-*
// so req.protocol resolves to https (needed for the OAuth redirect URIs)
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
// Landing is public/index.html (Vercel also serves public/ at /).
// App SPA is public/app/, admin SPA is public/admin/.
const publicDir = path.join(__dirname, '..', 'public');
app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(publicDir, 'admin', 'index.html')));
app.get(['/app', '/app/'], (req, res) => res.sendFile(path.join(publicDir, 'app', 'index.html')));
app.get('/landing', (req, res) => res.redirect('/'));
app.use(express.static(publicDir));

app.use('/api/auth', authRouter);
app.use('/api', billingPublicRouter);

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !process.env.VERCEL;
  return (req.headers.authorization || '') === `Bearer ${secret}`;
}

async function telegramCron(req, res) {
  if (!cronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized — set CRON_SECRET in Vercel env' });
  }
  try {
    await runTelegramTick();
    res.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    console.error('Telegram cron:', e);
    res.status(500).json({ error: e.message || 'Cron failed' });
  }
}
app.get('/api/cron/telegram', telegramCron);
app.post('/api/cron/telegram', telegramCron);

// OAuth callbacks must be reachable without the Bearer header
app.use('/api', (req, res, next) => {
  if (req.path === '/google/callback' || req.path === '/notion/callback') {
    return integrationsRouter(req, res, next);
  }
  next();
});

// App access is free for every registered user — no subscription gate.
app.use('/api', requireAuth, subscriptionGate);
app.use('/api', requireAuth, billingRouter);
app.use('/api', requireAuth, adminRouter);
app.use('/api', requireAuth, supportRouter);
app.use('/api', requireAuth, routes);
app.use('/api', requireAuth, filesRouter);
app.use('/api', requireAuth, settingsRouter);
app.use('/api', requireAuth, aiRouter);
app.use('/api', requireAuth, integrationsRouter);
app.use('/api', requireAuth, telegramRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

module.exports = app;
