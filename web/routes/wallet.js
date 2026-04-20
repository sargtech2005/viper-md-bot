/**
 * VIPER BOT MD — Wallet Routes
 *
 * Payment flow (no webhook required):
 *   1. POST /initiate  — create pending payment record, return Paystack ref
 *   2. Paystack popup  — user pays in browser
 *   3. POST /verify    — frontend calls immediately after Paystack onSuccess
 *   4. POST /verify    — user can also manually retry any pending payment
 *
 * Webhook removed intentionally: the Paystack inline popup already calls
 * onSuccess reliably, and the user shares API keys across sites so a
 * single webhook URL cannot be configured.
 */
const express = require('express');
const https   = require('https');
const crypto  = require('crypto');
const { Users, Payments, Transactions, Settings } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Paystack API helper ───────────────────────────────────────────────────────
function paystackAPI(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.paystack.co',
      port: 443, path, method,
      headers: {
        Authorization:  `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try   { resolve(JSON.parse(raw)); }
        catch { resolve({ status: false, message: 'Invalid JSON from Paystack' }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── GET /api/wallet ───────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const [userR, paymentsR, txR, allSettings] = await Promise.all([
      Users.findById(req.user.id),
      Payments.findByUser(req.user.id, 20),
      Transactions.findByUser(req.user.id, 20),
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

    const reference  = `VIPER-${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const amountKobo = pkgNgn * 100;

    await Payments.create({ userId: req.user.id, reference, amountKobo, coins: pkgCoins });

    res.json({ ok: true, reference, amount_kobo: amountKobo, coins: pkgCoins, email: user.email, public_key: publicKey });
  } catch (err) {
    console.error('[Wallet] Initiate error:', err.message);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// ── POST /api/wallet/verify ───────────────────────────────────────────────────
// Called by frontend:
//   a) Automatically after Paystack onSuccess callback
//   b) Manually via "Retry" button on any pending payment
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'Reference required' });

    const secretKey = await Settings.get('paystack_secret_key');
    if (!secretKey) return res.status(503).json({ error: 'Payments not configured' });

    const pr      = await Payments.findByRef(reference);
    const payment = pr.rows[0];
    if (!payment)                              return res.status(404).json({ error: 'Payment not found' });
    if (payment.user_id !== req.user.id)       return res.status(403).json({ error: 'Not your payment' });
    // Already verified — return success without re-crediting
    if (payment.status === 'success') {
      const userR = await Users.findById(req.user.id);
      return res.json({ ok: true, coins: payment.coins, new_balance: userR.rows[0].coins, already: true });
    }

    // Ask Paystack whether this transaction succeeded
    const pData = await paystackAPI('GET', `/transaction/verify/${encodeURIComponent(reference)}`, null, secretKey);

    if (!pData.status || pData.data?.status !== 'success') {
      const psMsg = pData.data?.gateway_response || pData.message || 'Transaction not confirmed by Paystack';
      return res.status(402).json({ error: `Payment not confirmed: ${psMsg}` });
    }

    // Amount guard — parseInt() on both sides handles pg returning INTEGER as string
    // on some Postgres versions / Render environments
    const paidKobo = parseInt(pData.data.amount, 10);
    const storedKobo = parseInt(payment.amount_kobo, 10);
    if (paidKobo !== storedKobo) {
      console.error(`[Wallet] Amount mismatch ref=${reference} paystack=${paidKobo} stored=${storedKobo}`);
      return res.status(402).json({ error: 'Amount mismatch — contact support' });
    }

    // Mark payment success
    await Payments.verify(reference, pData.data);

    // Credit coins
    await Users.updateCoins(req.user.id, payment.coins);
    await Transactions.create({
      userId:      req.user.id,
      type:        'purchase',
      amount:      payment.coins,
      description: `Bought ${payment.coins} coins (₦${storedKobo / 100}) — ref: ${reference}`,
    });

    const userR = await Users.findById(req.user.id);
    console.log(`[Wallet] ✅ Credited ${payment.coins} coins to user ${req.user.id} (ref: ${reference})`);
    res.json({ ok: true, coins: payment.coins, new_balance: userR.rows[0].coins });
  } catch (err) {
    console.error('[Wallet] Verify error:', err.message);
    res.status(500).json({ error: 'Verification failed. Try the retry button or contact support.' });
  }
});

module.exports = router;
