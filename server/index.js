const express = require('express');
const path = require('path');
const { router: authRouter, requireAuth } = require('./auth');
const routes = require('./routes');
const { router: filesRouter } = require('./files');
const settingsRouter = require('./settings');
const aiRouter = require('./ai');
const integrationsRouter = require('./integrations');
const { router: telegramRouter, startScheduler } = require('./telegram');
const { router: billingRouter, publicRouter: billingPublicRouter, subscriptionGate } = require('./billing');
const { router: supportRouter } = require('./support');
const { router: adminRouter } = require('./admin');

const app = express();
const PORT = process.env.PORT || 4321;

// Behind cPanel/Passenger or any reverse proxy: trust X-Forwarded-* so
// req.protocol resolves to https (needed for the Google OAuth redirect URI)
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
// Standalone admin panel — mounted before the root static so it can never be
// shadowed by a future public/admin/* file
app.use('/admin', express.static(path.join(__dirname, '..', 'public-admin')));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Marketing/sales page — served statically; on a real deployment this is
// usually put on the root domain via a separate nginx block instead
app.use('/landing', express.static(path.join(__dirname, '..', 'public-landing')));

app.use('/api/auth', authRouter);
app.use('/api', billingPublicRouter);

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

app.listen(PORT, () => {
  console.log(`\n  Personal OS running at  http://localhost:${PORT}\n`);
  startScheduler();
});
