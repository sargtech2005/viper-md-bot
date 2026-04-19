/**
 * ╔══════════════════════════════════════════════╗
 * ║   VIPER BOT MD — Web Platform                ║
 * ║   viper.name.ng                              ║
 * ╚══════════════════════════════════════════════╝
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

const { initDB }    = require('./db');
const BotMgr        = require('./bot-manager');
const authRoutes    = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const adminRoutes   = require('./routes/admin');
const walletRoutes  = require('./routes/wallet');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000');

// Webhook route must receive raw body — mount BEFORE express.json()
app.use('/api/wallet/webhook', require('./routes/wallet'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

// Rate limiting
app.use('/api/auth/', rateLimit({ windowMs:15*60*1000, max:20, message:{error:'Too many requests'} }));
app.use('/api/',      rateLimit({ windowMs:60*1000, max:150, message:{error:'Slow down'} }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth',     authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/wallet',   walletRoutes);

// Health
app.get('/health', (_, res) => res.json({ ok: true, service: 'VIPER BOT MD', t: new Date().toISOString() }));

// Page routes
const pub = p => (_, res) => res.sendFile(path.join(__dirname, '..', 'public', p));
app.get('/dashboard', pub('dashboard.html'));
app.get('/sessions',  pub('sessions.html'));
app.get('/pair/:id',  pub('pair.html'));
app.get('/wallet',    pub('wallet.html'));
app.get('/settings',  pub('settings.html'));
app.get('/admin',     pub('admin.html'));
app.get('/login',     pub('login.html'));
app.get('/register',  pub('register.html'));

async function boot() {
  console.log('\n🐍 VIPER BOT MD Web Platform booting...\n');
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  🐍 VIPER BOT MD — Web Platform          ║`);
    console.log(`║  🌐 Port ${String(PORT).padEnd(33)}║`);
    console.log(`║  ✅ PostgreSQL connected                  ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });
  await BotMgr.resumeSessions();
  BotMgr.startLogoutMonitor();
}

boot().catch(e => { console.error('❌ Boot failed:', e.message); process.exit(1); });
