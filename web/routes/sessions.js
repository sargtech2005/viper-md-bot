const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { Users, Sessions, Transactions, Settings, pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const Worker  = require('../worker-client'); // replaces direct BotMgr calls

const router = express.Router();
router.use(requireAuth);

// ── Per-user SSE connection cap ────────────────────────────────────────────
const SSE_USER_CONNS  = new Map();
const MAX_SSE_PER_USER = 5;

// GET /api/sessions/stats
router.get('/stats', async (req, res) => {
  try {
    const [sessR, userR, txR] = await Promise.all([
      Sessions.findByUser(req.user.id),
      Users.findById(req.user.id),
      Transactions.findByUser(req.user.id, 10),
    ]);
    const sessions = await Promise.all(
      sessR.rows.map(async s => ({ ...s, is_running: await Worker.isRunning(s.id) }))
    );
    res.json({ ok: true, user: userR.rows[0], sessions, transactions: txR.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to load stats' }); }
});

// GET /api/sessions
router.get('/', async (req, res) => {
  try {
    const r = await Sessions.findByUser(req.user.id);
    const sessions = await Promise.all(
      r.rows.map(async s => ({ ...s, is_running: await Worker.isRunning(s.id) }))
    );
    res.json({ ok: true, sessions });
  } catch (err) { res.status(500).json({ error: 'Failed to load sessions' }); }
});

// POST /api/sessions — create (costs coins)
router.post('/', async (req, res) => {
  try {
    const { label, prefix, selfMode, initialSettings: clientSettings } = req.body;
    const [costStr, maxStr] = await Promise.all([
      Settings.get('session_cost'), Settings.get('max_sessions_per_user'),
    ]);
    const cost = parseInt(costStr || '10');
    const max  = parseInt(maxStr  || '0');

    const ur = await Users.findById(req.user.id);
    const user = ur.rows[0];
    if (!user)          return res.status(404).json({ error: 'User not found' });
    if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
    if (user.coins < cost) return res.status(402).json({ error: `Need ${cost} coins. You have ${user.coins}.` });

    if (max > 0) {
      const cr = await Sessions.countByUser(req.user.id);
      if (parseInt(cr.rows[0].count) >= max)
        return res.status(400).json({ error: `Max ${max} sessions per user` });
    }

    const initialSettings = {};
    if (clientSettings && typeof clientSettings === 'object') {
      const allowed = ['botName','ownerName','prefix','selfMode','autoStatus','autoReact','autoRead','autoTyping'];
      for (const key of allowed) {
        if (clientSettings[key] !== undefined && clientSettings[key] !== null && clientSettings[key] !== '')
          initialSettings[key] = clientSettings[key];
      }
    }
    if (!initialSettings.prefix && prefix && prefix.trim().length > 0 && prefix.trim().length <= 3)
      initialSettings.prefix = prefix.trim();
    if (!initialSettings.selfMode && (selfMode === true || selfMode === 'true'))
      initialSettings.selfMode = true;

    const client = await pool.connect();
    let session;
    try {
      await client.query('BEGIN');
      const coinRes = await client.query(
        'UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1 RETURNING coins',
        [cost, req.user.id]
      );
      if (!coinRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(402).json({ error: `Need ${cost} coins. Insufficient balance.` });
      }
      await client.query(
        `INSERT INTO coin_transactions(user_id, type, amount, description) VALUES($1, 'session_create', $2, $3)`,
        [req.user.id, -cost, `Created session${label ? ': ' + label : ''}`]
      );
      const slotRes = await client.query(
        `SELECT COALESCE(MAX(user_slot), 0) + 1 AS next_slot FROM bot_sessions WHERE user_id = $1`,
        [req.user.id]
      );
      const slot = slotRes.rows[0].next_slot;
      const sessRes = await client.query(
        `INSERT INTO bot_sessions(user_id, session_label, status, user_slot, initial_settings)
         VALUES($1, $2, 'pending', $3, $4) RETURNING *`,
        [req.user.id, label || null, slot,
         Object.keys(initialSettings).length ? JSON.stringify(initialSettings) : null]
      );
      session = sessRes.rows[0];
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/byslot/:slot
router.get('/byslot/:slot', async (req, res) => {
  try {
    const slot = parseInt(req.params.slot);
    if (!slot || isNaN(slot)) return res.status(400).json({ error: 'Invalid slot' });
    const r = await Sessions.findBySlot(req.user.id, slot);
    const s = r.rows[0];
    if (!s) return res.status(404).json({ error: 'Session not found' });
    res.json({ ok: true, session: { ...s, is_running: await Worker.isRunning(s.id) } });
  } catch (err) { res.status(500).json({ error: 'Failed to resolve slot' }); }
});

// POST /api/sessions/:id/pair
router.post('/:id/pair', async (req, res) => {
  try {
    const sessionId  = parseInt(req.params.id);
    const cleanPhone = (req.body.phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone || !/^\d{10,15}$/.test(cleanPhone))
      return res.status(400).json({ error: 'Invalid number. Format: 2348XXXXXXXXXX' });

    const sr = await Sessions.findById(sessionId);
    const session = sr.rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.user_id !== req.user.id && !req.user.is_admin)
      return res.status(403).json({ error: 'Not your session' });

    const dup = await Sessions.findByPhone(cleanPhone);
    if (dup.rows.length && dup.rows[0].id !== sessionId)
      return res.status(409).json({ error: 'Number already paired elsewhere' });

    await Sessions.saveCreds(sessionId, null);
    await Sessions.setPhone(sessionId, cleanPhone);
    await Sessions.updateStatus(sessionId, 'pairing');

    await Worker.pairSession(sessionId, cleanPhone);

    res.json({ ok: true, message: 'Pairing started' });
  } catch (err) {
    res.status(500).json({ error: 'Pairing failed. Try again.' });
  }
});

// GET /api/sessions/:id/stream — SSE (works local and remote)
router.get('/:id/stream', async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const userId    = req.user.id;
  try {
    const sr = await Sessions.findById(sessionId);
    const s  = sr.rows[0];
    if (!s) return res.status(404).end();
    if (s.user_id !== userId && !req.user.is_admin) return res.status(403).end();

    const current = SSE_USER_CONNS.get(userId) || 0;
    if (current >= MAX_SSE_PER_USER)
      return res.status(429).json({ error: 'Too many open connections. Close other tabs and try again.' });
    SSE_USER_CONNS.set(userId, current + 1);

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    const cleanup = Worker.proxyStream(sessionId, res);

    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { clearInterval(hb); } }, 20000);
    req.on('close', () => {
      clearInterval(hb);
      if (typeof cleanup === 'function') cleanup();
      const c = SSE_USER_CONNS.get(userId) || 1;
      if (c <= 1) SSE_USER_CONNS.delete(userId);
      else SSE_USER_CONNS.set(userId, c - 1);
    });
  } catch (err) { res.status(500).end(); }
});

// POST /api/sessions/:id/restart
router.post('/:id/restart', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    if (!s.phone_number) return res.status(400).json({ error: 'No number paired yet' });
    await Worker.restartSession(id, s.phone_number);
    await Sessions.updateStatus(id, 'connecting');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Restart failed' }); }
});

// POST /api/sessions/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    await Worker.stopSession(id, s.phone_number);
    await Sessions.updateStatus(id, 'stopped');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Stop failed' }); }
});

// DELETE /api/sessions/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    await Worker.deleteSession(id, s.phone_number);
    await Sessions.saveCreds(id, null);
    await Sessions.delete(id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// GET /api/sessions/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });

    let logs = '(no logs — session not running)';
    if (!Worker.isRemote()) {
      // Local mode — read from in-memory log buffer via BotMgr
      const BotMgr = require('../bot-manager');
      if (s.phone_number) logs = BotMgr.tailLog(s.phone_number, 100);
    } else {
      // Worker mode — logs live in the worker process RAM; not accessible here
      logs = '(logs are on the worker service)';
    }

    res.json({ ok: true, logs });
  } catch (err) { res.status(500).json({ error: 'Failed to load logs' }); }
});

// GET /api/sessions/:id/settings
router.get('/:id/settings', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    res.json({ ok: true, label: s.session_label || '', settings: s.initial_settings || {} });
  } catch (err) { res.status(500).json({ error: 'Failed to load settings' }); }
});

// PUT /api/sessions/:id/settings
router.put('/:id/settings', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });

    const { label, botName, ownerName, prefix, selfMode,
            autoStatus, autoReact, autoRead, autoTyping } = req.body;

    if (!botName || !botName.trim())   return res.status(400).json({ error: 'Bot Name is required' });
    if (!ownerName || !ownerName.trim()) return res.status(400).json({ error: 'Owner Name is required' });

    const newSettings = {
      botName:   botName.trim(),
      ownerName: ownerName.trim(),
      ...(prefix     ? { prefix: prefix.trim() } : {}),
      ...(selfMode   !== undefined ? { selfMode:   !!selfMode }   : {}),
      ...(autoStatus !== undefined ? { autoStatus: !!autoStatus } : {}),
      ...(autoReact  !== undefined ? { autoReact:  !!autoReact }  : {}),
      ...(autoRead   !== undefined ? { autoRead:   !!autoRead }   : {}),
      ...(autoTyping !== undefined ? { autoTyping: !!autoTyping } : {}),
    };

    await Sessions.updateLabel(id, label);
    await Sessions.updateInitialSettings(id, newSettings);

    // Live-update the session's settings.json on disk (in worker's /tmp)
    // In split mode this won't reach the worker's filesystem — that's fine,
    // settings apply on next bot restart which reads from DB.
    if (s.phone_number) {
      const sessionDir   = path.join('/tmp/viper-sessions', s.phone_number);
      const dbDir        = path.join(sessionDir, 'db');
      const settingsFile = path.join(dbDir, 'settings.json');
      try {
        if (fs.existsSync(sessionDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
          let existing = {};
          try { if (fs.existsSync(settingsFile)) existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
          fs.writeFileSync(settingsFile, JSON.stringify({ ...existing, ...newSettings }, null, 2));
        }
      } catch {}
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
