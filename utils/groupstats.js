// utils/groupStats.js
// Per-session group stats — each bot instance writes to its own SESSION_DIR.
const fs   = require('fs');
const path = require('path');

// Respect SESSION_DIR so multi-tenant sessions never share the same file.
const SESSION_DIR = process.env.SESSION_DIR
  ? path.resolve(process.env.SESSION_DIR)
  : path.join(__dirname, '../session_default');

const DB_PATH = path.join(SESSION_DIR, 'db', 'groupStats.json');

function loadDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveDB(data) {
    try {
        // Ensure the directory exists before writing (handles first-run & Render ephemeral fs)
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[groupStats] save error:', err);
    }
}

function addMessage(groupId, senderId) {
    const db  = loadDB();
    const today = new Date().toISOString().slice(0, 10);
    const hour  = new Date().getHours().toString();

    if (!db[groupId]) db[groupId] = {};
    if (!db[groupId][today]) {
        db[groupId][today] = { total: 0, users: {}, hours: {} };
    }

    const g = db[groupId][today];
    g.total++;
    g.users[senderId]  = (g.users[senderId]  || 0) + 1;
    g.hours[hour]      = (g.hours[hour]       || 0) + 1;

    saveDB(db);
}

function getStats(groupId) {
    const db    = loadDB();
    const today = new Date().toISOString().slice(0, 10);
    if (!db[groupId] || !db[groupId][today]) return null;
    return db[groupId][today];
}

module.exports = { addMessage, getStats };
