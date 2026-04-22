/**
 * Worker Client — used by Web service to talk to the Bot Worker.
 *
 * When WORKER_URL is set in env, all bot operations (start/stop/pair/stream)
 * are proxied to the Worker service over HTTP instead of running locally.
 *
 * When WORKER_URL is NOT set, the Web service runs bots in-process (single
 * deployment mode — same as before).
 */

const http  = require('http');
const https = require('https');

const WORKER_URL    = (process.env.WORKER_URL || '').replace(/\/$/, '');
const WORKER_SECRET = process.env.WORKER_SECRET || 'viper-worker-secret';
const { query }     = require('./db');

// Is the worker-split mode active?
const isRemote = () => !!WORKER_URL;

// ── Internal fetch to Worker ───────────────────────────────────────────────
function workerFetch(method, path, body) {
  return new Promise((resolve, reject) => {
    const url     = new URL(WORKER_URL + path);
    const lib     = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const opts    = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  {
        'Authorization': `Bearer ${WORKER_SECRET}`,
        'Content-Type':  'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 8000,
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Worker timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Enqueue a command via Postgres (fire-and-forget for start/stop/delete) ─
async function enqueueCommand(command, session_id, phone, pair_number) {
  await query(
    `INSERT INTO worker_commands(command, session_id, phone, pair_number)
     VALUES($1,$2,$3,$4)`,
    [command, session_id, phone || null, pair_number || null]
  );
}

// ── Public API (mirrors BotMgr interface used in routes/sessions.js) ───────

async function isRunning(sessionId) {
  if (!isRemote()) {
    const BotMgr = require('./bot-manager');
    return BotMgr.isRunning(sessionId);
  }
  try {
    const r = await workerFetch('GET', `/running/${sessionId}`);
    return r.body?.running === true;
  } catch { return false; }
}

async function startBot(sessionId, phone) {
  if (!isRemote()) {
    const BotMgr = require('./bot-manager');
    return BotMgr.startBot(sessionId, phone);
  }
  // DB-based: Worker polls this every 2s
  await enqueueCommand('start', sessionId, phone);
}

async function stopSession(sessionId, phone) {
  if (!isRemote()) {
    const BotMgr = require('./bot-manager');
    return BotMgr.stopSession(sessionId);
  }
  await enqueueCommand('stop', sessionId, phone);
}

async function restartSession(sessionId, phone) {
  if (!isRemote()) {
    const BotMgr = require('./bot-manager');
    BotMgr.stopSession(sessionId);
    await new Promise(r => setTimeout(r, 1000));
    return BotMgr.startBot(sessionId, phone);
  }
  await enqueueCommand('restart', sessionId, phone);
}

async function pairSession(sessionId, phone) {
  if (!isRemote()) {
    const BotMgr = require('./bot-manager');
    if (BotMgr.isRunning(sessionId)) BotMgr.stopSession(sessionId);
    BotMgr.startBot(sessionId, phone, { pairNumber: phone });
    BotMgr.watchLog(sessionId, phone);
    return;
  }
  // Send directly to Worker HTTP (not DB) so pairing is instant — no 2s poll delay
  await workerFetch('POST', '/command', {
    command: 'pair', session_id: sessionId, phone, pair_number: phone,
  });
}

async function deleteSession(sessionId, phone) {
  if (!isRemote()) {
    const BotMgr = require('./bot-manager');
    if (phone) BotMgr.deleteSessionFiles(sessionId, phone);
    else BotMgr.stopSession(sessionId);
    return;
  }
  await enqueueCommand('delete', sessionId, phone);
}

// ── SSE proxy — pipes Worker's SSE stream to the browser ──────────────────
// Called from routes/sessions.js  GET /api/sessions/:id/stream
function proxyStream(sessionId, res) {
  if (!isRemote()) {
    // Local mode — subscribe directly
    const BotMgr = require('./bot-manager');
    BotMgr.subscribe(sessionId, res);
    return () => BotMgr.unsubscribe(sessionId, res);
  }

  const url = new URL(`${WORKER_URL}/stream/${sessionId}`);
  const lib = url.protocol === 'https:' ? https : http;

  const req = lib.request({
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname,
    method:   'GET',
    headers:  { 'Authorization': `Bearer ${WORKER_SECRET}` },
  }, upstream => {
    upstream.on('data', chunk => { try { res.write(chunk); } catch {} });
    upstream.on('end',  ()    => { try { res.end(); } catch {} });
    upstream.on('error', ()   => { try { res.end(); } catch {} });
  });
  req.on('error', () => { try { res.end(); } catch {} });
  req.end();

  // Return cleanup fn
  return () => { try { req.destroy(); } catch {} };
}

module.exports = {
  isRemote,
  isRunning,
  startBot,
  stopSession,
  restartSession,
  pairSession,
  deleteSession,
  proxyStream,
};
