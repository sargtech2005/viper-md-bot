/**
 * ╔══════════════════════════════════════════════════╗
 * ║   VIPER BOT MD — Bot Process Manager             ║
 * ║   Render-compatible: creds persisted in Postgres ║
 * ╚══════════════════════════════════════════════════╝
 *
 * LOGGING: Zero log files on disk. stdout/stderr from child processes
 * is captured in-memory (ring buffer, 200 lines max per session).
 * Only 3 signal lines are ever emitted by the child: PAIR_CODE:,
 * BOT_STATUS:CONNECTED, LOGGED_OUT:. Everything else is discarded.
 * Ring buffers are deleted when a session stops.
 */

const { spawn }    = require('child_process');
const path         = require('path');
const fs           = require('fs');
const zlib         = require('zlib');
const { Sessions } = require('./db');

// ── Paths ──────────────────────────────────────────────────────────────────
const TMP_ROOT   = '/tmp/viper-sessions';
const ROOT_DIR   = path.join(__dirname, '..');
const NODE_ENTRY = path.join(ROOT_DIR, 'index.js');

if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });

// ── In-memory state ────────────────────────────────────────────────────────
const PROCS        = new Map(); // sessionId → { proc, phone }
const SSE_SUBS     = new Map(); // sessionId → Set<res>
const CREDS_TIMERS = new Map(); // sessionId → intervalId
const PAIR_CACHE   = new Map(); // sessionId → pair code string
const LOG_BUFFERS  = new Map(); // sessionId → string[] (ring, max 200 lines)

const LOG_MAX = 500; // increased from 200 — stores enough lines for real debugging

function sessionDir(phone) { return path.join(TMP_ROOT, phone); }

function isRunning(sessionId) {
  const e = PROCS.get(sessionId);
  if (!e) return false;
  try { process.kill(e.proc.pid, 0); return e.proc.exitCode === null; }
  catch { return false; }
}

// ── In-memory log buffer ───────────────────────────────────────────────────
function appendLog(sessionId, text) {
  if (!text) return;
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return;
  if (!LOG_BUFFERS.has(sessionId)) LOG_BUFFERS.set(sessionId, []);
  const buf = LOG_BUFFERS.get(sessionId);
  for (const l of lines) buf.push(l);
  // Keep ring buffer bounded
  if (buf.length > LOG_MAX) buf.splice(0, buf.length - LOG_MAX);
}

function clearLog(sessionId) {
  LOG_BUFFERS.delete(sessionId);
}

// ── SSE helpers ────────────────────────────────────────────────────────────
function emit(sessionId, event, data) {
  const subs = SSE_SUBS.get(sessionId);
  if (!subs?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) { try { res.write(payload); } catch {} }
}

function subscribe(sessionId, res) {
  if (!SSE_SUBS.has(sessionId)) SSE_SUBS.set(sessionId, new Set());
  SSE_SUBS.get(sessionId).add(res);
  // Replay cached pair code to late-joining SSE clients
  const cached = PAIR_CACHE.get(sessionId);
  if (cached) {
    try { res.write(`event: pair_code\ndata: ${JSON.stringify({ code: cached })}\n\n`); } catch {}
  }
}

function unsubscribe(sessionId, res) {
  const subs = SSE_SUBS.get(sessionId);
  if (!subs) return;
  subs.delete(res);
  if (subs.size === 0) SSE_SUBS.delete(sessionId);
}

// ── Creds persistence ──────────────────────────────────────────────────────
async function saveCredsToDb(sessionId, phone) {
  const sd = sessionDir(phone);
  if (!fs.existsSync(sd)) return;
  try {
    const files = [];
    const walk = (dir, base = '') => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const rel  = base ? `${base}/${entry}` : entry;
        if (fs.statSync(full).isDirectory()) walk(full, rel);
        else files.push({ rel, data: fs.readFileSync(full).toString('base64') });
      }
    };
    walk(sd);
    if (!files.length) return;
    const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(files))).toString('base64');
    await Sessions.saveCreds(sessionId, b64);
  } catch (e) {
    // silent — creds save failure shouldn't crash anything
  }
}

async function restoreCredsFromDb(sessionId, phone) {
  try {
    const r   = await Sessions.loadCreds(sessionId);
    const b64 = r.rows[0]?.creds_data;
    if (!b64) return false;
    const files = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString());
    const sd    = sessionDir(phone);
    for (const { rel, data } of files) {
      const fullPath = path.join(sd, rel);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
    }
    return true;
  } catch {
    return false;
  }
}

function startCredsSync(sessionId, phone) {
  stopCredsSync(sessionId);
  const iv = setInterval(() => saveCredsToDb(sessionId, phone), 30_000);
  CREDS_TIMERS.set(sessionId, iv);
}

function stopCredsSync(sessionId) {
  const iv = CREDS_TIMERS.get(sessionId);
  if (iv) { clearInterval(iv); CREDS_TIMERS.delete(sessionId); }
}

// ── Signal watcher — reads from in-memory log buffer ──────────────────────
// During PAIRING: no deadline — stays alive until BOT_STATUS:CONNECTED.
// During normal boot: 120s deadline as a safety net.
function watchLog(sessionId, phone, { isPairing = false } = {}) {
  let seen = 0;
  let done = false;

  // Pairing mode: no deadline at all — wait forever for handshake
  // Normal mode: 120s safety net
  const deadline = isPairing ? null : Date.now() + 120_000;

  const iv = setInterval(async () => {
    // Only apply deadline in non-pairing mode
    if (!isPairing && (done || Date.now() > deadline)) {
      clearInterval(iv);
      if (!done) emit(sessionId, 'error', { message: 'Timed out. Please try again.' });
      return;
    }
    if (done) { clearInterval(iv); return; }

    try {
      const buf   = LOG_BUFFERS.get(sessionId) || [];
      const fresh = buf.slice(seen);
      seen = buf.length;

      for (const line of fresh) {
        if (!line.trim()) continue;

        if (line.includes('PAIR_CODE:')) {
          const code = line.split('PAIR_CODE:')[1].trim();
          PAIR_CACHE.set(sessionId, code);
          emit(sessionId, 'pair_code', { code });
        }
        if (line.includes('BOT_WARN:')) {
          const msg = line.split('BOT_WARN:')[1]?.trim() || '';
          emit(sessionId, 'warn', { message: msg });
        }
        if (line.includes('PAIR_ERROR:')) {
          // During pairing: surface the error but DON'T stop watching.
          // index.js will auto-restart the WS and emit a fresh PAIR_CODE.
          // Only stop if user manually cancels.
          const msg = line.split('PAIR_ERROR:')[1]?.trim() || 'Connection dropped';
          emit(sessionId, 'pair_retry', { message: `Reconnecting… (${msg})` });
          return; // keep iv alive — wait for next PAIR_CODE
        }
        if (line.includes('BOT_STATUS:CONNECTED')) {
          done = true; clearInterval(iv);
          PAIR_CACHE.delete(sessionId);
          emit(sessionId, 'connected', { message: 'Bot connected!' });
          await Sessions.updateStatus(sessionId, 'connected');
          await saveCredsToDb(sessionId, phone);
          clearLog(sessionId);
          return;
        }
        if (line.includes(`LOGGED_OUT:${phone}`) || line.includes('loggedOut')) {
          done = true; clearInterval(iv);
          PAIR_CACHE.delete(sessionId);
          stopCredsSync(sessionId);
          stopSession(sessionId);
          await Sessions.saveCreds(sessionId, null);
          await Sessions.updateStatus(sessionId, 'logged_out');
          emit(sessionId, 'logged_out', { message: 'Session logged out.' });
          clearLog(sessionId);
          return;
        }
      }
    } catch {}
  }, 1500);

  return () => { done = true; clearInterval(iv); };
}

// ── Start bot process ──────────────────────────────────────────────────────
async function startBot(sessionId, phone, { pairNumber = null } = {}) {
  if (isRunning(sessionId)) return;

  const hadCreds = await restoreCredsFromDb(sessionId, phone);
  const sd = sessionDir(phone);

  if (pairNumber && !hadCreds) {
    try {
      if (fs.existsSync(sd)) {
        const dbDir        = path.join(sd, 'db');
        const settingsFile = path.join(dbDir, 'settings.json');
        const savedSettings = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : null;
        fs.rmSync(sd, { recursive: true, force: true });
        if (savedSettings) {
          fs.mkdirSync(dbDir, { recursive: true });
          fs.writeFileSync(settingsFile, savedSettings);
        }
      }
    } catch {}
  }

  if (!fs.existsSync(sd)) fs.mkdirSync(sd, { recursive: true });

  // Pull initial_settings from bot_sessions row so we can pass them to the child
  let initSettingsEnv = '';
  try {
    const sr    = await Sessions.findById(sessionId);
    const initS = sr.rows[0]?.initial_settings;
    if (initS && typeof initS === 'object' && Object.keys(initS).length) {
      initSettingsEnv = JSON.stringify(initS);
    }
  } catch {}

  const env = {
    ...process.env,
    SESSION_DIR:    sd,
    SESSION_NUMBER: phone,

    // ── SESSION_ID ──────────────────────────────────────────────────────────
    // Scopes ALL bot_data Postgres keys to this session.
    // e.g. "default:settings" → "2348083086811:settings"
    // Without this every bot shares the same rows — one user's .setbotname
    // overwrites everyone else's on restart.
    SESSION_ID: phone,

    // ── OWNER_NUMBERS ───────────────────────────────────────────────────────
    // The session owner's phone number IS the bot owner.
    // Without this, isOwner() always returns false in groups because the
    // global OWNER_NUMBERS secret is the platform admin, not the session user.
    // Appended to whatever global OWNER_NUMBERS is set in fly.io secrets so
    // the platform admin can still control bots if needed.
    OWNER_NUMBERS: [process.env.OWNER_NUMBERS, phone].filter(Boolean).join(','),

    // ── INITIAL_SETTINGS ────────────────────────────────────────────────────
    // Passed on every start so database.js can seed Postgres if this session's
    // settings key is empty (i.e. brand new session, never saved settings yet).
    // Does nothing if settings already exist in Postgres — safe to pass always.
    ...(initSettingsEnv ? { INITIAL_SETTINGS: initSettingsEnv } : {}),
  };
  if (pairNumber && !hadCreds) env.PAIR_NUMBER = pairNumber;

  // ── Spawn with pipe stdio — NO log files written to disk ──────────────────
  clearLog(sessionId);
  const proc = spawn('node', [
    // ── High-performance Node.js flags for bot child process ──────────────
    '--max-old-space-size=1024',   // 1GB heap for bot worker (leaves room for web server)
    '--optimize-for-size',          // More aggressive GC — keeps heap lean
    '--gc-interval=100',            // More frequent GC — prevents long GC pauses
    NODE_ENTRY,
  ], {
    cwd:   ROOT_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Pipe stdout/stderr into in-memory ring buffer
  // Only the 3 signal lines matter; everything else is discarded at LOG_MAX
  proc.stdout.on('data', chunk => appendLog(sessionId, chunk.toString()));
  proc.stderr.on('data', chunk => appendLog(sessionId, chunk.toString()));

  PROCS.set(sessionId, { proc, phone });

  startCredsSync(sessionId, phone);

  proc.on('exit', async code => {
    PROCS.delete(sessionId);
    stopCredsSync(sessionId);
    await saveCredsToDb(sessionId, phone);
    // Wipe log buffer — session is dead, no reason to keep output in RAM
    clearLog(sessionId);
    try {
      const r = await Sessions.findById(sessionId);
      if (r.rows[0]?.status === 'connected') await Sessions.updateStatus(sessionId, 'stopped');
    } catch {}
  });

  return proc;
}

// ── Stop bot process ───────────────────────────────────────────────────────
function stopSession(sessionId) {
  const e = PROCS.get(sessionId);
  if (!e) return;
  stopCredsSync(sessionId);
  try { e.proc.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { e.proc.kill('SIGKILL'); } catch {} }, 3000);
  PROCS.delete(sessionId);
  SSE_SUBS.delete(sessionId);
  PAIR_CACHE.delete(sessionId);
  clearLog(sessionId);
}

// ── Delete session files + DB creds ───────────────────────────────────────
function deleteSessionFiles(sessionId, phone) {
  stopSession(sessionId);
  const sd = sessionDir(phone);
  try { if (fs.existsSync(sd)) fs.rmSync(sd, { recursive: true, force: true }); } catch {}
}

// ── tailLog — returns last N lines from in-memory buffer ──────────────────
// Accepts either phone (string) or sessionId (number) for flexibility.
function tailLog(phoneOrId, n = 100) {
  // Try by sessionId first (number)
  if (typeof phoneOrId === 'number' || /^\d+$/.test(String(phoneOrId))) {
    const sid = parseInt(phoneOrId);
    const buf = LOG_BUFFERS.get(sid);
    if (buf && buf.length) return buf.slice(-n).join('\n');
  }
  // Fall back to finding by phone string
  for (const [sid, entry] of PROCS) {
    if (entry.phone === String(phoneOrId)) {
      const buf = LOG_BUFFERS.get(sid) || [];
      return buf.slice(-n).join('\n') || '(no output captured yet)';
    }
  }
  // Session not running — return whatever is still in buffer
  for (const [sid, buf] of LOG_BUFFERS) {
    // We can't match by phone here without PROCS entry, so return the most recent non-empty buffer
    if (buf && buf.length) return `[session stopped] Last ${Math.min(n, buf.length)} lines:\n` + buf.slice(-n).join('\n');
  }
  return '(session not running or no output captured)';
}

// ── Resume sessions on server boot ─────────────────────────────────────────
async function resumeSessions() {
  try {
    const r = await Sessions.listAll(200, 0);
    let started = 0;
    for (const s of r.rows) {
      if (!s.phone_number) continue;
      const restored = await restoreCredsFromDb(s.id, s.phone_number);
      if (restored) {
        await startBot(s.id, s.phone_number);
        await Sessions.updateStatus(s.id, 'connecting');
        started++;
        await new Promise(r => setTimeout(r, 800));
      } else {
        await Sessions.updateStatus(s.id, 'stopped');
      }
    }
  } catch {}
}

// ── Logout monitor (background) ────────────────────────────────────────────
// Reads from in-memory log buffers — no disk access
async function startLogoutMonitor() {
  setInterval(async () => {
    try {
      const r = await Sessions.listAll(200, 0);
      for (const s of r.rows) {
        if (!s.phone_number) continue;
        const buf = LOG_BUFFERS.get(s.id);
        if (!buf || !buf.length) continue;
        // Only check the last 50 lines
        const recent = buf.slice(-50);
        for (const line of recent) {
          if (line.includes(`LOGGED_OUT:${s.phone_number}`)) {
            stopSession(s.id);
            await Sessions.saveCreds(s.id, null);
            await Sessions.updateStatus(s.id, 'logged_out');
            break;
          }
        }
      }
    } catch {}
  }, 10_000);
}

module.exports = {
  startBot, stopSession, deleteSessionFiles,
  tailLog, isRunning, watchLog,
  subscribe, unsubscribe, emit,
  resumeSessions, startLogoutMonitor,
  PROCS,
};
