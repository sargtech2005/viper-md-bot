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

// ── Console filter — suppress ONLY noisy Baileys internals, keep everything else ──
// Previously ALL output was suppressed unless it matched a signal keyword.
// This was causing: blank session logs, invisible errors, and no way to debug.
// Now we only drop the high-frequency Baileys protocol noise.
const _rawWrite   = process.stdout.write.bind(process.stdout);
const _rawErrWrite = process.stderr.write.bind(process.stderr);
const _SIGNALS    = ['PAIR_CODE:', 'BOT_STATUS:CONNECTED', 'LOGGED_OUT:', 'PAIR_ERROR:', 'BOT_WARN:'];
const _isSignal   = (...a) => _SIGNALS.some(s => a.join(' ').includes(s));

// Noisy Baileys lines that flood logs with no useful info
const _SUPPRESS_PATTERNS = [
  'noise_', 'handshake', 'recv data', 'send data', 'keepalive',
  'ping WA', 'connection noise', 'got ping', 'sending ping',
  'tag:', 'msgRetryMap', 'proto decode', 'deciphered',
];
const _isSuppressed = (...a) => {
  const msg = a.join(' ').toLowerCase();
  return _SUPPRESS_PATTERNS.some(p => msg.includes(p));
};

console.log = (...a) => {
  if (_isSuppressed(...a)) return; // drop Baileys noise
  _rawWrite(a.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ') + '\n');
};
console.error = (...a) => {
  if (_isSuppressed(...a)) return;
  _rawErrWrite(a.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ') + '\n');
};
console.warn = (...a) => {
  if (_isSuppressed(...a)) return;
  _rawWrite(a.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ') + '\n');
};

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
const MAX_MEDIA_BYTES = 64 * 1024 * 1024; // 64MB — safe on 2GB Fly.io machine

// ── Owner JID resolver ────────────────────────────────────────────────────────
// SESSION_NUMBER may not be set on Render — always fall back to ownerNumber.
function resolveOwnerJid() {
  const raw = process.env.SESSION_NUMBER
    || (Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber)
    || database.getSetting('ownerDisplayNumber', null);
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
}

// ── Lean in-memory message store ─────────────────────────────────────────────
// Keeps last 50 messages per chat. Anti-delete needs a larger window because
// messages can be deleted long after they were sent.
const store = {
  messages:   new Map(),
  maxPerChat: 200, // 2GB RAM — keep 200 msgs/chat for better anti-delete coverage
  bind(ev) {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id || !msg.key?.remoteJid) continue;
        const jid = msg.key.remoteJid;
        // Skip system/broadcast JIDs
        if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;
        if (!store.messages.has(jid)) store.messages.set(jid, new Map());
        const c = store.messages.get(jid);
        c.set(msg.key.id, msg);
        if (c.size > store.maxPerChat) c.delete(c.keys().next().value);
      }
    });
  },
  loadMessage: async (jid, id) => store.messages.get(jid)?.get(id) || null,
};

// ── Dedup set — cleared every 2 min (was 5) to keep size small ───────────────
const processed = new Set();
// Dedup: prune entries older than 5min instead of blanket clear every 2min
// This prevents re-processing while still bounding memory usage
const _processedTs = new Map(); // id -> timestamp
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, ts] of _processedTs) {
    if (ts < cutoff) { processed.delete(k); _processedTs.delete(k); }
  }
}, 60 * 1000); // prune every 1 minute

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
let _connectedNotified = false; // module-level — survives reconnects, resets only on full restart

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
    logger:                silentLogger(),
    printQRInTerminal:     false,
    browser:               Browsers.ubuntu('Chrome'),
    auth:                  state,
    syncFullHistory:       false,
    downloadHistory:       false,
    markOnlineOnConnect:   false,
    getMessage:            async (key) => store.loadMessage(key.remoteJid, key.id),
    // ── Fly.io High-Performance Tuning ───────────────────────────────────────
    keepAliveIntervalMs:   10_000,   // 10s pings — Fly's NAT keeps connections alive, no need to over-ping
    connectTimeoutMs:      30_000,   // faster connect timeout — Fly machines boot fast
    defaultQueryTimeoutMs: 20_000,   // 20s is plenty; Fly has low latency to WA servers
    retryRequestDelayMs:   250,      // retry faster — Fly is stable, transient errors are rare
    generateHighQualityLinkPreview: false, // skip link previews — saves CPU
    transactionOpts: { maxCommitRetries: 5, delayBetweenTriesMs: 500 },
    ...(pairNumber ? { qrTimeout: 0 } : {}),
  });

  store.bind(sock.ev);

  // ── Activity watchdog DISABLED ────────────────────────────────────────────
  // Auto-kill after 30min inactivity caused bots to stop replying in quiet groups.
  // keepAliveIntervalMs pings keep the WS alive instead.
  let lastActivity = Date.now();
  const wd = null; // watchdog disabled

  let pairCodeRequested  = false;
  let pairAttempts       = 0;
  let bcPoller           = null;

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
          const serverUtc = new Date().toISOString();
          console.log(`PAIR_CODE:${fmt}`);
          console.warn(`BOT_WARN:Server UTC when code generated: ${serverUtc}`);
        } catch (e) {
          console.error(`PAIR_ERROR:requestPairingCode failed — ${e.message}`);
          if (pairAttempts < 3) pairCodeRequested = false;
        }
      } else if (!pairNumber) {
        console.log('\n📱 Scan QR with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'close') {
      if (wd) clearInterval(wd);
      if (sock._keepAliveTimer) { clearInterval(sock._keepAliveTimer); sock._keepAliveTimer = null; }
      if (bcPoller)             { clearInterval(bcPoller); bcPoller = null; }

      const code      = lastDisconnect?.error?.output?.statusCode;
      const reason    = lastDisconnect?.error?.message || 'unknown';
      const reconnect = code !== DisconnectReason.loggedOut;

      if (code === 401 || code === DisconnectReason.loggedOut) {
        const sessionNumber = process.env.SESSION_NUMBER || '';
        console.log(`LOGGED_OUT:${sessionNumber}`);
        return;
      }

      // If we were in pairing mode and dropped before completing — don't silently
      // loop. Surface the error so the user can retry from the dashboard.
      if (pairNumber && !state.creds?.registered) {
        console.error(`PAIR_ERROR:Connection dropped (code ${code || 'none'}) — ${reason}`);
        // Auto-retry — watchLog is still alive waiting for the next PAIR_CODE
        setTimeout(startBot, 2000);
        return;
      }

      if (reconnect) setTimeout(startBot, 3000);
    }

    if (connection === 'open') {
      lastActivity = Date.now();
      if (_connectedNotified) return; // already sent — don't spam on every reconnect
      _connectedNotified = true;
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
          processed.add(id); _processedTs.set(id, Date.now());

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
      // Runs for ALL message types (notify + append), not just commands.
      // Must be outside the type === 'notify' block so it catches every message.
      if (msg.key?.fromMe) continue;
      if (!database.getSetting('antiviewonce')) continue;

      const _m = msg.message;
      if (!_m) continue;

      // ── Detect view-once across all WhatsApp wrapping formats ────────────
      // Format A: viewOnceMessageV2 / viewOnceMessageV2Extension / viewOnceMessage (wrapped)
      // Format B: imageMessage.viewOnce = true / videoMessage.viewOnce = true (direct flag)
      let _inner = null;

      const _wrapped = _m.viewOnceMessageV2?.message
                    || _m.viewOnceMessageV2Extension?.message
                    || _m.viewOnceMessage?.message;
      if (_wrapped) {
        _inner = _wrapped;
      } else {
        // Format B — direct viewOnce flag on the media message itself
        for (const k of ['imageMessage', 'videoMessage', 'audioMessage']) {
          if (_m[k]?.viewOnce) { _inner = { [k]: _m[k] }; break; }
        }
      }

      if (!_inner) continue; // not a view-once message

      const _mtype     = Object.keys(_inner)[0];
      const _mediaObj  = _inner[_mtype];
      if (!_mediaObj) continue;

      // ── Resolve owner JID (fix: don't require SESSION_NUMBER env var) ────
      const _ownerJid = resolveOwnerJid();
      if (!_ownerJid) continue;

      const _senderJid = msg.key.participant || msg.key.remoteJid;
      const _senderNum = _senderJid ? _senderJid.split('@')[0] : 'Unknown';
      const _isGroup   = from.endsWith('@g.us');
      let _chatName    = _isGroup ? from : `@${_senderNum}`;
      if (_isGroup) {
        const _gm = await cachedGroupMeta(sock, from).catch(() => null);
        if (_gm) _chatName = _gm.subject || from;
      }
      const _header = `👁️ *Anti-ViewOnce Alert*\n\n👤 *Sender:* @${_senderNum}\n${_isGroup ? '👥 *Group*' : '💬 *DM*'}: ${_chatName}`;

      try {
        const _dlType = _mtype === 'imageMessage' ? 'image'
                      : _mtype === 'videoMessage' ? 'video' : 'audio';
        const _buf = await downloadCapped(_mediaObj, _dlType);
        if (!_buf) {
          // File too large — send a text notice instead of silently failing
          await sock.sendMessage(_ownerJid, {
            text: `${_header}\n\n⚠️ View-once ${_dlType} (too large to forward >12MB)`,
            mentions: [_senderJid],
          });
          continue;
        }

        if (_mtype === 'imageMessage') {
          await sock.sendMessage(_ownerJid, {
            image: _buf, caption: `${_header}\n\n🖼️ View-once image`, mentions: [_senderJid],
          });
        } else if (_mtype === 'videoMessage') {
          await sock.sendMessage(_ownerJid, {
            video: _buf, caption: `${_header}\n\n🎥 View-once video`, mimetype: 'video/mp4', mentions: [_senderJid],
          });
        } else {
          await sock.sendMessage(_ownerJid, {
            audio: _buf, ptt: _mediaObj.ptt || false, mimetype: 'audio/ogg; codecs=opus',
          });
          await sock.sendMessage(_ownerJid, {
            text: `${_header}\n\n🎵 View-once audio above`, mentions: [_senderJid],
          });
        }
      } catch (_e) {
        console.error('[AntiViewOnce]', _e.message);
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

      // Baileys fires this event in two formats:
      // Format A: { keys: [{ id, remoteJid, fromMe, participant }] }
      // Format B: { jid: string, ids: string[] }
      // Handle both.
      let keys = [];
      if (Array.isArray(item.keys) && item.keys.length) {
        keys = item.keys;
      } else if (item.jid && Array.isArray(item.ids)) {
        keys = item.ids.map(id => ({ id, remoteJid: item.jid }));
      } else if (item.id && item.remoteJid) {
        keys = [item]; // single key object
      }

      if (!keys.length) return;

      const ownerJid = resolveOwnerJid();
      if (!ownerJid) return; // no owner number configured

      for (const key of keys) {
        const jid = key.remoteJid;
        if (!jid) continue;
        if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;

        const cached = store.messages.get(jid)?.get(key.id);
        if (!cached?.message) continue; // not in cache — can't recover

        const senderJid = cached.key.participant || cached.key.remoteJid;
        const senderNum = senderJid ? senderJid.split('@')[0] : 'Unknown';
        const isGroup   = jid.endsWith('@g.us');
        let chatName    = isGroup ? jid : `@${senderNum}`;
        if (isGroup) {
          const gm = await cachedGroupMeta(sock, jid).catch(() => null);
          if (gm) chatName = gm.subject || jid;
        }
        const header = `🗑️ *Anti-Delete Alert*\n\n👤 *Sender:* @${senderNum}\n${isGroup ? '👥 *Group*' : '💬 *DM*'}: ${chatName}`;

        // Unwrap ephemeral/viewonce wrappers to get the real message
        const raw   = cached.message;
        const inner = raw.ephemeralMessage?.message
                   || raw.viewOnceMessageV2?.message
                   || raw.viewOnceMessageV2Extension?.message
                   || raw.viewOnceMessage?.message
                   || raw.documentWithCaptionMessage?.message
                   || raw;

        try {
          if (inner.conversation || inner.extendedTextMessage) {
            const text = inner.conversation || inner.extendedTextMessage?.text || '';
            await sock.sendMessage(ownerJid, {
              text: `${header}\n\n💬 *Message:*\n${text}`, mentions: [senderJid],
            });

          } else if (inner.imageMessage) {
            const buf = await downloadCapped(inner.imageMessage, 'image');
            if (buf) {
              await sock.sendMessage(ownerJid, {
                image: buf, caption: `${header}\n\n🖼️ Deleted image`, mentions: [senderJid],
              });
            } else {
              await sock.sendMessage(ownerJid, {
                text: `${header}\n\n🖼️ Deleted image (too large to forward)`, mentions: [senderJid],
              });
            }

          } else if (inner.videoMessage) {
            const buf = await downloadCapped(inner.videoMessage, 'video');
            if (buf) {
              await sock.sendMessage(ownerJid, {
                video: buf, caption: `${header}\n\n🎥 Deleted video`, mentions: [senderJid],
              });
            } else {
              await sock.sendMessage(ownerJid, {
                text: `${header}\n\n🎥 Deleted video (too large to forward)`, mentions: [senderJid],
              });
            }

          } else if (inner.audioMessage) {
            const buf = await downloadCapped(inner.audioMessage, 'audio');
            if (buf) {
              await sock.sendMessage(ownerJid, {
                audio: buf, ptt: inner.audioMessage.ptt || false, mimetype: 'audio/ogg; codecs=opus',
              });
              await sock.sendMessage(ownerJid, {
                text: `${header}\n\n🎵 Deleted audio above`, mentions: [senderJid],
              });
            } else {
              await sock.sendMessage(ownerJid, {
                text: `${header}\n\n🎵 Deleted audio (too large to forward)`, mentions: [senderJid],
              });
            }

          } else if (inner.stickerMessage) {
            const buf = await downloadCapped(inner.stickerMessage, 'sticker');
            if (buf) {
              await sock.sendMessage(ownerJid, { sticker: buf });
              await sock.sendMessage(ownerJid, {
                text: `${header}\n\n🗑️ Deleted sticker above`, mentions: [senderJid],
              });
            }

          } else if (inner.documentMessage) {
            await sock.sendMessage(ownerJid, {
              text: `${header}\n\n📄 Deleted document: _${inner.documentMessage.fileName || 'unknown'}_`,
              mentions: [senderJid],
            });

          } else {
            // Unknown type — at least notify owner
            const type = Object.keys(inner)[0] || 'unknown';
            await sock.sendMessage(ownerJid, {
              text: `${header}\n\n⚠️ Deleted message (type: ${type})`, mentions: [senderJid],
            });
          }
        } catch (e) {
          console.error('[AntiDelete] Forward failed:', e.message);
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
