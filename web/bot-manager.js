/**
 * ╔══════════════════════════════════════════════════╗
 * ║   VIPER BOT MD — Bot Process Manager             ║
 * ║   Render-compatible: creds persisted in Postgres ║
 * ╚══════════════════════════════════════════════════╝
 *
 * On Render free tier the filesystem is EPHEMERAL —
 * it resets on every deploy or restart.
 *
 * Solution:
 *   • All session files live in /tmp/viper-sessions/{phone}/
 *   • Every 30s (and on each creds.update) the entire
 *     session folder is gzip-archived and saved to Postgres.
 *   • On startup, creds are restored from Postgres to /tmp
 *     BEFORE the bot process is spawned.
 */

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const zlib       = require('zlib');
const { Sessions } = require('./db');

// ── Paths — always use /tmp so they survive process crashes
//           but are correctly re-seeded from DB on restart
const TMP_ROOT   = '/tmp/viper-sessions';
const TMP_LOGS   = '/tmp/viper-logs';
const ROOT_DIR   = path.join(__dirname, '..');
const NODE_ENTRY = path.join(ROOT_DIR, 'index.js');

[TMP_ROOT, TMP_LOGS].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── In-memory state ────────────────────────────────────────────────────────
const PROCS          = new Map(); // sessionId → { proc, phone }
const SSE_SUBS       = new Map(); // sessionId → Set<res>
const CREDS_TIMERS   = new Map(); // sessionId → intervalId

function sessionDir(phone) { return path.join(TMP_ROOT, phone); }
function logPath(phone)    { return path.join(TMP_LOGS, `${phone}.log`); }

function isRunning(sessionId) {
  const e = PROCS.get(sessionId);
  if (!e) return false;
  try { process.kill(e.proc.pid, 0); return e.proc.exitCode === null; }
  catch { return false; }
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
}
function unsubscribe(sessionId, res) {
  SSE_SUBS.get(sessionId)?.delete(res);
}

// ── Creds persistence ──────────────────────────────────────────────────────
// Serialize the entire session directory → gzip → base64 → DB
async function saveCredsToDb(sessionId, phone) {
  const sd = sessionDir(phone);
  if (!fs.existsSync(sd)) return;
  try {
    // Collect all files in the session dir recursively
    const files = [];
    const walk = (dir, base='') => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const rel  = base ? `${base}/${entry}` : entry;
        if (fs.statSync(full).isDirectory()) {
          walk(full, rel);
        } else {
          files.push({ rel, data: fs.readFileSync(full).toString('base64') });
        }
      }
    };
    walk(sd);
    if (!files.length) return;
    const json  = JSON.stringify(files);
    const gz    = zlib.gzipSync(Buffer.from(json));
    const b64   = gz.toString('base64');
    await Sessions.saveCreds(sessionId, b64);
  } catch (e) {
    console.error(`[BotMgr] saveCreds error (${phone}):`, e.message);
  }
}

// Restore session dir from DB → /tmp before starting bot
async function restoreCredsFromDb(sessionId, phone) {
  try {
    const r = await Sessions.loadCreds(sessionId);
    const b64 = r.rows[0]?.creds_data;
    if (!b64) return false;

    const gz    = Buffer.from(b64, 'base64');
    const json  = zlib.gunzipSync(gz).toString();
    const files = JSON.parse(json);
    const sd    = sessionDir(phone);

    for (const { rel, data } of files) {
      const fullPath = path.join(sd, rel);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
    }
    console.log(`[BotMgr] ✅ Restored creds for ${phone} from DB (${files.length} files)`);
    return true;
  } catch (e) {
    console.error(`[BotMgr] restoreCreds error (${phone}):`, e.message);
    return false;
  }
}

// Start periodic creds-save (every 30s while bot is running)
function startCredsSync(sessionId, phone) {
  stopCredsSync(sessionId);
  const iv = setInterval(() => saveCredsToDb(sessionId, phone), 30_000);
  CREDS_TIMERS.set(sessionId, iv);
}
function stopCredsSync(sessionId) {
  const iv = CREDS_TIMERS.get(sessionId);
  if (iv) { clearInterval(iv); CREDS_TIMERS.delete(sessionId); }
}

// ── Log watcher (SSE feed) ─────────────────────────────────────────────────
function watchLog(sessionId, phone) {
  const lf       = logPath(phone);
  let   seen     = 0;
  let   done     = false;
  const deadline = Date.now() + 120_000;

  const iv = setInterval(async () => {
    if (done || Date.now() > deadline) {
      clearInterval(iv);
      if (!done) emit(sessionId, 'error', { message: 'Timed out. Please try again.' });
      return;
    }
    try {
      if (!fs.existsSync(lf)) return;
      const lines = fs.readFileSync(lf, 'utf8').split('\n');
      const fresh = lines.slice(seen);
      seen = lines.length;

      for (const line of fresh) {
        if (!line.trim()) continue;

        if (line.includes('PAIR_CODE:')) {
          const code = line.split('PAIR_CODE:')[1].trim();
          emit(sessionId, 'pair_code', { code });
        }
        if (line.toUpperCase().includes('CONNECTED') || line.includes('connected successfully')) {
          done = true; clearInterval(iv);
          emit(sessionId, 'connected', { message: 'Bot connected!' });
          await Sessions.updateStatus(sessionId, 'connected');
          // Save creds immediately after connect
          await saveCredsToDb(sessionId, phone);
          return;
        }
        if (line.includes(`LOGGED_OUT:${phone}`) || line.includes('loggedOut')) {
          done = true; clearInterval(iv);
          stopCredsSync(sessionId);
          stopSession(sessionId);
          // Wipe creds from DB on logout
          await Sessions.saveCreds(sessionId, null);
          await Sessions.updateStatus(sessionId, 'logged_out');
          emit(sessionId, 'logged_out', { message: 'Session logged out.' });
          return;
        }
      }
    } catch {}
  }, 1500);

  return () => { done = true; clearInterval(iv); };
}

// ── Start bot process ──────────────────────────────────────────────────────
async function startBot(sessionId, phone, { pairNumber = null } = {}) {
  if (isRunning(sessionId)) {
    console.log(`[BotMgr] ${phone} already running`);
    return;
  }

  // Restore creds from DB first (critical for Render restarts)
  const hadCreds = await restoreCredsFromDb(sessionId, phone);

  const sd = sessionDir(phone);
  if (!fs.existsSync(sd)) fs.mkdirSync(sd, { recursive: true });

  const env = {
    ...process.env,
    SESSION_DIR:    sd,
    SESSION_NUMBER: phone,
  };
  if (pairNumber && !hadCreds) env.PAIR_NUMBER = pairNumber;

  const lf  = logPath(phone);
  const log = fs.openSync(lf, 'a');

  const proc = spawn('node', [NODE_ENTRY], {
    cwd:   ROOT_DIR,
    env,
    stdio: ['ignore', log, log],
  });

  PROCS.set(sessionId, { proc, phone });
  console.log(`[BotMgr] ▶ Started ${phone} (pid ${proc.pid}${hadCreds?' — creds restored':''})`);

  // Start periodic creds sync to DB
  startCredsSync(sessionId, phone);

  proc.on('exit', async code => {
    console.log(`[BotMgr] ■ ${phone} exited (${code})`);
    PROCS.delete(sessionId);
    stopCredsSync(sessionId);
    // Save creds one last time before process dies
    await saveCredsToDb(sessionId, phone);
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
}

// ── Delete session files + DB creds ───────────────────────────────────────
function deleteSessionFiles(sessionId, phone) {
  stopSession(sessionId);
  const sd = sessionDir(phone);
  const lf = logPath(phone);
  try { if (fs.existsSync(sd)) fs.rmSync(sd, { recursive: true, force: true }); } catch {}
  try { if (fs.existsSync(lf)) fs.unlinkSync(lf); } catch {}
}

// ── Tail log ───────────────────────────────────────────────────────────────
function tailLog(phone, n = 60) {
  const lf = logPath(phone);
  if (!fs.existsSync(lf)) return '(no logs yet)';
  const lines = fs.readFileSync(lf, 'utf8').split('\n');
  return lines.slice(-n).join('\n');
}

// ── Resume sessions on server boot ─────────────────────────────────────────
async function resumeSessions() {
  try {
    const r = await Sessions.listAll(200, 0);
    let started = 0;
    for (const s of r.rows) {
      if (!s.phone_number) continue;
      // Try to restore creds from DB
      const restored = await restoreCredsFromDb(s.id, s.phone_number);
      if (restored) {
        console.log(`[BotMgr] ▶ Resuming ${s.phone_number}`);
        await startBot(s.id, s.phone_number);
        await Sessions.updateStatus(s.id, 'connecting');
        started++;
        await new Promise(r => setTimeout(r, 800));
      } else {
        // No creds in DB — mark as stopped so user knows to re-pair
        await Sessions.updateStatus(s.id, 'stopped');
        console.log(`[BotMgr] ⚠ ${s.phone_number} — no creds in DB, needs re-pairing`);
      }
    }
    if (started) console.log(`[BotMgr] ✅ Resumed ${started} session(s)`);
  } catch (e) {
    console.error('[BotMgr] Resume error:', e.message);
  }
}

// ── Logout monitor (background) ────────────────────────────────────────────
async function startLogoutMonitor() {
  const seenLines = {};
  setInterval(async () => {
    try {
      const r = await Sessions.listAll(200, 0);
      for (const s of r.rows) {
        if (!s.phone_number) continue;
        const lf = logPath(s.phone_number);
        if (!fs.existsSync(lf)) continue;
        try {
          const lines = fs.readFileSync(lf, 'utf8').split('\n');
          const start = seenLines[s.phone_number] || Math.max(0, lines.length - 50);
          const fresh = lines.slice(start);
          seenLines[s.phone_number] = lines.length;
          for (const line of fresh) {
            if (line.includes(`LOGGED_OUT:${s.phone_number}`)) {
              console.log(`[BotMgr] Auto-nuking logged-out: ${s.phone_number}`);
              stopSession(s.id);
              await Sessions.saveCreds(s.id, null);
              await Sessions.updateStatus(s.id, 'logged_out');
            }
          }
        } catch {}
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
