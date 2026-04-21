/**
 * ╔══════════════════════════════════════════════╗
 * ║   VIPER BOT MD — Web Platform                ║
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
const crypto       = require('crypto');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.use('/api/auth/', rateLimit({ windowMs:15*60*1000, max:20, message:{error:'Too many requests'} }));
app.use('/api/',      rateLimit({ windowMs:60*1000,    max:150, message:{error:'Slow down'} }));

// ── CSRF — Double-Submit Cookie ───────────────────────────────────────────────
// Sets a readable (non-httpOnly) xsrf-token cookie every request.
// State-changing API calls must echo it back in the X-XSRF-Token header.
// Attackers on other origins cannot read cookies, so they cannot forge the header.
app.use((req, res, next) => {
  if (!req.cookies['xsrf-token']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('xsrf-token', token, {
      httpOnly: false, // must be JS-readable
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies['xsrf-token'];
  }
  next();
});

function csrfProtect(req, res, next) {
  const MUTATING = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!MUTATING.includes(req.method)) return next();
  const header = req.headers['x-xsrf-token'];
  const cookie = req.cookies['xsrf-token'];
  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}
app.use('/api/', csrfProtect);

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/wallet',   walletRoutes);

// ── Health check (must always respond — used by Render & UptimeRobot) ---------
app.get('/health', (_, res) => res.json({ ok: true, service: 'VIPER BOT MD', t: new Date().toISOString() }));

// -- SEO: sitemap.xml ----------------------------------------------------------
app.get('/sitemap.xml', (req, res) => {
  const base = process.env.SITE_URL || `https://${req.hostname}`;
  const now  = new Date().toISOString().split('T')[0];
  const pages = [
    { loc: '/',         changefreq: 'weekly',  priority: '1.0' },
    { loc: '/login',    changefreq: 'monthly', priority: '0.6' },
    { loc: '/register', changefreq: 'monthly', priority: '0.7' },
    { loc: '/dashboard',changefreq: 'weekly',  priority: '0.8' },
    { loc: '/sessions', changefreq: 'weekly',  priority: '0.8' },
    { loc: '/wallet',   changefreq: 'weekly',  priority: '0.7' },
    { loc: '/settings', changefreq: 'monthly', priority: '0.5' },
  ];
  const urls = pages.map(p =>
    '  <url>\n' +
    '    <loc>' + base + p.loc + '</loc>\n' +
    '    <lastmod>' + now + '</lastmod>\n' +
    '    <changefreq>' + p.changefreq + '</changefreq>\n' +
    '    <priority>' + p.priority + '</priority>\n' +
    '  </url>'
  ).join('\n');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls + '\n</urlset>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

// -- SEO: robots.txt -----------------------------------------------------------
app.get('/robots.txt', (req, res) => {
  const base = process.env.SITE_URL || 'https://' + req.hostname;
  res.setHeader('Content-Type', 'text/plain');
  res.send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /admin\n' +
    'Disallow: /api/\n' +
    'Sitemap: ' + base + '/sitemap.xml\n'
  );
});

// ── Page routes ───────────────────────────────────────────────────────────────
const pub = p => (_, res) => res.sendFile(path.join(__dirname, '..', 'public', p));
app.get('/dashboard', pub('dashboard.html'));
app.get('/sessions',  pub('sessions.html'));
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

// ── 404 catch-all (must be after all routes) ──────────────────────────────────
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches anything thrown inside async route handlers that wasn't caught locally.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err?.message || err);
  console.error(err?.stack || '');
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).send('Internal server error');
});


