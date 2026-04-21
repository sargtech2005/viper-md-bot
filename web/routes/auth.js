const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { Users, Transactions, Sessions } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, SMTP_CONFIGURED } = require('../utils/mailer');
const BotMgr = require('../bot-manager');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email||!username||!password) return res.status(400).json({error:'All fields required'});
    if (password.length<6) return res.status(400).json({error:'Password min 6 characters'});
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) return res.status(400).json({error:'Username: 3-20 chars, letters/numbers/underscore'});
    const [byEmail,byUser]=await Promise.all([Users.findByEmail(email),Users.findByUsername(username)]);
    if (byEmail.rows.length) return res.status(409).json({error:'Email already registered'});
    if (byUser.rows.length) return res.status(409).json({error:'Username already taken'});
    const {Settings}=require('../db');
    const signupCoins=parseInt((await Settings.get('signup_coins'))||'50');
    const isAdmin=(email.toLowerCase()===(process.env.ADMIN_EMAIL||'').toLowerCase());
    const passwordHash=await bcrypt.hash(password,12);

    // Generate verification token; if SMTP not configured, token stays null (auto-verified)
    const verificationToken = SMTP_CONFIGURED ? crypto.randomBytes(32).toString('hex') : null;

    const user=await Users.create({email,username,passwordHash,coins:signupCoins,isAdmin,verificationToken});
    await Transactions.create({userId:user.id,type:'signup_bonus',amount:signupCoins,description:`Welcome bonus — ${signupCoins} coins`});

    // Send verification email (non-fatal — user can still log in)
    if (SMTP_CONFIGURED && verificationToken) {
      sendVerificationEmail(email, username, verificationToken).catch(err => {
        console.error('[Auth] Verification email failed:', err.message);
      });
    }

    const token=signToken({id:user.id,username:user.username,is_admin:user.is_admin});
    res.cookie('viper_token',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:7*24*60*60*1000})
       .json({ok:true,user:{id:user.id,username:user.username,coins:user.coins,is_admin:user.is_admin,is_verified:user.is_verified}});
  } catch(err){console.error('[Auth] Register:',err.message);res.status(500).json({error:'Registration failed'});}
});

router.post('/login', async (req,res) => {
  try {
    const {email,password}=req.body;
    if (!email||!password) return res.status(400).json({error:'Email and password required'});
    const r=await Users.findByEmail(email);
    const user=r.rows[0];
    if (!user) return res.status(401).json({error:'Invalid email or password'});
    if (user.is_banned) return res.status(403).json({error:'Account banned. Contact admin.'});
    const valid=await bcrypt.compare(password,user.password_hash);
    if (!valid) return res.status(401).json({error:'Invalid email or password'});
    await Users.updateLastLogin(user.id);
    const token=signToken({id:user.id,username:user.username,is_admin:user.is_admin});
    res.cookie('viper_token',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:7*24*60*60*1000})
       .json({ok:true,user:{id:user.id,username:user.username,coins:user.coins,is_admin:user.is_admin}});
  } catch(err){ console.error('[Auth] login:', err.message); res.status(500).json({error:'Login failed'}); }
});

// FIX: clearCookie must pass the same options used when setting the cookie
// otherwise the browser won't clear it (mismatched path/secure/sameSite)
router.post('/claim-daily', requireAuth, async (req, res) => {
  try {
    const { Settings, query } = require('../db');
    const enabled = await Settings.get('daily_coins_enabled');
    if (enabled !== 'true') return res.json({ ok: true, claimed: false, reason: 'disabled' });

    const amount = parseInt((await Settings.get('daily_coins_amount')) || '10');
    const r = await query('SELECT last_daily_claim FROM users WHERE id=$1', [req.user.id]);
    const lastClaim = r.rows[0]?.last_daily_claim;
    const now = new Date();
    if (lastClaim) {
      const diffHours = (now - new Date(lastClaim)) / 3600000;
      if (diffHours < 24) return res.json({ ok: true, claimed: false, next_in: Math.ceil(24 - diffHours) });
    }
    await Users.updateCoins(req.user.id, amount);
    await query('UPDATE users SET last_daily_claim=NOW() WHERE id=$1', [req.user.id]);
    await Transactions.create({ userId: req.user.id, type: 'daily_bonus', amount, description: `Daily free coins — ${amount} coins` });
    res.json({ ok: true, claimed: true, amount });
  } catch (err) { console.error('[Auth] claim-daily:', err.message); res.status(500).json({ error: 'Failed to claim daily bonus' }); }
});

router.post('/logout', (req, res) =>
  res.clearCookie('viper_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  }).json({ ok: true })
);

router.get('/me', requireAuth, async (req,res) => {
  try {
    const r=await Users.findById(req.user.id);
    if (!r.rows.length) return res.status(404).json({error:'Not found'});
    res.json({ok:true,user:r.rows[0]});
  } catch (err) { console.error('[Auth] me:', err?.message || err); res.status(500).json({error:'Failed'}); }
});

router.post('/change-password', requireAuth, async (req,res) => {
  try {
    const {currentPassword,newPassword}=req.body;
    if (!currentPassword||!newPassword) return res.status(400).json({error:'Both passwords required'});
    if (newPassword.length<6) return res.status(400).json({error:'New password too short'});
    const r=await require('../db').query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
    const valid=await bcrypt.compare(currentPassword,r.rows[0]?.password_hash||'');
    if (!valid) return res.status(401).json({error:'Current password incorrect'});
    await Users.updatePassword(req.user.id,await bcrypt.hash(newPassword,12));
    res.json({ok:true});
  } catch (err) { console.error('[Auth] change-password:', err?.message || err); res.status(500).json({error:'Failed'}); }
});

router.post('/change-email', requireAuth, async (req,res) => {
  try {
    const {newEmail,password}=req.body;
    if (!newEmail||!password) return res.status(400).json({error:'All fields required'});
    const r=await require('../db').query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
    if (!await bcrypt.compare(password,r.rows[0]?.password_hash||'')) return res.status(401).json({error:'Incorrect password'});
    const dup=await Users.findByEmail(newEmail);
    if (dup.rows.length&&dup.rows[0].id!==req.user.id) return res.status(409).json({error:'Email already in use'});
    await Users.updateEmail(req.user.id,newEmail);
    res.json({ok:true});
  } catch (err) { console.error('[Auth] change-email:', err?.message || err); res.status(500).json({error:'Failed'}); }
});

router.delete('/delete-account', requireAuth, async (req,res) => {
  try {
    const sr=await Sessions.findByUser(req.user.id);
    for (const s of sr.rows){BotMgr.stopSession(s.id);if(s.phone_number)BotMgr.deleteSessionFiles(s.id, s.phone_number);}
    await Users.delete(req.user.id);
    res.clearCookie('viper_token').json({ok:true});
  } catch (err) { console.error('[Auth] delete-account:', err?.message || err); res.status(500).json({error:'Failed'}); }
});

// POST /api/auth/resend-verify — resend verification email
router.post('/resend-verify', requireAuth, async (req, res) => {
  try {
    if (!SMTP_CONFIGURED) return res.status(503).json({ error: 'Email not configured on this server' });
    const r = await require('../db').query(
      'SELECT email, username, is_verified, verification_token FROM users WHERE id=$1', [req.user.id]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.is_verified) return res.json({ ok: true, already: true });

    // Regenerate token so old links are invalidated
    const token = crypto.randomBytes(32).toString('hex');
    await require('../db').query('UPDATE users SET verification_token=$1 WHERE id=$2', [token, req.user.id]);
    await sendVerificationEmail(u.email, u.username, token);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Auth] Resend verify:', err.message);
    res.status(500).json({ error: 'Failed to resend. Try again later.' });
  }
});

// GET /api/auth/verify-email?token=xxx  — called from email link
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token || token.length !== 64) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:3rem">
        <h2 style="color:#ef4444">Invalid or expired verification link.</h2>
        <a href="/login.html">Return to login</a>
      </body></html>`);
  }
  try {
    const r = await Users.verifyEmail(token);
    if (!r.rows.length) {
      return res.status(410).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:3rem">
          <h2 style="color:#ef4444">Link already used or expired.</h2>
          <a href="/login.html">Return to login</a>
        </body></html>`);
    }
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:3rem">
        <h2 style="color:#16a34a">✅ Email verified!</h2>
        <p>Your account is now fully verified.</p>
        <a href="/dashboard.html">Go to dashboard</a>
      </body></html>`);
  } catch (err) {
    console.error('[Auth] Verify email:', err.message);
    res.status(500).send('Verification failed. Please try again.');
  }
});

module.exports = router;
