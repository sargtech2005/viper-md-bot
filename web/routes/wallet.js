const express = require('express');
const https   = require('https');
const crypto  = require('crypto');
const { Users, Payments, Transactions, Settings } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Helper: call Paystack API ─────────────────────────────────────────────────
function paystackAPI(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts  = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ status: false, message: 'Invalid JSON from Paystack' }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── GET /api/wallet — user balance + history + packages ──────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const [userR, paymentsR, txR, allSettings] = await Promise.all([
      Users.findById(req.user.id),
      Payments.findByUser(req.user.id, 10),
      Transactions.findByUser(req.user.id, 10),
      Settings.getAll(),
    ]);

    const packages = [1,2,3,4].map(i => ({
      id:    i,
      coins: parseInt(allSettings[`coin_pkg_${i}_coins`] || '0'),
      ngn:   parseInt(allSettings[`coin_pkg_${i}_ngn`]   || '0'),
    })).filter(p => p.coins > 0 && p.ngn > 0);

    res.json({
      ok: true,
      user:         userR.rows[0],
      payments:     paymentsR.rows,
      transactions: txR.rows,
      packages,
      paystack_public_key: allSettings['paystack_public_key'] || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/wallet/initiate ─────────────────────────────────────────────────
// Create a payment record and return Paystack reference + amount
router.post('/initiate', requireAuth, async (req, res) => {
  try {
    const { package_id } = req.body;
    const allSettings    = await Settings.getAll();
    const secretKey      = allSettings['paystack_secret_key'];
    const publicKey      = allSettings['paystack_public_key'];

    if (!secretKey || !publicKey)
      return res.status(503).json({ error: 'Payments not configured yet. Contact admin.' });

    const pkgCoins = parseInt(allSettings[`coin_pkg_${package_id}_coins`] || '0');
    const pkgNgn   = parseInt(allSettings[`coin_pkg_${package_id}_ngn`]   || '0');
    if (!pkgCoins || !pkgNgn) return res.status(400).json({ error: 'Invalid package' });

    const userR = await Users.findById(req.user.id);
    const user  = userR.rows[0];
    if (!user)          return res.status(404).json({ error: 'User not found' });
    if (user.is_banned) return res.status(403).json({ error: 'Account banned' });

    // Generate unique reference
    const reference = `VIPER-${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const amountKobo = pkgNgn * 100; // Paystack uses kobo

    await Payments.create({ userId: req.user.id, reference, amountKobo, coins: pkgCoins });

    res.json({
      ok: true,
      reference,
      amount_kobo: amountKobo,
      coins: pkgCoins,
      email: user.email,
      public_key: publicKey,
    });
  } catch (err) {
    console.error('[Wallet] Initiate error:', err.message);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// ── POST /api/wallet/verify ───────────────────────────────────────────────────
// Called by frontend after Paystack popup success
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'Reference required' });

    const secretKey = await Settings.get('paystack_secret_key');
    if (!secretKey) return res.status(503).json({ error: 'Payments not configured' });

    // Check payment record
    const pr = await Payments.findByRef(reference);
    const payment = pr.rows[0];
    if (!payment)                 return res.status(404).json({ error: 'Payment not found' });
    if (payment.user_id !== req.user.id) return res.status(403).json({ error: 'Not your payment' });
    if (payment.status === 'success')    return res.json({ ok: true, coins: payment.coins, already: true });

    // Verify with Paystack
    const pData = await paystackAPI('GET', `/transaction/verify/${reference}`, null, secretKey);

    if (!pData.status || pData.data?.status !== 'success')
      return res.status(402).json({ error: 'Payment not successful on Paystack' });

    if (pData.data.amount !== payment.amount_kobo)
      return res.status(402).json({ error: 'Amount mismatch — possible tampering' });

    // Mark verified
    await Payments.verify(reference, pData.data);

    // Credit coins
    await Users.updateCoins(req.user.id, payment.coins);
    await Transactions.create({
      userId:      req.user.id,
      type:        'purchase',
      amount:      payment.coins,
      description: `Bought ${payment.coins} coins (₦${payment.amount_kobo/100}) — ref: ${reference}`,
    });

    const userR = await Users.findById(req.user.id);
    res.json({ ok: true, coins: payment.coins, new_balance: userR.rows[0].coins });
  } catch (err) {
    console.error('[Wallet] Verify error:', err.message);
    res.status(500).json({ error: 'Verification failed. Contact support.' });
  }
});

// ── POST /api/wallet/webhook ──────────────────────────────────────────────────
// Paystack webhook (backup — in case inline popup callback doesn't fire)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secretKey = await Settings.get('paystack_secret_key');
    if (!secretKey) return res.sendStatus(400);

    const sig  = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512', secretKey).update(req.body).digest('hex');
    if (sig !== hash) return res.sendStatus(401);

    const event = JSON.parse(req.body);
    res.sendStatus(200); // acknowledge immediately

    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      const pr = await Payments.findByRef(reference);
      const payment = pr.rows[0];
      if (!payment || payment.status === 'success') return;

      if (event.data.amount !== payment.amount_kobo) return;

      await Payments.verify(reference, event.data);
      await Users.updateCoins(payment.user_id, payment.coins);
      await Transactions.create({
        userId:      payment.user_id,
        type:        'purchase',
        amount:      payment.coins,
        description: `Bought ${payment.coins} coins (webhook) — ref: ${reference}`,
      });
      console.log(`[Wallet] Webhook: credited ${payment.coins} coins to user ${payment.user_id}`);
    }
  } catch (err) {
    console.error('[Wallet] Webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
