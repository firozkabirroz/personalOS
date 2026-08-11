const app = require('./app');
const { startScheduler } = require('./telegram');

const PORT = process.env.PORT || 4321;

app.listen(PORT, () => {
  console.log(`\n  Personal OS running at  http://localhost:${PORT}\n`);
  startScheduler();
});
