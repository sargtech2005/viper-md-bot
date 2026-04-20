const express  = require('express');
const bcrypt   = require('bcryptjs');
const { Users, Transactions, Sessions } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
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
    const user=await Users.create({email,username,passwordHash,coins:signupCoins,isAdmin});
    await Transactions.create({userId:user.id,type:'signup_bonus',amount:signupCoins,description:`Welcome bonus — ${signupCoins} coins`});
    const token=signToken({id:user.id,username:user.username,is_admin:user.is_admin});
    res.cookie('viper_token',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:7*24*60*60*1000})
       .json({ok:true,user:{id:user.id,username:user.username,coins:user.coins,is_admin:user.is_admin}});
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
  } catch(err){res.status(500).json({error:'Login failed'});}
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
  } catch (err) { res.status(500).json({ error: 'Failed to claim daily bonus' }); }
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
  } catch {res.status(500).json({error:'Failed'});}
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
  } catch {res.status(500).json({error:'Failed'});}
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
  } catch {res.status(500).json({error:'Failed'});}
});

router.delete('/delete-account', requireAuth, async (req,res) => {
  try {
    const sr=await Sessions.findByUser(req.user.id);
    for (const s of sr.rows){BotMgr.stopSession(s.id);if(s.phone_number)BotMgr.deleteSessionFiles(s.phone_number);}
    await Users.delete(req.user.id);
    res.clearCookie('viper_token').json({ok:true});
  } catch {res.status(500).json({error:'Failed'});}
});

module.exports = router;
