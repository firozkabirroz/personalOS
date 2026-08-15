const { ready } = require('./db');
const app = require('./app');
const { startScheduler } = require('./telegram');

const PORT = process.env.PORT || 4321;

ready.then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Personal OS running at  http://localhost:${PORT}\n`);
    startScheduler();
  });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
