// Vercel serverless entry — every route (static + API) is handled by the
// same Express app. Wait for Neon/SQLite schema init before the first request.
// The Telegram scheduler is NOT started here: serverless functions are
// short-lived, so background timers would never fire reliably.
const app = require('../server/app');
const { ready } = require('../server/db');

module.exports = async (req, res) => {
  await ready;
  return app(req, res);
};
