const { db, getSetting, setSetting, logActivity } = require('./db');

function ownerId() {
  return db.prepare("SELECT id FROM users WHERE role='owner' ORDER BY id ASC LIMIT 1").get()?.id || null;
}

function getPlatformSetting(key) {
  const oid = ownerId();
  return oid ? getSetting(oid, key) : '';
}

function setPlatformSetting(key, value) {
  const oid = ownerId();
  if (oid) setSetting(oid, key, value);
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

module.exports = { ownerId, getPlatformSetting, setPlatformSetting, mask, logActivity };
