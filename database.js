/**
 * ᴅᴀᴛᴀʙᴀꜱᴇ — VIPER BOT MD
 *
 * Storage strategy:
 *   • If DATABASE_URL is set (production/fly.io) → PostgreSQL
 *     All bot data (users EXP, warnings, group settings, etc.) is stored in
 *     a `bot_data` table as JSON blobs, so EXP survives restarts/redeploys.
 *   • If DATABASE_URL is not set (local dev) → JSON files as before
 *
 * This is the root cause of EXP never persisting: the JSON files live on
 * Fly.io's ephemeral container filesystem and reset on every restart.
 */

const fs   = require('fs');
const path = require('path');

// ── Determine storage backend ─────────────────────────────────────────────────
const USE_POSTGRES = !!process.env.DATABASE_URL;
let pgPool = null;

// Session isolation key — CRITICAL for multi-tenant Postgres deployments.
// Every bot instance MUST have a unique SESSION_ID env var set.
// Without this, all bots share the same 'settings', 'users', 'groups' rows
// in Postgres, causing cross-session data leakage (bot names, menu images,
// group settings and user EXP all bleed between different owners).
// File mode is already isolated per-session via SESSION_DIR folder paths.
const SESSION_SCOPE = (process.env.SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
const scopedKey = (key) => `${SESSION_SCOPE}:${key}`;

if (USE_POSTGRES) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pgPool.on('error', err => console.error('[DB] Pool error:', err.message));
    // Create the bot_data table if it doesn't exist (runs once on startup)
    pgPool.query(`
      CREATE TABLE IF NOT EXISTS bot_data (
        store_key   TEXT PRIMARY KEY,
        store_value JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => console.log('[DB] bot_data table ready (PostgreSQL)'))
      .catch(e => console.error('[DB] Failed to init bot_data table:', e.message));
  } catch (e) {
    console.error('[DB] pg module error — falling back to JSON files:', e.message);
    pgPool = null;
  }
}

// ── PostgreSQL helpers ────────────────────────────────────────────────────────
// Each "table" (users, groups, warnings, mods, settings) is one row in bot_data
// keyed by store_key. The value is a JSON object.
// This is simple, reliable, and avoids schema migrations.

async function pgRead(key) {
  try {
    const res = await pgPool.query(
      'SELECT store_value FROM bot_data WHERE store_key = $1',
      [scopedKey(key)]
    );
    return res.rows[0]?.store_value || {};
  } catch (e) {
    console.error(`[DB] pgRead(${key}) error:`, e.message);
    return {};
  }
}

async function pgWrite(key, value) {
  try {
    await pgPool.query(
      `INSERT INTO bot_data (store_key, store_value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (store_key) DO UPDATE
         SET store_value = $2::jsonb, updated_at = NOW()`,
      [scopedKey(key), JSON.stringify(value)]
    );
    return true;
  } catch (e) {
    console.error(`[DB] pgWrite(${key}) error:`, e.message);
    return false;
  }
}

// ── JSON file helpers (local dev fallback) ────────────────────────────────────
const SESSION_DIR = process.env.SESSION_DIR
  ? path.resolve(process.env.SESSION_DIR)
  : path.join(__dirname, 'session_default');

const DB_PATH     = path.join(SESSION_DIR, 'db');
const FILE_PATHS  = {
  groups:   path.join(DB_PATH, 'groups.json'),
  users:    path.join(DB_PATH, 'users.json'),
  warnings: path.join(DB_PATH, 'warnings.json'),
  mods:     path.join(DB_PATH, 'mods.json'),
  settings: path.join(DB_PATH, 'settings.json'),
};

if (!USE_POSTGRES) {
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
  const defaults = { groups: {}, users: {}, warnings: {}, mods: { moderators: [] }, settings: {} };
  for (const [key, file] of Object.entries(FILE_PATHS)) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults[key], null, 2));
  }
}

function fileRead(key) {
  try { return JSON.parse(fs.readFileSync(FILE_PATHS[key], 'utf-8')); }
  catch { return key === 'mods' ? { moderators: [] } : {}; }
}

function fileWrite(key, value) {
  try { fs.writeFileSync(FILE_PATHS[key], JSON.stringify(value, null, 2)); return true; }
  catch { return false; }
}

// ── Unified read/write — auto-selects backend ─────────────────────────────────
// Sync wrappers for backwards-compat. Async callers use readAsync/writeAsync.
// NOTE: Postgres calls are async. For EXP (hot path), we use readAsync/writeAsync.
// For backwards-compat with existing sync callers, pgRead is called then cached.

// Simple in-memory write-back cache to avoid hammering Postgres on every message
const _cache = new Map();
const _dirty = new Set();

async function readAsync(key) {
  if (_cache.has(key)) return _cache.get(key);
  const data = USE_POSTGRES ? await pgRead(key) : fileRead(key);
  _cache.set(key, data);
  return data;
}

async function writeAsync(key, value) {
  _cache.set(key, value);
  if (USE_POSTGRES) {
    return pgWrite(key, value);
  } else {
    return fileWrite(key, value);
  }
}

// Flush dirty cache entries every 10 seconds — batches writes
setInterval(async () => {
  for (const key of _dirty) {
    const val = _cache.get(key);
    if (val !== undefined) {
      if (USE_POSTGRES) await pgWrite(key, val).catch(() => {});
      else fileWrite(key, val);
    }
  }
  _dirty.clear();
}, 10_000);

// Sync read — returns cache if available, else empty (safe for init reads)
function readSync(key) {
  return _cache.get(key) || (USE_POSTGRES ? {} : fileRead(key));
}

// ── Group Settings ────────────────────────────────────────────────────────────
const getGroupSettings = (groupId) => {
  const config = require('./config');
  const groups = readSync('groups');
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    _cache.set('groups', groups);
    _dirty.add('groups');
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = readSync('groups');
  groups[groupId] = { ...getGroupSettings(groupId), ...settings };
  _cache.set('groups', groups);
  _dirty.add('groups');
  return true;
};

const getAllGroupSettings = () => readSync('groups');

// Prime groups cache on startup
if (!USE_POSTGRES) {
  _cache.set('groups', fileRead('groups'));
  _cache.set('mods', fileRead('mods'));
  _cache.set('settings', fileRead('settings'));
  _cache.set('warnings', fileRead('warnings'));
  _cache.set('users', fileRead('users'));
} else {
  // Prime caches async from Postgres on startup
  Promise.all([
    readAsync('groups'),
    readAsync('mods'),
    readAsync('settings'),
    readAsync('warnings'),
    readAsync('users'),
  ]).then(() => console.log('[DB] Cache primed from PostgreSQL')).catch(() => {});
}

// ── Warnings ──────────────────────────────────────────────────────────────────
const addWarning = (groupId, userId, reason) => {
  const config = require('./config');
  const w = readSync('warnings');
  if (!w[groupId]) w[groupId] = {};
  if (!w[groupId][userId]) w[groupId][userId] = { count: 0, reasons: [] };
  w[groupId][userId].count++;
  w[groupId][userId].reasons.push({ reason, date: new Date().toISOString() });
  _cache.set('warnings', w);
  _dirty.add('warnings');
  return { count: w[groupId][userId].count, maxWarnings: config.maxWarnings };
};

const getWarnings = (groupId, userId) => {
  const w = readSync('warnings');
  return w[groupId]?.[userId] || { count: 0, reasons: [] };
};

const clearWarnings = (groupId, userId) => {
  const w = readSync('warnings');
  if (w[groupId]?.[userId]) { delete w[groupId][userId]; _cache.set('warnings', w); _dirty.add('warnings'); }
};

const resetGroupWarnings = (groupId) => {
  const w = readSync('warnings');
  if (w[groupId]) { delete w[groupId]; _cache.set('warnings', w); _dirty.add('warnings'); }
};

// ── User tracking (EXP, level, etc.) ─────────────────────────────────────────
// updateUser and getUser are the hot path — called on every chat message.
// They use the in-memory cache + dirty-flag write-back so Postgres isn't
// hammered on every single message, but data still persists across restarts.

const updateUser = (userId, data) => {
  const u = readSync('users');
  u[userId] = { ...(u[userId] || {}), ...data, lastSeen: new Date().toISOString() };
  _cache.set('users', u);
  _dirty.add('users'); // written to Postgres/file in 10s batch
};

const getUser = (userId) => {
  return readSync('users')[userId] || null;
};

// ── Moderators ────────────────────────────────────────────────────────────────
const addModerator = (number) => {
  const m = readSync('mods');
  if (!m.moderators) m.moderators = [];
  if (!m.moderators.includes(number)) { m.moderators.push(number); _cache.set('mods', m); _dirty.add('mods'); }
};
const removeModerator = (number) => {
  const m = readSync('mods');
  m.moderators = (m.moderators || []).filter(n => n !== number);
  _cache.set('mods', m); _dirty.add('mods');
};
const isModerator = (number) => (readSync('mods').moderators || []).includes(number);
const getModerators = () => readSync('mods').moderators || [];

// ── Per-session bot settings ──────────────────────────────────────────────────
const getSettings = () => readSync('settings');
const updateSettings = (data) => {
  // IMPORTANT: always read the current cached value (or {} if not yet primed).
  // In Postgres mode, if the cache hasn't been primed yet and we merge into {},
  // we would wipe all existing settings for this session. The async prime at
  // startup fills the cache before any command is processed, so in practice
  // readSync will have the right data. But as a safety net we also trigger an
  // async re-prime here if the settings cache is empty.
  const s = readSync('settings');
  if (USE_POSTGRES && Object.keys(s).length === 0) {
    // Cache not ready yet — schedule this write after the prime resolves
    readAsync('settings').then(existing => {
      const merged = { ...existing, ...data };
      _cache.set('settings', merged);
      if (USE_POSTGRES) pgWrite('settings', merged).catch(() => {});
      else fileWrite('settings', merged);
    }).catch(() => {});
    return;
  }
  const merged = { ...s, ...data };
  _cache.set('settings', merged);
  _dirty.add('settings');
};
const getSetting = (key, fallback = null) => {
  const s = readSync('settings');
  // In Postgres mode: if the cache is empty it means the async prime hasn't
  // completed yet. Return the fallback rather than a wrong value. The next
  // call (after prime) will return the correct persisted value.
  return s.hasOwnProperty(key) ? s[key] : fallback;
};

module.exports = {
  getGroupSettings, updateGroupSettings, getAllGroupSettings,
  addWarning, getWarnings, clearWarnings, resetGroupWarnings,
  updateUser, getUser,
  addModerator, removeModerator, isModerator, getModerators,
  getSettings, updateSettings, getSetting,
  DB_PATH,
};
