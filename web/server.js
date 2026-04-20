/**
 * ╔══════════════════════════════════════════════╗
 * ║   VIPER BOT MD — Web Platform                ║
 * ║   viper.name.ng                              ║
 * ╚══════════════════════════════════════════════╝
 */

// Load .env only if the file exists (on Render, env vars come from the dashboard)
const fs   = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const express      = require('express');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const { initDB }    = require('./db');
const BotMgr        = require('./bot-manager');
const authRoutes    = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const adminRoutes   = require('./routes/admin');
const walletRoutes  = require('./routes/wallet');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000');

// ── Validate required env vars early ─────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set.');
  console.error('   On Render: Dashboard → your service → Environment → add DATABASE_URL');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set — using insecure default. Set it in Render Environment!');
  process.env.JWT_SECRET = 'viper_insecure_default_change_me_in_render_dashboard';
}

// ── Middleware ────────────────────────────────────────────────────────────────
// Webhook needs raw body — mount BEFORE express.json()
app.use('/api/wallet/webhook', walletRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.use('/api/auth/', rateLimit({ windowMs:15*60*1000, max:20, message:{error:'Too many requests'} }));
app.use('/api/',      rateLimit({ windowMs:60*1000,    max:150, message:{error:'Slow down'} }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/wallet',   walletRoutes);

// ── Health check (must always respond — used by Render & UptimeRobot) ─────────
app.get('/health', (_, res) => res.json({ ok: true, service: 'VIPER BOT MD', t: new Date().toISOString() }));

// ── Page routes ───────────────────────────────────────────────────────────────
const pub = p => (_, res) => res.sendFile(path.join(__dirname, '..', 'public', p));
app.get('/dashboard', pub('dashboard.html'));
app.get('/sessions',  pub('sessions.html'));
app.get('/pair/:id',  pub('pair.html'));
app.get('/wallet',    pub('wallet.html'));
app.get('/settings',  pub('settings.html'));
app.get('/admin',     pub('admin.html'));
app.get('/login',     pub('login.html'));
app.get('/register',  pub('register.html'));

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  console.log('\n🐍 VIPER BOT MD Web Platform booting...');
  console.log(`   NODE_ENV    : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   PORT        : ${PORT}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ set' : '❌ MISSING'}`);
  console.log(`   JWT_SECRET  : ${process.env.JWT_SECRET  ? '✅ set' : '⚠️  using default'}`);
  console.log(`   ADMIN_EMAIL : ${process.env.ADMIN_EMAIL || '(not set)'}\n`);

  // Start HTTP server first so Render's health check can reach /health immediately
  await new Promise(resolve => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 HTTP server listening on port ${PORT}`);
      resolve();
    });
  });

  // Connect to database with retry (Render DB can take a moment on first deploy)
  let dbReady = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await initDB();
      dbReady = true;
      console.log('✅ PostgreSQL connected and schema ready');
      break;
    } catch (err) {
      console.error(`❌ DB connection attempt ${attempt}/5 failed:`, err.message || err);
      if (attempt < 5) {
        console.log(`   Retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  if (!dbReady) {
    console.error('❌ Could not connect to PostgreSQL after 5 attempts. Check DATABASE_URL.');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🐍 VIPER BOT MD — Web Platform  LIVE   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Resume any previously connected bot sessions
  await BotMgr.resumeSessions();
  BotMgr.startLogoutMonitor();
}

boot().catch(e => {
  console.error('❌ Fatal boot error:', e?.message || e);
  console.error(e?.stack || '');
  process.exit(1);
});

// ── Startup / Admin Promotion ─────────────────────────────────────────────────
// Visit /startup to promote ADMIN_EMAIL to admin in the database.
// Safe to run multiple times (idempotent). Remove or protect after first use.
app.get('/startup', async (req, res) => {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (!adminEmail) {
    return res.json({ ok: false, message: 'ADMIN_EMAIL env var not set.' });
  }
  try {
    const { query } = require('./db');
    const r = await query(
      `UPDATE users SET is_admin = TRUE WHERE LOWER(email) = $1 RETURNING id, email, username`,
      [adminEmail]
    );
    if (!r.rows.length) {
      return res.json({
        ok: false,
        message: `No user found with email "${adminEmail}". Register first, then visit /startup.`
      });
    }
    const u = r.rows[0];
    console.log(`[Startup] Promoted ${u.email} (id=${u.id}) to admin.`);
    res.json({ ok: true, message: `✅ ${u.username} (${u.email}) is now admin. You can log out and back in to see the Admin panel.` });
  } catch(err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});
