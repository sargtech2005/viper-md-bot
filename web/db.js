/**
 * ╔═══════════════════════════════════════╗
 * ║   VIPER BOT MD — PostgreSQL Layer     ║
 * ╚═══════════════════════════════════════╝
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fly Postgres is internal — skip SSL for internal connections, use SSL for external
  ssl: process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('.internal')
    ? false
    : { rejectUnauthorized: false },
  max: 8,                      // 2 machines × 8 = 16 total — Fly Postgres caps at 25, keep buffer
  min: 2,                      // 2 warm connections per machine
  idleTimeoutMillis: 60000,    // Keep idle connections alive longer on Fly
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,      // Never drop pool on idle — keep warm
  keepAlive: true,             // TCP keepalive prevents Fly's NAT from dropping idle connections
  keepAliveInitialDelayMillis: 10000,
});
pool.on('error', err => console.error('[DB] Pool error:', err.message));
const query = (text, params) => pool.query(text, params);

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      username      VARCHAR(50)  UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      coins         INTEGER NOT NULL DEFAULT 50,
      is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
      is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login    TIMESTAMPTZ
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS bot_sessions (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone_number  VARCHAR(20) UNIQUE,
      session_label VARCHAR(100),
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      -- Credentials stored in DB so they survive Render restarts
      creds_data    TEXT,
      creds_updated TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      connected_at  TIMESTAMPTZ,
      last_seen     TIMESTAMPTZ
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS coin_transactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(30) NOT NULL,
      amount      INTEGER NOT NULL,
      description TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS payments (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reference     VARCHAR(100) UNIQUE NOT NULL,
      amount_kobo   INTEGER NOT NULL,
      coins         INTEGER NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      paystack_data JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at   TIMESTAMPTZ
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS site_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const defaults = [
      ['signup_coins','50'], ['session_cost','10'],
      ['maintenance_mode','false'], ['site_name','VIPER BOT MD'],
      ['max_sessions_per_user','0'],
      ['paystack_public_key',''], ['paystack_secret_key',''],
      ['coin_pkg_1_coins','100'], ['coin_pkg_1_ngn','500'],
      ['coin_pkg_2_coins','300'], ['coin_pkg_2_ngn','1200'],
      ['coin_pkg_3_coins','600'], ['coin_pkg_3_ngn','2000'],
      ['coin_pkg_4_coins','1500'],['coin_pkg_4_ngn','4000'],
      ['daily_coins_enabled','false'], ['daily_coins_amount','10'],
    ];
    for (const [k,v] of defaults)
      await client.query(`INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`,[k,v]);

    await client.query('COMMIT');
    console.log('[DB] ✅ Core schema ready');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }

  // ── Column migrations — run OUTSIDE the transaction.
  // ALTER TABLE requires ownership. If the DB user isn't owner (e.g. connecting
  // to an existing Render DB from Fly.io), these fail silently — columns are
  // already present from CREATE TABLE above on new DBs anyway.
  const migrate = async (sql) => {
    try { await pool.query(sql); }
    catch (e) {
      if (!['42701','42501'].includes(e.code)) // 42701=col exists, 42501=no permission
        console.error('[DB] Migration note:', e.message);
    }
  };
  await migrate(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS creds_data TEXT`);
  await migrate(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS creds_updated TIMESTAMPTZ`);
  await migrate(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ`);
  await migrate(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await migrate(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64)`);
  await migrate(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS user_slot INTEGER`);
  await migrate(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS initial_settings JSONB`);
  console.log('[DB] ✅ Schema ready');
}

const Settings = {
  get:    async k    => { const r=await query('SELECT value FROM site_settings WHERE key=$1',[k]); return r.rows[0]?.value??null; },
  getAll: async ()   => { const r=await query('SELECT key,value FROM site_settings ORDER BY key',[]); const o={}; for(const x of r.rows)o[x.key]=x.value; return o; },
  set:    async (k,v)=> query(`INSERT INTO site_settings(key,value,updated_at)VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()`,[k,String(v)]),
  setMany:async map  => { for(const [k,v] of Object.entries(map)) await Settings.set(k,v); },
};

const Users = {
  findByEmail:    e  => query('SELECT * FROM users WHERE email=$1',[e.toLowerCase()]),
  findByUsername: u  => query('SELECT * FROM users WHERE username=$1',[u.toLowerCase()]),
  findById:       id => query('SELECT id,email,username,coins,is_admin,is_banned,is_verified,created_at,last_login FROM users WHERE id=$1',[id]),
  create: async ({email,username,passwordHash,coins,isAdmin,verificationToken})=>{
    const r=await query(
      `INSERT INTO users(email,username,password_hash,coins,is_admin,verification_token,is_verified)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,email,username,coins,is_admin,is_verified,created_at`,
      [email.toLowerCase(),username.toLowerCase(),passwordHash,coins,isAdmin||false,
       verificationToken||null, !verificationToken] // auto-verified when no SMTP
    );
    return r.rows[0];
  },
  verifyEmail: token => query(
    `UPDATE users SET is_verified=TRUE, verification_token=NULL
     WHERE verification_token=$1 AND is_verified=FALSE
     RETURNING id,email,username`,
    [token]
  ),
  updateCoins:    (id,delta) => query('UPDATE users SET coins=coins+$2 WHERE id=$1 RETURNING coins',[id,delta]),
  updateLastLogin: id        => query('UPDATE users SET last_login=NOW() WHERE id=$1',[id]),
  setAdmin:       (id,v)    => query('UPDATE users SET is_admin=$2 WHERE id=$1',[id,v]),
  setBanned:      (id,v)    => query('UPDATE users SET is_banned=$2 WHERE id=$1',[id,v]),
  updatePassword: (id,hash) => query('UPDATE users SET password_hash=$2 WHERE id=$1',[id,hash]),
  updateEmail:    (id,e)    => query('UPDATE users SET email=$2 WHERE id=$1',[id,e.toLowerCase()]),
  list:   (l=50,o=0) => query('SELECT id,email,username,coins,is_admin,is_banned,created_at,last_login FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',[l,o]),
  count:  ()         => query('SELECT COUNT(*) FROM users'),
  search: q          => query(`SELECT id,email,username,coins,is_admin,is_banned,created_at FROM users WHERE email ILIKE $1 OR username ILIKE $1 LIMIT 30`,[`%${q}%`]),
  delete: id         => query('DELETE FROM users WHERE id=$1',[id]),
};

const Sessions = {
  findById:    id    => query('SELECT * FROM bot_sessions WHERE id=$1',[id]),
  findByPhone: phone => query('SELECT * FROM bot_sessions WHERE phone_number=$1',[phone]),
  findByUser:  uid   => query('SELECT id,user_id,phone_number,session_label,status,user_slot,created_at,connected_at,last_seen FROM bot_sessions WHERE user_id=$1 ORDER BY user_slot ASC',[uid]),
  // Resolve a user's session by their per-user slot number (1, 2, 3 ...)
  findBySlot: (uid, slot) => query('SELECT * FROM bot_sessions WHERE user_id=$1 AND user_slot=$2',[uid,slot]),
  // Find the lowest available slot for a user (fills gaps: 1→2→3, deleting 1 frees it)
  nextSlot: async (uid) => {
    const r = await query(
      `SELECT COALESCE(MIN(t.n),1) AS next_slot
       FROM generate_series(1,1000) AS t(n)
       WHERE t.n NOT IN (
         SELECT user_slot FROM bot_sessions WHERE user_id=$1 AND user_slot IS NOT NULL
       )`,
      [uid]
    );
    return parseInt(r.rows[0].next_slot);
  },
  create: async ({userId,phoneNumber,label,initialSettings})=>{
    const slot = await Sessions.nextSlot(userId);
    const r=await query(
      `INSERT INTO bot_sessions(user_id,phone_number,session_label,status,user_slot,initial_settings)
       VALUES($1,$2,$3,'pending',$4,$5) RETURNING *`,
      [userId, phoneNumber||null, label||null, slot, initialSettings ? JSON.stringify(initialSettings) : null]
    );
    return r.rows[0];
  },
  setPhone:     (id,phone)  => query('UPDATE bot_sessions SET phone_number=$2 WHERE id=$1',[id,phone]),
  updateStatus: (id,status) => query(`UPDATE bot_sessions SET status=$2,last_seen=NOW()${status==='connected'?',connected_at=NOW()':''} WHERE id=$1`,[id,status]),
  updateLabel:  (id,label)  => query('UPDATE bot_sessions SET session_label=$2 WHERE id=$1',[id,label||null]),
  updateInitialSettings: (id,settings) =>
    query('UPDATE bot_sessions SET initial_settings=$2 WHERE id=$1',[id, settings ? JSON.stringify(settings) : null]),
  // Save raw creds directory as base64 gzip string
  saveCreds:  (id,data)  => query('UPDATE bot_sessions SET creds_data=$2,creds_updated=NOW() WHERE id=$1',[id,data]),
  loadCreds:  id         => query('SELECT creds_data FROM bot_sessions WHERE id=$1',[id]),
  delete: id => query('DELETE FROM bot_sessions WHERE id=$1',[id]),
  listAll:(l=100,o=0)=>query(`SELECT s.id,s.user_id,s.phone_number,s.session_label,s.status,s.user_slot,s.created_at,s.connected_at,s.last_seen,u.username,u.email FROM bot_sessions s JOIN users u ON s.user_id=u.id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,[l,o]),
  count:         ()     => query('SELECT COUNT(*) FROM bot_sessions'),
  countByStatus: status => query('SELECT COUNT(*) FROM bot_sessions WHERE status=$1',[status]),
  countByUser:   uid    => query('SELECT COUNT(*) FROM bot_sessions WHERE user_id=$1',[uid]),
};

const Transactions = {
  create: ({userId,type,amount,description}) =>
    query('INSERT INTO coin_transactions(user_id,type,amount,description) VALUES($1,$2,$3,$4)',[userId,type,amount,description]),
  findByUser: (uid,limit=20) =>
    query('SELECT * FROM coin_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',[uid,limit]),
  listAll: (l=100,o=0) => query(`
    SELECT t.*,u.username FROM coin_transactions t
    JOIN users u ON t.user_id=u.id ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,[l,o]),
};

const Payments = {
  create: ({userId,reference,amountKobo,coins}) =>
    query(`INSERT INTO payments(user_id,reference,amount_kobo,coins,status) VALUES($1,$2,$3,$4,'pending') RETURNING *`,[userId,reference,amountKobo,coins]),
  findByRef:  ref    => query('SELECT * FROM payments WHERE reference=$1',[ref]),
  findByUser: (uid,l=20) => query('SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',[uid,l]),
  verify: (ref,data) =>
    query(`UPDATE payments SET status='success',paystack_data=$2,verified_at=NOW() WHERE reference=$1 RETURNING *`,[ref,JSON.stringify(data)]),
  listAll: (l=100,o=0) => query(`
    SELECT p.*,u.username,u.email FROM payments p
    LEFT JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,[l,o]),
  revenue: () => query(`SELECT COUNT(*) as count, COALESCE(SUM(amount_kobo),0) as total FROM payments WHERE status='success'`),
};

module.exports = { query, initDB, Users, Sessions, Transactions, Payments, Settings, pool };
