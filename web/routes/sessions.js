const express = require('express');
const { Users, Sessions, Transactions, Settings } = require('../db');
const { requireAuth } = require('../middleware/auth');
const BotMgr = require('../bot-manager');

const router = express.Router();
router.use(requireAuth);

// GET /api/sessions/stats
router.get('/stats', async (req, res) => {
  try {
    const [sessR, userR, txR] = await Promise.all([
      Sessions.findByUser(req.user.id),
      Users.findById(req.user.id),
      Transactions.findByUser(req.user.id, 10),
    ]);
    const sessions = sessR.rows.map(s => ({ ...s, is_running: BotMgr.isRunning(s.id) }));
    res.json({ ok: true, user: userR.rows[0], sessions, transactions: txR.rows });
  } catch { res.status(500).json({ error: 'Failed to load stats' }); }
});

// GET /api/sessions
router.get('/', async (req, res) => {
  try {
    const r = await Sessions.findByUser(req.user.id);
    res.json({ ok: true, sessions: r.rows.map(s => ({ ...s, is_running: BotMgr.isRunning(s.id) })) });
  } catch { res.status(500).json({ error: 'Failed to load sessions' }); }
});

// POST /api/sessions — create (costs coins)
router.post('/', async (req, res) => {
  try {
    const { label } = req.body;
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

    await Users.updateCoins(req.user.id, -cost);
    await Transactions.create({ userId: req.user.id, type: 'session_create', amount: -cost, description: `Created session${label?': '+label:''}` });
    const session = await Sessions.create({ userId: req.user.id, phoneNumber: null, label });
    res.json({ ok: true, session });
  } catch (err) {
    console.error('[Sessions] Create:', err.message);
    try { const c = parseInt(await Settings.get('session_cost')||'10'); await Users.updateCoins(req.user.id, c); } catch {}
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/sessions/:id/pair
router.post('/:id/pair', async (req, res) => {
  try {
    const sessionId  = parseInt(req.params.id);
    const cleanPhone = (req.body.phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone || !/^\d{10,15}$/.test(cleanPhone))
      return res.status(400).json({ error: 'Invalid number. Format: 2348083086811' });

    const sr = await Sessions.findById(sessionId);
    const session = sr.rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.user_id !== req.user.id && !req.user.is_admin)
      return res.status(403).json({ error: 'Not your session' });

    const dup = await Sessions.findByPhone(cleanPhone);
    if (dup.rows.length && dup.rows[0].id !== sessionId)
      return res.status(409).json({ error: 'Number already paired elsewhere' });

    if (BotMgr.isRunning(sessionId)) BotMgr.stopSession(sessionId);

    await Sessions.setPhone(sessionId, cleanPhone);
    await Sessions.updateStatus(sessionId, 'pairing');

    BotMgr.startBot(sessionId, cleanPhone, { pairNumber: cleanPhone });
    BotMgr.watchLog(sessionId, cleanPhone);

    res.json({ ok: true, message: 'Pairing started' });
  } catch (err) {
    console.error('[Sessions] Pair:', err.message);
    res.status(500).json({ error: 'Pairing failed. Try again.' });
  }
});

// GET /api/sessions/:id/stream — SSE
router.get('/:id/stream', async (req, res) => {
  const sessionId = parseInt(req.params.id);
  try {
    const sr = await Sessions.findById(sessionId);
    const s  = sr.rows[0];
    if (!s) return res.status(404).end();
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).end();

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    BotMgr.subscribe(sessionId, res);

    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { clearInterval(hb); } }, 20000);
    req.on('close', () => { clearInterval(hb); BotMgr.unsubscribe(sessionId, res); });
  } catch { res.status(500).end(); }
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
    BotMgr.stopSession(id);
    await new Promise(r => setTimeout(r, 1000));
    BotMgr.startBot(id, s.phone_number);
    await Sessions.updateStatus(id, 'connecting');
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Restart failed' }); }
});

// POST /api/sessions/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    BotMgr.stopSession(id);
    await Sessions.updateStatus(id, 'stopped');
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Stop failed' }); }
});

// DELETE /api/sessions/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    if (s.phone_number) BotMgr.deleteSessionFiles(id, s.phone_number);
    else BotMgr.stopSession(id);
    // Wipe creds from DB too
    await Sessions.saveCreds(id, null);
    await Sessions.delete(id);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// GET /api/sessions/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Not yours' });
    const logs = s.phone_number ? BotMgr.tailLog(s.phone_number, 80) : '';
    res.json({ ok: true, logs });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
