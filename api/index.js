// Vercel serverless entry — every route (static + API) is handled by the
// same Express app. Wait for Neon/SQLite schema init before the first request.
// Telegram daily reports run via Vercel Cron → GET/POST /api/cron/telegram
// (see vercel.json crons + CRON_SECRET env). Local server uses startScheduler().
const app = require('../server/app');
const { ready } = require('../server/db');

module.exports = async (req, res) => {
  await ready;
  return app(req, res);
};
