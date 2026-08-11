// Vercel serverless entry — every route (static + API) is handled by the
// same Express app. The Telegram scheduler is NOT started here: serverless
// functions are short-lived, so background timers would never fire reliably.
module.exports = require('../server/app');
