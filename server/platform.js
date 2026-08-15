const { db, getSetting, setSetting, logActivity } = require('./db');

async function ownerId() {
  const row = await db.prepare("SELECT id FROM users WHERE role='owner' ORDER BY id ASC LIMIT 1").get();
  return row?.id || null;
}

async function getPlatformSetting(key) {
  const oid = await ownerId();
  return oid ? getSetting(oid, key) : '';
}

async function setPlatformSetting(key, value) {
  const oid = await ownerId();
  if (oid) await setSetting(oid, key, value);
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

module.exports = { ownerId, getPlatformSetting, setPlatformSetting, mask, logActivity };
