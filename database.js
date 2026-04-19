/**
 * ᴅᴀᴛᴀʙᴀꜱᴇ — VIPER BOT MD
 * Per-session storage: reads SESSION_DIR from env.
 * Each paired number gets its own isolated DB folder.
 */

const fs   = require('fs');
const path = require('path');

// ── Resolve per-session DB path ──────────────────────────────────────────────
const SESSION_DIR = process.env.SESSION_DIR
  ? path.resolve(process.env.SESSION_DIR)
  : path.join(__dirname, 'session_default');

const DB_PATH    = path.join(SESSION_DIR, 'db');
const GROUPS_DB  = path.join(DB_PATH, 'groups.json');
const USERS_DB   = path.join(DB_PATH, 'users.json');
const WARNINGS_DB= path.join(DB_PATH, 'warnings.json');
const MODS_DB    = path.join(DB_PATH, 'mods.json');
const SETTINGS_DB= path.join(DB_PATH, 'settings.json');

if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

const _init = (f, def = {}) => { if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(def, null, 2)); };
_init(GROUPS_DB, {});
_init(USERS_DB, {});
_init(WARNINGS_DB, {});
_init(MODS_DB, { moderators: [] });
_init(SETTINGS_DB, {});

// ── Low-level helpers ─────────────────────────────────────────────────────────
const read = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); }
  catch { return {}; }
};
const write = (f, d) => {
  try { fs.writeFileSync(f, JSON.stringify(d, null, 2)); return true; }
  catch { return false; }
};

// ── Group Settings ────────────────────────────────────────────────────────────
const getGroupSettings = (groupId) => {
  const config = require('./config');
  const groups = read(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    write(GROUPS_DB, groups);
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = read(GROUPS_DB);
  groups[groupId] = { ...getGroupSettings(groupId), ...settings };
  return write(GROUPS_DB, groups);
};

const getAllGroupSettings = () => read(GROUPS_DB);

// ── Warnings ──────────────────────────────────────────────────────────────────
const addWarning = (groupId, userId, reason) => {
  const config = require('./config');
  const w = read(WARNINGS_DB);
  if (!w[groupId]) w[groupId] = {};
  if (!w[groupId][userId]) w[groupId][userId] = { count: 0, reasons: [] };
  w[groupId][userId].count++;
  w[groupId][userId].reasons.push({ reason, date: new Date().toISOString() });
  write(WARNINGS_DB, w);
  return { count: w[groupId][userId].count, maxWarnings: config.maxWarnings };
};

const getWarnings = (groupId, userId) => {
  const w = read(WARNINGS_DB);
  return w[groupId]?.[userId] || { count: 0, reasons: [] };
};

const clearWarnings = (groupId, userId) => {
  const w = read(WARNINGS_DB);
  if (w[groupId]?.[userId]) { delete w[groupId][userId]; write(WARNINGS_DB, w); }
};

const resetGroupWarnings = (groupId) => {
  const w = read(WARNINGS_DB);
  if (w[groupId]) { delete w[groupId]; write(WARNINGS_DB, w); }
};

// ── User tracking ─────────────────────────────────────────────────────────────
const updateUser = (userId, data) => {
  const u = read(USERS_DB);
  u[userId] = { ...(u[userId] || {}), ...data, lastSeen: new Date().toISOString() };
  write(USERS_DB, u);
};

const getUser = (userId) => read(USERS_DB)[userId] || null;

// ── Moderators ────────────────────────────────────────────────────────────────
const addModerator = (number) => {
  const m = read(MODS_DB);
  if (!m.moderators.includes(number)) { m.moderators.push(number); write(MODS_DB, m); }
};
const removeModerator = (number) => {
  const m = read(MODS_DB);
  m.moderators = m.moderators.filter(n => n !== number);
  write(MODS_DB, m);
};
const isModerator = (number) => read(MODS_DB).moderators.includes(number);
const getModerators = () => read(MODS_DB).moderators;

// ── Per-session bot settings (override config for this session) ───────────────
const getSettings = () => read(SETTINGS_DB);
const updateSettings = (data) => {
  const s = read(SETTINGS_DB);
  write(SETTINGS_DB, { ...s, ...data });
};
const getSetting = (key, fallback = null) => {
  const s = read(SETTINGS_DB);
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
