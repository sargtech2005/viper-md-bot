const express = require('express');
const { Users, Sessions, Transactions, Payments, Settings, query } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const BotMgr = require('../bot-manager');

const router = express.Router();
router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    const [users, sessions, connected, revenue] = await Promise.all([
      Users.count(), Sessions.count(), Sessions.countByStatus('connected'), Payments.revenue(),
    ]);
    res.json({ ok: true, stats: {
      total_users:    parseInt(users.rows[0].count),
      total_sessions: parseInt(sessions.rows[0].count),
      connected:      parseInt(connected.rows[0].count),
      running_procs:  BotMgr.PROCS.size,
      revenue_count:  parseInt(revenue.rows[0].count),
      revenue_ngn:    Math.floor(parseInt(revenue.rows[0].total) / 100),
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const r = req.query.q ? await Users.search(req.query.q) : await Users.list(parseInt(req.query.limit||50), parseInt(req.query.offset||0));
    res.json({ ok: true, users: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users/:id/coins', async (req, res) => {
  try {
    const uid = parseInt(req.params.id);
    const amount = parseInt(req.body.amount);
    if (isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });
    await Users.updateCoins(uid, amount);
    await Transactions.create({ userId: uid, type: 'admin_adjustment', amount, description: req.body.reason || `Admin adjustment by ${req.user.username}` });
    const r = await Users.findById(uid);
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users/:id/ban', async (req, res) => {
  try {
    const uid = parseInt(req.params.id);
    if (uid === req.user.id) return res.status(400).json({ error: 'Cannot ban yourself' });
    const r = await Users.findById(uid);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const newBan = !r.rows[0].is_banned;
    await Users.setBanned(uid, newBan);
    res.json({ ok: true, is_banned: newBan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users/:id/toggle-admin', async (req, res) => {
  try {
    const uid = parseInt(req.params.id);
    if (uid === req.user.id) return res.status(400).json({ error: 'Cannot change own admin status' });
    const r = await Users.findById(uid);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const newStatus = !r.rows[0].is_admin;
    await Users.setAdmin(uid, newStatus);
    res.json({ ok: true, is_admin: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const uid = parseInt(req.params.id);
    if (uid === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const sr = await Sessions.findByUser(uid);
    for (const s of sr.rows) {
      if (s.phone_number) BotMgr.deleteSessionFiles(s.id, s.phone_number);
      else BotMgr.stopSession(s.id);
    }
    await Users.delete(uid);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sessions', async (req, res) => {
  try {
    const r = await Sessions.listAll(100, 0);
    res.json({ ok: true, sessions: r.rows.map(s => ({ ...s, is_running: BotMgr.isRunning(s.id) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sessions/:id/stop', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    BotMgr.stopSession(id);
    await Sessions.updateStatus(id, 'stopped');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sessions/:id/restart', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (!s?.phone_number) return res.status(400).json({ error: 'No number paired' });
    BotMgr.stopSession(id);
    await new Promise(r => setTimeout(r, 800));
    BotMgr.startBot(id, s.phone_number);
    await Sessions.updateStatus(id, 'connecting');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sr = await Sessions.findById(id);
    const s  = sr.rows[0];
    if (s) {
      if (s.phone_number) BotMgr.deleteSessionFiles(id, s.phone_number);
      else BotMgr.stopSession(id);
      await Sessions.saveCreds(id, null);
    }
    await Sessions.delete(id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sessions/stopall', async (req, res) => {
  try {
    for (const [sid] of BotMgr.PROCS) BotMgr.stopSession(sid);
    await query(`UPDATE bot_sessions SET status='stopped' WHERE status IN ('connected','connecting','pairing')`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments', async (req, res) => {
  try { res.json({ ok: true, payments: (await Payments.listAll(100, 0)).rows }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payments/credit', async (req, res) => {
  try {
    const { user_id, coins, reason } = req.body;
    if (!user_id || !coins) return res.status(400).json({ error: 'user_id and coins required' });
    await Users.updateCoins(parseInt(user_id), parseInt(coins));
    await Transactions.create({ userId: parseInt(user_id), type: 'manual_credit', amount: parseInt(coins), description: reason || `Manual credit by ${req.user.username}` });
    const r = await Users.findById(parseInt(user_id));
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/settings', async (req, res) => {
  try {
    const all = await Settings.getAll();
    if (all['paystack_secret_key']?.length > 8)
      all['paystack_secret_key_masked'] = '••••' + all['paystack_secret_key'].slice(-4);
    res.json({ ok: true, settings: all });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/settings', async (req, res) => {
  try {
    const allowed = [
      'signup_coins','session_cost','maintenance_mode','site_name','max_sessions_per_user',
      'paystack_public_key','paystack_secret_key',
      'coin_pkg_1_coins','coin_pkg_1_ngn','coin_pkg_2_coins','coin_pkg_2_ngn',
      'coin_pkg_3_coins','coin_pkg_3_ngn','coin_pkg_4_coins','coin_pkg_4_ngn',
    ];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    await Settings.setMany(updates);
    res.json({ ok: true, message: 'Settings saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/transactions', async (req, res) => {
  try { res.json({ ok: true, transactions: (await Transactions.listAll(100, 0)).rows }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
