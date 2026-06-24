const express = require('express');
const path = require('path');
const { router: authRouter, requireAuth } = require('./auth');
const routes = require('./routes');
const { router: filesRouter } = require('./files');
const settingsRouter = require('./settings');
const aiRouter = require('./ai');
const integrationsRouter = require('./integrations');
const { router: telegramRouter, startScheduler } = require('./telegram');
const { router: billingRouter, subscriptionGate } = require('./billing');

const app = express();
const PORT = process.env.PORT || 4321;

// Behind cPanel/Passenger or any reverse proxy: trust X-Forwarded-* so
// req.protocol resolves to https (needed for the Google OAuth redirect URI)
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRouter);

// Google OAuth callback must be reachable without the Bearer header
app.use('/api', (req, res, next) => {
  if (req.path === '/google/callback') return integrationsRouter(req, res, next);
  next();
});

app.use('/api', requireAuth, subscriptionGate);
app.use('/api', requireAuth, billingRouter);
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
