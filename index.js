/**
 * ╔══════════════════════════════════════╗
 * ║      ᴠɪᴘᴇʀ ʙᴏᴛ ᴍᴅ — ᴇɴɢɪɴᴇ         ║
 * ║  WhatsApp Bot Platform                ║
 * ╚══════════════════════════════════════╝
 */
process.env.PUPPETEER_SKIP_DOWNLOAD          = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup }         = require('./utils/cleanup');
initializeTempSystem();
startCleanup();

// ── Silence ALL output — only emit the 3 machine-readable signals ───────────
const _rawWrite = process.stdout.write.bind(process.stdout);
const _SIGNALS  = ['PAIR_CODE:', 'BOT_STATUS:CONNECTED', 'LOGGED_OUT:'];
const _isSignal = (...a) => _SIGNALS.some(s => a.join(' ').includes(s));
console.log   = (...a) => { if (_isSignal(...a)) _rawWrite(a.join(' ') + '\n'); };
console.error = () => {};
console.warn  = () => {};

// ── All requires at top-level — never require() inside event handlers ────────
// Calling require() inside a hot event handler is fine for caching, but
// keeping references here avoids repeated property lookups on every message.
const pino    = require('pino');
const fs      = require('fs');
const path    = require('path');
const zlib    = require('zlib');
const os      = require('os');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const qrcode  = require('qrcode-terminal');
const config  = require('./config');
const handler = require('./handler');
const database = require('./database');

// ── Max media size for anti-delete / anti-viewonce (bytes) ──────────────────
// Files larger than this are skipped to prevent OOM on 512 MB Render instances.
// 12 MB covers most images and voice notes. Raise if needed.
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;

// ── Lean in-memory message store ─────────────────────────────────────────────
// Keeps only the last 5 messages per chat (enough for anti-delete).
const store = {
  messages:   new Map(),
  maxPerChat: 5,
  bind(ev) {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;
        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) store.messages.set(jid, new Map());
        const c = store.messages.get(jid);
        c.set(msg.key.id, msg);
        // Evict oldest entry when limit is reached
        if (c.size > store.maxPerChat) c.delete(c.keys().next().value);
      }
    });
  },
  loadMessage: async (jid, id) => store.messages.get(jid)?.get(id) || null,
};

// ── Dedup set — cleared every 2 min (was 5) to keep size small ───────────────
const processed = new Set();
setInterval(() => processed.clear(), 2 * 60 * 1000);

// ── Group metadata cache — avoids repeated API calls for the same group ──────
// Entries expire after 10 minutes so stale data doesn't linger.
const groupCache     = new Map();
const GROUP_CACHE_TTL = 10 * 60 * 1000;

async function cachedGroupMeta(sock, jid) {
  const now    = Date.now();
  const cached = groupCache.get(jid);
  if (cached && now - cached.ts < GROUP_CACHE_TTL) return cached.meta;
  try {
    const meta = await handler.getGroupMetadata(sock, jid);
    if (meta) groupCache.set(jid, { meta, ts: now });
    return meta;
  } catch (_) {
    return null;
  }
}

// Prune expired group cache entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of groupCache) {
    if (now - v.ts > GROUP_CACHE_TTL) groupCache.delete(k);
  }
}, 15 * 60 * 1000);

// ── Safe media download with size cap ────────────────────────────────────────
// Returns a Buffer, or null if the file exceeds MAX_MEDIA_BYTES.
async function downloadCapped(mediaMsg, type) {
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  let total    = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > MAX_MEDIA_BYTES) return null; // too large — abort
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function silentLogger() {
  const l = pino({ level: 'silent' });
  l.debug = l.trace = l.info = () => {};
  return l;
}

function cleanPuppeteer() {
  try {
    const d = path.join(os.homedir(), '.cache', 'puppeteer');
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

// ── ViperBot session decode ──────────────────────────────────────────────────
function loadViperSession(sessionFolder, sessionFile) {
  if (!config.sessionID?.startsWith('ViperBot!')) return false;
  try {
    const b64 = config.sessionID.split('!')[1];
    const dec = zlib.gunzipSync(Buffer.from(b64, 'base64'));
    if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });
    fs.writeFileSync(sessionFile, dec, 'utf8');
    console.log('📡 Session loaded from ViperBot format');
    return true;
  } catch (e) {
    console.error('📡 Session decode failed:', e.message);
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const isSystem = jid =>
  !jid || ['@broadcast', 'status.broadcast', '@newsletter'].some(s => jid.includes(s));

// ── Main bot function ────────────────────────────────────────────────────────
async function startBot() {
  const sessionFolder = process.env.SESSION_DIR
    ? process.env.SESSION_DIR
    : `./${config.sessionName}`;
  const sessionFile = path.join(sessionFolder, 'creds.json');

  loadViperSession(sessionFolder, sessionFile);

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version }          = await fetchLatestBaileysVersion();

  const pairNumber = process.env.PAIR_NUMBER
    ? process.env.PAIR_NUMBER.replace(/[^0-9]/g, '')
    : null;

  const sock = makeWASocket({
    version,
    logger:              silentLogger(),
    printQRInTerminal:   false,
    browser:             Browsers.ubuntu('Chrome'),
    auth:                state,
    syncFullHistory:     false,
    downloadHistory:     false,
    markOnlineOnConnect: false,
    getMessage:          async () => undefined,
    ...(pairNumber ? { qrTimeout: 0 } : {}),
  });

  store.bind(sock.ev);

  // ── Activity watchdog ─────────────────────────────────────────────────────
  let lastActivity = Date.now();
  const wd = setInterval(async () => {
    if (Date.now() - lastActivity > 30 * 60 * 1000 && sock.ws?.readyState === 1) {
      console.log('⚠️  No activity — forcing reconnect...');
      await sock.end();
      clearInterval(wd);
      setTimeout(startBot, 5000);
    }
  }, 5 * 60 * 1000);

  let pairCodeRequested = false;
  let pairAttempts      = 0;
  let bcPoller          = null;

  // ── Connection handler ────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (pairNumber && !pairCodeRequested && !state.creds?.registered) {
        pairCodeRequested = true;
        pairAttempts++;
        try {
          await new Promise(r => setTimeout(r, 800));
          const code = await sock.requestPairingCode(pairNumber);
          const fmt  = code?.length === 8
            ? `${code.slice(0, 4)}-${code.slice(4)}`
            : code;
          console.log(`PAIR_CODE:${fmt}`);
        } catch (e) {
          console.error('❌ Pair code error:', e.message);
          if (pairAttempts < 3) pairCodeRequested = false;
        }
      } else if (!pairNumber) {
        console.log('\n📱 Scan QR with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'close') {
      clearInterval(wd);
      if (sock._keepAliveTimer) { clearInterval(sock._keepAliveTimer); sock._keepAliveTimer = null; }
      if (bcPoller)             { clearInterval(bcPoller); bcPoller = null; }

      const code      = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;

      if (code === 401 || code === DisconnectReason.loggedOut) {
        const sessionNumber = process.env.SESSION_NUMBER || '';
        console.log(`LOGGED_OUT:${sessionNumber}`);
        return;
      }
      if (reconnect) setTimeout(startBot, 3000);
    }

    if (connection === 'open') {
      lastActivity = Date.now();
      const num      = sock.user.id.split(':')[0];
      const botName  = database.getSetting('botName', config.botName);
      const ownerRaw = database.getSetting('ownerDisplayName', null)
                    || database.getSetting('ownerDisplayNumber', null)
                    || process.env.SESSION_NUMBER
                    || database.getSetting('ownerName', database.getSetting('ownerDisplayName', 'Bot Owner'));

      console.log('\n╔══════════════════════════════════════╗');
      console.log(`║  ✅  ${botName.padEnd(32)} ║`);
      console.log(`║  📱  Bot: ${num.padEnd(27)}║`);
      console.log(`║  👑  Owner: ${String(ownerRaw).padEnd(26)}║`);
      console.log('╚══════════════════════════════════════╝\n');
      console.log('BOT_STATUS:CONNECTED');

      if (config.autoBio) {
        try { await sock.updateProfileStatus(`${config.botName} v${config.botVersion} | 24/7 🔥`); } catch (_) {}
      }

      handler.initializeAntiCall(sock);

      // ── Send connected notification to owner with bot image ──────────────
      try {
        const sessionNum = process.env.SESSION_NUMBER
          || (Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber);
        if (sessionNum) {
          const ownerJid  = sessionNum.includes('@') ? sessionNum : `${sessionNum.replace(/\D/g,'')}@s.whatsapp.net`;
          const botImgPath = [
            path.join(__dirname, 'utils', 'bot_image.jpg'),
            path.join(process.cwd(), 'utils', 'bot_image.jpg'),
          ].find(p => fs.existsSync(p));

          const caption =
            `✅ *${botName} IS SUCCESSFULLY CONNECTED* ✔\n\n` +
            `📱 *Bot:* +${num}\n` +
            `⏰ *Time:* ${new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}\n\n` +
            `> _Your bot is online and ready to use!_ 🐍`;

          if (botImgPath) {
            await sock.sendMessage(ownerJid, {
              image: fs.readFileSync(botImgPath),
              caption,
            });
          } else {
            await sock.sendMessage(ownerJid, { text: caption });
          }
        }
      } catch (_) { /* non-fatal — don't crash if DM fails */ }

      if (sock._keepAliveTimer) clearInterval(sock._keepAliveTimer);
      sock._keepAliveTimer = setInterval(async () => {
        try {
          if (sock.ws?.readyState === 1) {
            await sock.sendPresenceUpdate('available');
            lastActivity = Date.now();
          }
        } catch (_) {}
      }, 4 * 60 * 1000);

      // ── Broadcast control file poller ──────────────────────────────────
      const bcFile = path.join(sessionFolder, 'broadcast.json');
      if (bcPoller) clearInterval(bcPoller);
      bcPoller = setInterval(async () => {
        if (!fs.existsSync(bcFile)) return;
        let bc;
        try {
          bc = JSON.parse(fs.readFileSync(bcFile, 'utf8'));
          fs.unlinkSync(bcFile);
        } catch { try { fs.unlinkSync(bcFile); } catch (_) {} return; }

        const { text, mode = 'dm' } = bc;
        if (!text) return;

        try {
          let sent = 0, failed = 0;
          if (mode === 'groups' || mode === 'all') {
            const allChats = await sock.groupFetchAllParticipating();
            for (const [gid] of Object.entries(allChats)) {
              try { await sock.sendMessage(gid, { text }); sent++; await new Promise(r => setTimeout(r, 400)); }
              catch { failed++; }
            }
          }
          if (mode === 'dm' || mode === 'all') {
            const owners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
            for (const num of owners) {
              const jid = num.includes('@') ? num : `${num}@s.whatsapp.net`;
              try { await sock.sendMessage(jid, { text }); sent++; await new Promise(r => setTimeout(r, 300)); }
              catch { failed++; }
            }
          }
          console.log(`[BROADCAST] Sent: ${sent}, Failed: ${failed}`);
        } catch (e) {
          console.error('[BROADCAST] Error:', e.message);
        }
      }, 10000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Single unified messages.upsert handler ────────────────────────────────
  // Previously there were TWO separate listeners on this event — one for the
  // main command handler and one for anti-viewonce. Having two listeners means
  // every incoming message triggers both chains independently. Merged into one.
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    lastActivity = Date.now();

    for (const msg of msgs) {
      if (!msg.message || !msg.key?.id) continue;
      const from = msg.key.remoteJid;
      if (!from || isSystem(from)) continue;

      // ── Main command handler (notify only, dedup, age-gated) ────────────
      if (type === 'notify') {
        const id  = msg.key.id;
        const age = msg.messageTimestamp ? Date.now() - msg.messageTimestamp * 1000 : 0;

        if (!processed.has(id) && age <= 5 * 60 * 1000) {
          processed.add(id);

          if (!store.messages.has(from)) store.messages.set(from, new Map());
          store.messages.get(from).set(id, msg);

          handler.handleMessage(sock, msg).catch(e => {
            if (!e.message?.includes('rate-overlimit') && !e.message?.includes('not-authorized'))
              console.error('Handler error:', e.message);
          });

          setImmediate(async () => {
            if (config.autoRead && from.endsWith('@g.us')) {
              try { await sock.readMessages([msg.key]); } catch (_) {}
            }
            if (from.endsWith('@g.us')) {
              try {
                const gm = await cachedGroupMeta(sock, from);
                if (gm) await handler.handleAntilink(sock, msg, gm);
              } catch (_) {}
            }
          });
        }
      }

      // ── Anti-ViewOnce ────────────────────────────────────────────────────
      if (msg.key?.fromMe) continue;
      if (!database.getSetting('antiviewonce')) continue;

      const m     = msg.message;
      const inner = m.viewOnceMessageV2?.message
                 || m.viewOnceMessageV2Extension?.message
                 || m.viewOnceMessage?.message;
      if (!inner) continue;

      const mtype      = Object.keys(inner)[0];
      const mediaMsgObj = inner[mtype];
      if (!mediaMsgObj) continue;

      const isViewOnce = mediaMsgObj.viewOnce
        || !!m.viewOnceMessageV2
        || !!m.viewOnceMessageV2Extension
        || !!m.viewOnceMessage;
      if (!isViewOnce) continue;

      const sessionNum = process.env.SESSION_NUMBER;
      if (!sessionNum) continue;
      const ownerJid  = `${sessionNum}@s.whatsapp.net`;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNum = senderJid ? senderJid.split('@')[0] : 'Unknown';
      const isGroup   = from.endsWith('@g.us');
      let chatName    = isGroup ? from : `@${senderNum}`;
      if (isGroup) {
        const gm = await cachedGroupMeta(sock, from).catch(() => null);
        if (gm) chatName = gm.subject || from;
      }
      const header = `👁️ *Anti-ViewOnce Alert*\n\n👤 *Sender:* @${senderNum}\n${isGroup ? '👥 *Group*' : '💬 *DM*'}: ${chatName}`;

      try {
        const dlType = mtype === 'imageMessage' ? 'image' : mtype === 'videoMessage' ? 'video' : 'audio';
        const buf    = await downloadCapped(mediaMsgObj, dlType);
        if (!buf) continue; // file too large — skip silently

        if      (mtype === 'imageMessage') await sock.sendMessage(ownerJid, { image: buf, caption: `${header}\n\n🖼️ View-once image`, mentions: [senderJid] });
        else if (mtype === 'videoMessage') await sock.sendMessage(ownerJid, { video: buf, caption: `${header}\n\n🎥 View-once video`, mimetype: 'video/mp4', mentions: [senderJid] });
        else if (mtype === 'audioMessage') {
          await sock.sendMessage(ownerJid, { audio: buf, ptt: mediaMsgObj.ptt || false, mimetype: 'audio/ogg; codecs=opus', mentions: [senderJid] });
          await sock.sendMessage(ownerJid, { text: `${header}\n\n🎵 View-once audio above`, mentions: [senderJid] });
        }
      } catch (e) {
        console.error('[AntiViewOnce] Failed to forward:', e.message);
      }
    }
  });

  // ── Group participant updates ─────────────────────────────────────────────
  sock.ev.on('group-participants.update', async update => {
    await handler.handleGroupUpdate(sock, update);
  });

  // ── Anti-Delete ───────────────────────────────────────────────────────────
  sock.ev.on('messages.delete', async (item) => {
    try {
      if (!database.getSetting('antidelete')) return;

      const keys = item.keys || (item.ids
        ? item.ids.map(id => ({ id, remoteJid: item.jid }))
        : []);

      for (const key of keys) {
        const jid = key.remoteJid;
        if (!jid || jid.endsWith('@newsletter') || jid === 'status@broadcast') continue;

        const cached = store.messages.get(jid)?.get(key.id);
        if (!cached?.message) continue;

        const sessionNum = process.env.SESSION_NUMBER;
        if (!sessionNum) continue;
        const ownerJid  = `${sessionNum}@s.whatsapp.net`;
        const senderJid = cached.key.participant || cached.key.remoteJid;
        const senderNum = senderJid ? senderJid.split('@')[0] : 'Unknown';
        const isGroup   = jid.endsWith('@g.us');
        let chatName    = isGroup ? jid : `@${senderNum}`;
        if (isGroup) {
          const gm = await cachedGroupMeta(sock, jid).catch(() => null);
          if (gm) chatName = gm.subject || jid;
        }
        const header = `🗑️ *Anti-Delete Alert*\n\n👤 *Sender:* @${senderNum}\n${isGroup ? '👥 *Group*' : '💬 *DM*'}: ${chatName}`;

        const m     = cached.message;
        const inner = m.ephemeralMessage?.message
                   || m.viewOnceMessageV2?.message
                   || m.viewOnceMessage?.message
                   || m;

        try {
          if (inner.conversation || inner.extendedTextMessage) {
            const text = inner.conversation || inner.extendedTextMessage?.text || '';
            await sock.sendMessage(ownerJid, { text: `${header}\n\n💬 *Message:*\n${text}`, mentions: [senderJid] });

          } else if (inner.imageMessage) {
            const buf = await downloadCapped(inner.imageMessage, 'image');
            if (buf) await sock.sendMessage(ownerJid, { image: buf, caption: `${header}\n\n🖼️ Deleted image`, mentions: [senderJid] });
            else     await sock.sendMessage(ownerJid, { text: `${header}\n\n🖼️ Deleted image (too large to forward)`, mentions: [senderJid] });

          } else if (inner.videoMessage) {
            const buf = await downloadCapped(inner.videoMessage, 'video');
            if (buf) await sock.sendMessage(ownerJid, { video: buf, caption: `${header}\n\n🎥 Deleted video`, mentions: [senderJid] });
            else     await sock.sendMessage(ownerJid, { text: `${header}\n\n🎥 Deleted video (too large to forward)`, mentions: [senderJid] });

          } else if (inner.audioMessage) {
            const buf = await downloadCapped(inner.audioMessage, 'audio');
            if (buf) await sock.sendMessage(ownerJid, { audio: buf, ptt: inner.audioMessage.ptt || false, mimetype: 'audio/ogg; codecs=opus', mentions: [senderJid] });
            else     await sock.sendMessage(ownerJid, { text: `${header}\n\n🎵 Deleted audio (too large to forward)`, mentions: [senderJid] });

          } else if (inner.stickerMessage) {
            const buf = await downloadCapped(inner.stickerMessage, 'sticker');
            if (buf) {
              await sock.sendMessage(ownerJid, { sticker: buf });
              await sock.sendMessage(ownerJid, { text: `${header}\n\n🗑️ Deleted sticker above`, mentions: [senderJid] });
            }
          } else {
            await sock.sendMessage(ownerJid, { text: `${header}\n\n⚠️ Deleted message (type: ${Object.keys(inner)[0]})`, mentions: [senderJid] });
          }
        } catch (e) {
          console.error('[AntiDelete] Failed to forward:', e.message);
        }
      }
    } catch (err) {
      console.error('[AntiDelete] Error:', err.message);
    }
  });

  sock.ev.on('error', err => {
    const c = err?.output?.statusCode;
    if (![515, 503, 408].includes(c)) console.error('Socket error:', err.message || err);
  });

  return sock;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log('🐍 VIPER BOT MD engine booting...');
cleanPuppeteer();

startBot().catch(e => {
  console.error('Boot error:', e);
  process.exit(1);
});

process.on('uncaughtException', err => {
  if (err.code === 'ENOSPC') {
    try { require('./utils/cleanup').cleanupOldFiles(); } catch (_) {}
    return;
  }
  console.error('Uncaught:', err.message || err);
});

process.on('unhandledRejection', err => {
  if (!err || err?.code === 'ENOSPC' || err?.message?.includes('rate-overlimit')) return;
  console.error('Unhandled:', err?.message || err);
});

module.exports = { store };
