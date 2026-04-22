/**
 * ╔══════════════════════════════════════════════╗
 * ║   VIPER BOT MD — Bot Worker Service          ║
 * ║   Deploy separately on Render.               ║
 * ║   Start command: node worker.js              ║
 * ║                                              ║
 * ║   Polls Postgres for commands from the Web   ║
 * ║   service and spawns/stops bot processes.    ║
 * ║   Also exposes a small internal HTTP API     ║
 * ║   so the Web service can proxy SSE streams.  ║
 * ╚══════════════════════════════════════════════╝
 */

const fs   = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

if (!process.env.DATABASE_URL) {
  process.stderr.write('❌ DATABASE_URL not set\n');
  process.exit(1);
}

const http             = require('http');
const { initDB, query, Sessions } = require('./web/db');
const BotMgr           = require('./web/bot-manager');

const WORKER_PORT      = parseInt(process.env.WORKER_PORT || '4000');
// Secret shared between Web and Worker — set the same value in both services
const WORKER_SECRET    = process.env.WORKER_SECRET || 'viper-worker-secret';
const POLL_INTERVAL_MS = 2000; // check DB for new commands every 2s

// ── Ensure worker_commands table exists ────────────────────────────────────
async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS worker_commands (
      id          SERIAL PRIMARY KEY,
      command     VARCHAR(20)  NOT NULL,  -- 'start' | 'stop' | 'pair' | 'delete'
      session_id  INTEGER      NOT NULL,
      phone       VARCHAR(20),
      pair_number VARCHAR(20),
      status      VARCHAR(20)  NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'error'
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      done_at     TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wc_status_idx ON worker_commands(status, created_at)`);
}

// ── Command executor ────────────────────────────────────────────────────────
async function executeCommand(row) {
  const { id, command, session_id, phone, pair_number } = row;
  try {
    if (command === 'start') {
      if (!BotMgr.isRunning(session_id)) {
        await BotMgr.startBot(session_id, phone);
        await Sessions.updateStatus(session_id, 'connecting');
      }
    } else if (command === 'pair') {
      if (BotMgr.isRunning(session_id)) BotMgr.stopSession(session_id);
      await Sessions.saveCreds(session_id, null);
      await Sessions.setPhone(session_id, phone);
      await Sessions.updateStatus(session_id, 'pairing');
      await BotMgr.startBot(session_id, phone, { pairNumber: pair_number || phone });
      BotMgr.watchLog(session_id, phone);
    } else if (command === 'stop') {
      BotMgr.stopSession(session_id);
      await Sessions.updateStatus(session_id, 'stopped');
    } else if (command === 'restart') {
      BotMgr.stopSession(session_id);
      await new Promise(r => setTimeout(r, 1000));
      if (phone) {
        await BotMgr.startBot(session_id, phone);
        await Sessions.updateStatus(session_id, 'connecting');
      }
    } else if (command === 'delete') {
      if (phone) BotMgr.deleteSessionFiles(session_id, phone);
      else BotMgr.stopSession(session_id);
    }

    await query(
      `UPDATE worker_commands SET status='done', done_at=NOW() WHERE id=$1`,
      [id]
    );
  } catch (err) {
    await query(
      `UPDATE worker_commands SET status='error', done_at=NOW() WHERE id=$1`,
      [id]
    );
  }
}

// ── Poller — pick up pending commands ──────────────────────────────────────
async function pollCommands() {
  try {
    // Claim and execute up to 5 pending commands per tick
    const r = await query(`
      UPDATE worker_commands
      SET status = 'running'
      WHERE id IN (
        SELECT id FROM worker_commands
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      )
      RETURNING *
    `);
    for (const row of r.rows) {
      executeCommand(row).catch(() => {});
    }
  } catch {}

  // Purge old done/error commands (keep table lean)
  try {
    await query(`
      DELETE FROM worker_commands
      WHERE status IN ('done','error')
        AND done_at < NOW() - INTERVAL '10 minutes'
    `);
  } catch {}
}

// ── Internal HTTP server ────────────────────────────────────────────────────
// The Web service proxies SSE and status checks here.
// All requests must include  Authorization: Bearer <WORKER_SECRET>

function authOk(req) {
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${WORKER_SECRET}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (!authOk(req)) return json(res, 401, { error: 'Unauthorized' });

  const url = req.url.split('?')[0];

  // GET /health
  if (req.method === 'GET' && url === '/health') {
    return json(res, 200, { ok: true, running: BotMgr.PROCS.size });
  }

  // GET /running/:sessionId  — is a session running?
  const runningMatch = url.match(/^\/running\/(\d+)$/);
  if (req.method === 'GET' && runningMatch) {
    const sid = parseInt(runningMatch[1]);
    return json(res, 200, { running: BotMgr.isRunning(sid) });
  }

  // GET /stream/:sessionId  — SSE proxy
  const streamMatch = url.match(/^\/stream\/(\d+)$/);
  if (req.method === 'GET' && streamMatch) {
    const sid = parseInt(streamMatch[1]);
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    BotMgr.subscribe(sid, res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { clearInterval(hb); } }, 20000);
    req.on('close', () => {
      clearInterval(hb);
      BotMgr.unsubscribe(sid, res);
    });
    return;
  }

  // POST /command  — enqueue a command immediately (used for pair — needs fast response)
  if (req.method === 'POST' && url === '/command') {
    const body = await readBody(req);
    const { command, session_id, phone, pair_number } = body;
    if (!command || !session_id) return json(res, 400, { error: 'Missing fields' });
    // Execute directly (not via DB) so pairing is instant
    const fakeRow = { id: -1, command, session_id, phone, pair_number };
    executeCommand(fakeRow).catch(() => {});
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'Not found' });
});

// ── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  let dbReady = false;
  for (let i = 1; i <= 5; i++) {
    try {
      await initDB();
      await ensureSchema();
      dbReady = true;
      break;
    } catch (err) {
      if (i < 5) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (!dbReady) { process.stderr.write('DB failed\n'); process.exit(1); }

  // Resume sessions that were connected before a restart
  await BotMgr.resumeSessions();
  BotMgr.startLogoutMonitor();

  // Start polling for commands from Web service
  setInterval(pollCommands, POLL_INTERVAL_MS);

  server.listen(WORKER_PORT, '0.0.0.0', () => {
    process.stdout.write(`WORKER_STATUS:READY port=${WORKER_PORT}\n`);
  });
}

boot().catch(e => {
  process.stderr.write(`Worker boot error: ${e.message}\n`);
  process.exit(1);
});

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
