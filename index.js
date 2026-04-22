/**
 * ╔══════════════════════════════════════╗
 * ║      ᴠɪᴘᴇʀ ʙᴏᴛ ᴍᴅ — ᴇɴɢɪɴᴇ         ║
 * ║  WhatsApp Bot Platform                ║
 * ╚══════════════════════════════════════╝
 */
process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup }         = require('./utils/cleanup');
initializeTempSystem();
startCleanup();

// ── Silence ALL output — only emit the 3 machine-readable signals ───────────
// bot-manager reads PAIR_CODE:, BOT_STATUS:CONNECTED, LOGGED_OUT: from pipe.
// Everything else is discarded so Render logs stay completely empty.
const _rawWrite = process.stdout.write.bind(process.stdout);
const _SIGNALS  = ['PAIR_CODE:', 'BOT_STATUS:CONNECTED', 'LOGGED_OUT:'];
const _isSignal = (...a) => _SIGNALS.some(s => a.join(' ').includes(s));
console.log   = (...a) => { if (_isSignal(...a)) _rawWrite(a.join(' ') + '\n'); };
console.error = () => {};
console.warn  = () => {};

const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config  = require('./config');
const handler = require('./handler');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const os   = require('os');

// ── Lean in-memory message store ────────────────────────────────────────────
const store = {
  messages:   new Map(),
  maxPerChat: 10, // lowered from 20 — saves ~50% store RAM on free tier
  bind(ev) {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;
        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) store.messages.set(jid, new Map());
        const c = store.messages.get(jid);
        c.set(msg.key.id, msg);
        if (c.size > store.maxPerChat) c.delete(c.keys().next().value);
      }
    });
  },
  loadMessage: async (jid, id) => store.messages.get(jid)?.get(id) || null,
};

const processed = new Set();
setInterval(() => processed.clear(), 5 * 60 * 1000);

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

// ── ViperBot session decode ─────────────────────────────────────────────────
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

// ── Main bot function ────────────────────────────────────────────────────────
async function startBot() {
  // Per-session isolation: SESSION_DIR is set by app.py for each paired number
  const sessionFolder = process.env.SESSION_DIR
    ? process.env.SESSION_DIR
    : `./${config.sessionName}`;
  const sessionFile   = path.join(sessionFolder, 'creds.json');

  loadViperSession(sessionFolder, sessionFile);

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version }          = await fetchLatestBaileysVersion();

  const pairNumber = process.env.PAIR_NUMBER
    ? process.env.PAIR_NUMBER.replace(/[^0-9]/g, '')
    : null;

  // ── Build socket ──────────────────────────────────────────────────────────
  // Use Browsers.ubuntu('Chrome') — simulates a Chrome browser session
  // which WhatsApp accepts and shows the "Enter link code" prompt correctly.
  const sock = makeWASocket({
    version,
    logger:             silentLogger(),
    printQRInTerminal:  false,
    browser:            Browsers.ubuntu('Chrome'),
    auth:               state,
    syncFullHistory:    false,
    downloadHistory:    false,
    markOnlineOnConnect: false,
    getMessage:         async () => undefined,
    // Required for pair code — must NOT generate QR
    ...(pairNumber ? { qrTimeout: 0 } : {}),
  });

  store.bind(sock.ev);

  // ── Activity watchdog ─────────────────────────────────────────────────────
  let lastActivity = Date.now();
  sock.ev.on('messages.upsert', () => { lastActivity = Date.now(); });

  const wd = setInterval(async () => {
    if (Date.now() - lastActivity > 30 * 60 * 1000 && sock.ws?.readyState === 1) {
      console.log('⚠️  No activity — forcing reconnect...');
      await sock.end();
      clearInterval(wd);
      setTimeout(startBot, 5000);
    }
  }, 5 * 60 * 1000);

  // ── Pair code: request it the moment WhatsApp signals it's ready (qr event)
  // This is the CORRECT Baileys pairing flow:
  //   WhatsApp server fires the "qr" event when it's ready for a new device.
  //   Calling requestPairingCode() at that moment makes WhatsApp show the
  //   "Enter code on linked device" prompt on the phone.
  // ──────────────────────────────────────────────────────────────────────────
  let pairCodeRequested = false;
  let pairAttempts      = 0;
  // FIX: track broadcast poller so it can be cleared on reconnect (memory leak)
  let bcPoller          = null;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (pairNumber && !pairCodeRequested && !state.creds?.registered) {
        // ── PAIR CODE MODE ───────────────────────────────────────────────
        // The qr event fires each time WA is ready for a new device.
        // requestPairingCode() at this point makes WA show the
        // "Enter code on linked device" prompt on the phone.
        pairCodeRequested = true;
        pairAttempts++;
        try {
          // Slight delay — some WA servers need a moment after QR is issued
          await new Promise(r => setTimeout(r, 800));
          const code = await sock.requestPairingCode(pairNumber);
          const fmt  = code?.length === 8
            ? `${code.slice(0,4)}-${code.slice(4)}`
            : code;
          console.log(`PAIR_CODE:${fmt}`);
        } catch (e) {
          console.error('❌ Pair code error:', e.message);
          console.error('💡 Make sure the number is registered on WhatsApp');
          // Allow up to 3 retries on next qr event
          if (pairAttempts < 3) pairCodeRequested = false;
        }
      } else if (!pairNumber) {
        // ── QR MODE ──────────────────────────────────────────────────────
        console.log('\n📱 Scan QR with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'close') {
      clearInterval(wd);
      const code      = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      if ([515, 503, 408].includes(code)) {
        console.log(`⚠️  Connection closed (${code}). Reconnecting...`);
      } else if (code === 401 || code === DisconnectReason.loggedOut) {
        // Emit a machine-readable signal — app.py watches for this and auto-nukes the session
        const sessionNumber = process.env.SESSION_NUMBER || '';
        console.log(`LOGGED_OUT:${sessionNumber}`);
        console.log('❌ Session logged out — signalling app.py to purge session data.');
        return;   // do NOT restart — creds are invalid, re-pairing is required
      } else {
        console.log(`Connection closed: ${lastDisconnect?.error?.message || 'Unknown'}`);
      }
      if (reconnect) setTimeout(startBot, 3000);
    }

    // Clear keep-alive heartbeat + broadcast poller on close
    if (connection === 'close' && sock._keepAliveTimer) {
      clearInterval(sock._keepAliveTimer);
      sock._keepAliveTimer = null;
    }
    if (connection === 'close' && bcPoller) {
      clearInterval(bcPoller);
      bcPoller = null;
    }

    if (connection === 'open') {
      lastActivity = Date.now();
      const num      = sock.user.id.split(':')[0];
      // Read per-session values from DB so the banner reflects what this user set
      const database = require('./database');
      const botName  = database.getSetting('botName',  config.botName);
      const ownerRaw = database.getSetting('ownerDisplayName', null)
                    || database.getSetting('ownerDisplayNumber', null)
                    || process.env.SESSION_NUMBER
                    || database.getSetting('ownerName', database.getSetting('ownerDisplayName', 'Bot Owner'));

      console.log('\n╔══════════════════════════════════════╗');
      console.log(`║  ✅  ${botName.padEnd(32)} ║`);
      console.log(`║  📱  Bot: ${num.padEnd(27)}║`);
      console.log(`║  👑  Owner: ${String(ownerRaw).padEnd(26)}║`);
      console.log('╚══════════════════════════════════════╝\n');
      // Machine-readable token — watchLog listens for exactly this string
      console.log('BOT_STATUS:CONNECTED');

      if (config.autoBio) {
        try {
          await sock.updateProfileStatus(`${config.botName} v${config.botVersion} | 24/7 🔥`);
        } catch (_) {}
      }

      handler.initializeAntiCall(sock);

      // ── Keep-alive heartbeat: prevents WhatsApp dropping the WebSocket
      // Sends a silent presence ping every 4 minutes. Cleared on close.
      if (sock._keepAliveTimer) clearInterval(sock._keepAliveTimer);
      sock._keepAliveTimer = setInterval(async () => {
        try {
          if (sock.ws?.readyState === 1) {
            await sock.sendPresenceUpdate("available");
            lastActivity = Date.now();
          }
        } catch (_) {}
      }, 4 * 60 * 1000);

      // ── Broadcast control file poller ─────────────────────────────────────
      // app.py writes  SESSION_DIR/broadcast.json  to trigger a broadcast.
      // We poll every 3 s, execute, then delete the file so it only fires once.
      const bcFile = path.join(sessionFolder, 'broadcast.json');
      // FIX: clear any previous poller before creating a new one — prevents
      //      duplicate pollers accumulating on each reconnect (memory + CPU leak)
      if (bcPoller) clearInterval(bcPoller);
      bcPoller = setInterval(async () => {
        if (!fs.existsSync(bcFile)) return;
        let bc;
        try {
          bc = JSON.parse(fs.readFileSync(bcFile, 'utf8'));
          fs.unlinkSync(bcFile);          // consume immediately — avoid double-send
        } catch { try { fs.unlinkSync(bcFile); } catch (_) {} return; }

        const { text, mode = 'dm' } = bc;   // mode: 'dm' | 'groups' | 'all'
        if (!text) return;

        try {
          const allChats = mode === 'all' || mode === 'groups'
            ? await sock.groupFetchAllParticipating()
            : {};

          let sent = 0, failed = 0;

          // Send to groups if mode includes groups
          if (mode === 'groups' || mode === 'all') {
            for (const [gid] of Object.entries(allChats)) {
              try {
                await sock.sendMessage(gid, { text });
                sent++;
                await new Promise(r => setTimeout(r, 400)); // rate limit
              } catch { failed++; }
            }
          }

          // Send to owner JIDs (DM mode or 'all' mode)
          if (mode === 'dm' || mode === 'all') {
            const owners = Array.isArray(config.ownerNumber)
              ? config.ownerNumber
              : [config.ownerNumber];
            for (const num of owners) {
              const jid = num.includes('@') ? num : `${num}@s.whatsapp.net`;
              try {
                await sock.sendMessage(jid, { text });
                sent++;
                await new Promise(r => setTimeout(r, 300));
              } catch { failed++; }
            }
          }

          console.log(`[BROADCAST] Sent: ${sent}, Failed: ${failed}`);
        } catch (e) {
          console.error('[BROADCAST] Error:', e.message);
        }
      }, 10000); // 10s poll — saves CPU on free tier (was 3s)
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Message filter ────────────────────────────────────────────────────────
  const isSystem = jid =>
    !jid || ['@broadcast','status.broadcast','@newsletter'].some(s => jid.includes(s));

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || !msg.key?.id) continue;
      const from = msg.key.remoteJid;
      if (!from || isSystem(from)) continue;
      const id  = msg.key.id;
      if (processed.has(id)) continue;
      const age = msg.messageTimestamp ? Date.now() - msg.messageTimestamp * 1000 : 0;
      if (age > 5 * 60 * 1000) continue;
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
            const gm = await handler.getGroupMetadata(sock, from);
            if (gm) await handler.handleAntilink(sock, msg, gm);
          } catch (_) {}
        }
      });
    }
  });

  sock.ev.on('group-participants.update', async update => {
    await handler.handleGroupUpdate(sock, update);
  });

  // ── Anti-Delete: catch deleted messages and forward to owner DM ──────────
  sock.ev.on('messages.delete', async (item) => {
    try {
      const database = require('./database');
      // item is either { keys: [...] } or { jid, ids: [...] }
      const keys = item.keys || (item.ids ? item.ids.map(id => ({ id, remoteJid: item.jid })) : []);
      for (const key of keys) {
        const jid = key.remoteJid;
        // Skip newsletters/status; allow groups AND DMs
        if (!jid || jid.endsWith('@newsletter') || jid === 'status@broadcast') continue;
        if (!database.getSetting('antidelete')) continue;

        // Retrieve cached message
        const cached = store.messages.get(jid)?.get(key.id);
        if (!cached || !cached.message) continue;

        // Owner = the number that paired this session (SESSION_NUMBER env var)
        const sessionNum = process.env.SESSION_NUMBER;
        if (!sessionNum) continue;
        const ownerJid = `${sessionNum}@s.whatsapp.net`;

        const senderJid = cached.key.participant || cached.key.remoteJid;
        const senderNum = senderJid ? senderJid.split('@')[0] : 'Unknown';

        const isGroupChat = jid.endsWith('@g.us');
        let chatLabel = isGroupChat ? 'Group' : 'DM';
        let chatName = isGroupChat ? jid : `@${senderNum}`;
        if (isGroupChat) {
          try {
            const gm = await handler.getGroupMetadata(sock, jid);
            if (gm) chatName = gm.subject || jid;
          } catch (_) {}
        }

        const header = `🗑️ *Anti-Delete Alert*\n\n👤 *Sender:* @${senderNum}\n${isGroupChat ? '👥' : '💬'} *${chatLabel}:* ${chatName}`;

        const m = cached.message;
        const inner = m.ephemeralMessage?.message || m.viewOnceMessageV2?.message || m.viewOnceMessage?.message || m;

        try {
          if (inner.conversation || inner.extendedTextMessage) {
            const text = inner.conversation || inner.extendedTextMessage?.text || '';
            await sock.sendMessage(ownerJid, { text: `${header}\n\n💬 *Message:*\n${text}`, mentions: [senderJid] });
          } else if (inner.imageMessage) {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(inner.imageMessage, 'image');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            await sock.sendMessage(ownerJid, { image: buf, caption: `${header}\n\n🖼️ Deleted image`, mentions: [senderJid] });
          } else if (inner.videoMessage) {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(inner.videoMessage, 'video');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            await sock.sendMessage(ownerJid, { video: buf, caption: `${header}\n\n🎥 Deleted video`, mentions: [senderJid] });
          } else if (inner.audioMessage) {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(inner.audioMessage, 'audio');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            await sock.sendMessage(ownerJid, { audio: buf, ptt: inner.audioMessage.ptt || false, mimetype: 'audio/ogg; codecs=opus', caption: header, mentions: [senderJid] });
          } else if (inner.stickerMessage) {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(inner.stickerMessage, 'sticker');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            await sock.sendMessage(ownerJid, { sticker: buf });
            await sock.sendMessage(ownerJid, { text: `${header}\n\n🗑️ Deleted sticker above`, mentions: [senderJid] });
          } else {
            await sock.sendMessage(ownerJid, { text: `${header}\n\n⚠️ Deleted message (unsupported type: ${Object.keys(inner)[0]})`, mentions: [senderJid] });
          }
        } catch (sendErr) {
          console.error('[AntiDelete] Failed to forward message:', sendErr.message);
        }
      }
    } catch (err) {
      console.error('[AntiDelete] Error:', err.message);
    }
  });

  // ── Anti-ViewOnce: intercept view-once messages and forward to owner DM ──
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    try {
      const database = require('./database');
      for (const msg of msgs) {
        if (!msg.message || msg.key?.fromMe) continue;
        const jid = msg.key.remoteJid;
        // Skip newsletters/status; allow groups AND DMs
        if (!jid || jid.endsWith('@newsletter') || jid === 'status@broadcast') continue;
        if (!database.getSetting('antiviewonce')) continue;

        const m = msg.message;
        const inner = m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message || m.viewOnceMessage?.message;
        if (!inner) continue;

        const mtype = Object.keys(inner)[0];
        const mediaMsgObj = inner[mtype];
        if (!mediaMsgObj) continue;

        const isViewOnce = mediaMsgObj.viewOnce || !!m.viewOnceMessageV2 || !!m.viewOnceMessageV2Extension || !!m.viewOnceMessage;
        if (!isViewOnce) continue;

        // Owner = the number that paired this session (SESSION_NUMBER env var)
        const sessionNum = process.env.SESSION_NUMBER;
        if (!sessionNum) continue;
        const ownerJid = `${sessionNum}@s.whatsapp.net`;

        const senderJid = msg.key.participant || msg.key.remoteJid;
        const senderNum = senderJid ? senderJid.split('@')[0] : 'Unknown';

        const isGroupChat = jid.endsWith('@g.us');
        let chatLabel = isGroupChat ? 'Group' : 'DM';
        let chatName = isGroupChat ? jid : `@${senderNum}`;
        if (isGroupChat) {
          try {
            const gm = await handler.getGroupMetadata(sock, jid);
            if (gm) chatName = gm.subject || jid;
          } catch (_) {}
        }

        const header = `👁️ *Anti-ViewOnce Alert*\n\n👤 *Sender:* @${senderNum}\n${isGroupChat ? '👥' : '💬'} *${chatLabel}:* ${chatName}`;

        try {
          const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
          const downloadType = mtype === 'imageMessage' ? 'image' : mtype === 'videoMessage' ? 'video' : 'audio';
          const stream = await downloadContentFromMessage(mediaMsgObj, downloadType);
          let buf = Buffer.from([]);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

          if (mtype === 'imageMessage') {
            await sock.sendMessage(ownerJid, { image: buf, caption: `${header}\n\n🖼️ View-once image`, mentions: [senderJid] });
          } else if (mtype === 'videoMessage') {
            await sock.sendMessage(ownerJid, { video: buf, caption: `${header}\n\n🎥 View-once video`, mimetype: 'video/mp4', mentions: [senderJid] });
          } else if (mtype === 'audioMessage') {
            await sock.sendMessage(ownerJid, { audio: buf, ptt: mediaMsgObj.ptt || false, mimetype: 'audio/ogg; codecs=opus', mentions: [senderJid] });
            await sock.sendMessage(ownerJid, { text: `${header}\n\n🎵 View-once audio above`, mentions: [senderJid] });
          }
        } catch (voErr) {
          console.error('[AntiViewOnce] Failed to forward:', voErr.message);
        }
      }
    } catch (err) {
      console.error('[AntiViewOnce] Error:', err.message);
    }
  });

  sock.ev.on('error', err => {
    const c = err?.output?.statusCode;
    if (![515, 503, 408].includes(c)) console.error('Socket error:', err.message || err);
  });

  return sock;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
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
