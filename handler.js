/**
 * Message Handler - Processes incoming messages and executes commands
 */

const config = require('./config');
const database = require('./database');
const { loadCommands } = require('./utils/commandLoader');
const { addMessage } = require('./utils/groupstats');
const levelupCmd      = require('./commands/fun/levelup');
const wcgCmd          = require('./commands/fun/wcg');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ── Per-session setting lookup ─────────────────────────────────────────────
// Reads from the session's settings.json first; falls back to config default.
// This ensures every paired session has its own independent settings.
// Pre-load AI module once — avoids cold-require cost on first message in each chat
let _metaaiMod = null;
function getMetaAI() {
  if (!_metaaiMod) {
    try { _metaaiMod = require('./commands/ai/metaai'); }
    catch (e) { console.error('[Handler] Failed to load metaai:', e.message); return null; }
  }
  return _metaaiMod;
}
// Warm it on startup so first user doesn't pay the load cost
setImmediate(() => getMetaAI());

function dbSetting(key) {
  return database.getSetting(key, config[key]);
}

// Group metadata cache to prevent rate limiting
const groupMetadataCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min cache — 2GB RAM, reduce WA API hammering

// Load all commands
const commands = loadCommands();

// ══════════════════════════════════════════════════════════════════
//  ANTI-BAN ENGINE
//  Every measure here mimics natural human WhatsApp usage to avoid
//  triggering Meta's automated ban systems.
// ══════════════════════════════════════════════════════════════════

// 1. Per-chat cooldown — min gap between bot replies to the same chat
//    Prevents the "machine-gun response" pattern that trips spam filters.
//    Reduced from 1500ms → 500ms. Commands that arrive during the cooldown
//    are now delayed (queued) instead of silently dropped.
const _chatCooldown = new Map();
const CHAT_COOLDOWN_MS = 300; // 0.3s — Fly.io is stable, tighter cooldown

function _getChatCooldownRemaining(jid) {
  const last = _chatCooldown.get(jid) || 0;
  const remaining = CHAT_COOLDOWN_MS - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}
function _markChatUsed(jid) {
  _chatCooldown.set(jid, Date.now());
}
// Prune stale entries every 10 min
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of _chatCooldown) if (v < cutoff) _chatCooldown.delete(k);
}, 10 * 60 * 1000);

// 2. Global rate limiter — max commands per minute across all chats
//    Raised from 25 → 60 (1/sec average). Now sends a message instead of
//    silently dropping so users know the bot received their command.
const _cmdTimestamps = [];
const MAX_CMDS_PER_MIN = 120; // 2GB Fly — handle 2 cmds/sec across all chats

function _isGlobalRateLimited() {
  const now = Date.now();
  // Keep only timestamps within the last 60s
  while (_cmdTimestamps.length && _cmdTimestamps[0] < now - 60000) _cmdTimestamps.shift();
  return _cmdTimestamps.length >= MAX_CMDS_PER_MIN;
}
function _recordCmd() {
  _cmdTimestamps.push(Date.now());
}

// 3. Human-like typing delay — random pause before every reply
//    Natural humans don't respond in <100ms. This prevents the
//    instant-response signature of bots.
function _humanDelay(min = 100, max = 400) { // Fly.io is fast — shorter delays, still human-like
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

// 4. Jitter for bulk operations (tagall, broadcast, etc.)
//    Exported so bulk commands can import and use it.
const bulkDelay = (min = 700, max = 1800) => _humanDelay(min, max);

// 5. AutoReact rate limiter — prevent reacting to every single message
const _reactCooldown = new Map();
const REACT_COOLDOWN_MS = 3000;
function _canReact(jid) {
  const last = _reactCooldown.get(jid) || 0;
  if (Date.now() - last < REACT_COOLDOWN_MS) return false;
  _reactCooldown.set(jid, Date.now());
  return true;
}
setInterval(() => {
  const cutoff = Date.now() - 30000;
  for (const [k, v] of _reactCooldown) if (v < cutoff) _reactCooldown.delete(k);
}, 5 * 60 * 1000);

// Unwrap WhatsApp containers (ephemeral, view once, etc.)
const getMessageContent = (msg) => {
  if (!msg || !msg.message) return null;
  
  let m = msg.message;
  
  // Common wrappers in modern WhatsApp
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  
  // You can add more wrappers if needed later
  return m;
};

// Cached group metadata getter with rate limit handling (for non-admin checks)
const getCachedGroupMetadata = async (sock, groupId) => {
  try {
    // Validate group JID before attempting to fetch
    if (!groupId || !groupId.endsWith('@g.us')) {
      return null;
    }
    
    // Check cache first
    const cached = groupMetadataCache.get(groupId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data; // Return cached data (even if null for forbidden groups)
    }
    
    // Fetch from API
    const metadata = await sock.groupMetadata(groupId);
    
    // Cache it
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    // Handle forbidden (403) errors - cache null to prevent retry storms
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      // Cache null for forbidden groups to prevent repeated attempts
      groupMetadataCache.set(groupId, {
        data: null,
        timestamp: Date.now()
      });
      return null; // Silently return null for forbidden groups
    }
    
    // Handle rate limit errors
    if (error.message && error.message.includes('rate-overlimit')) {
      const cached = groupMetadataCache.get(groupId);
      if (cached) {
        return cached.data;
      }
      return null;
    }
    
    // For other errors, try cached data as fallback
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    
    // Return null instead of throwing to prevent crashes
    return null;
  }
};

// Live group metadata getter (always fresh, no cache) - for admin checks
const getLiveGroupMetadata = async (sock, groupId) => {
  try {
    // Always fetch fresh metadata, bypass cache
    const metadata = await sock.groupMetadata(groupId);
    
    // Update cache for other features (antilink, welcome, etc.)
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    // On error, try cached data as fallback
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    return null;
  }
};

// Alias for backward compatibility (non-admin features use cached)
const getGroupMetadata = getCachedGroupMetadata;

// Helper functions
const isOwner = (sender) => {
  if (!sender) return false;

  // Strip device suffix and domain — always compare bare numbers
  // e.g. "2348083086811:0@s.whatsapp.net" → "2348083086811"
  const senderNumber = sender.split(':')[0].split('@')[0];

  // ── 1. SESSION_NUMBER — the number that paired this bot instance ─────────
  // This is ALWAYS an owner. It's the number that went through the pairing
  // flow and owns this session.
  const sessionNum = (process.env.SESSION_NUMBER || '').split(':')[0].split('@')[0];
  if (sessionNum && senderNumber === sessionNum) return true;

  // ── 2. Extra owner numbers saved in bot settings via .setownernum ────────
  // Stored as a comma-separated string or array in database settings key "ownerNumbers"
  try {
    const db = require('./database');
    const stored = db.getSetting('ownerNumbers', '');
    const extras = (Array.isArray(stored) ? stored : String(stored).split(','))
      .map(n => n.trim().split(':')[0].split('@')[0])
      .filter(Boolean);
    if (extras.includes(senderNumber)) return true;
  } catch {}

  // ── 3. Global env OWNER_NUMBERS (platform/fly.io secret) ─────────────────
  const envOwners = (process.env.OWNER_NUMBERS || '')
    .split(',')
    .map(n => n.trim().split(':')[0].split('@')[0])
    .filter(Boolean);
  if (envOwners.includes(senderNumber)) return true;

  // ── 4. config.ownerNumber (hardcoded fallback, if any) ───────────────────
  const configOwners = (config.ownerNumber || [])
    .map(n => n.trim().split(':')[0].split('@')[0]);
  if (configOwners.includes(senderNumber)) return true;

  return false;
};

const isMod = (sender) => {
  const number = sender.split('@')[0];
  return database.isModerator(number);
};

// LID mapping cache
const lidMappingCache = new Map();

// Helper to normalize JID to just the number part
const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  
  // Remove device ID if present (e.g., "1234567890:0@s.whatsapp.net" -> "1234567890")
  if (jid.includes(':')) {
    return jid.split(':')[0];
  }
  // Remove domain if present (e.g., "1234567890@s.whatsapp.net" -> "1234567890")
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
};

// Get LID mapping value from session files
const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    return lidMappingCache.get(cacheKey);
  }
  
  const sessionPath = path.join(__dirname, config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  
  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
  
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch (error) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

// Normalize JID handling LID conversion
const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    }
    
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    
    if (server === 'hosted') {
      return jidEncode(user, 'hosted');
    }
    return jidEncode(user, 's.whatsapp.net');
  } catch (error) {
    return jid;
  }
};

// Build comparable JID variants (PN + LID) for matching
const buildComparableIds = (jid) => {
  if (!jid) return [];
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return [normalizeJidWithLid(jid)].filter(Boolean);
    }
    
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    variants.add(jidEncode(decoded.user, normalizedServer));
    
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) {
        const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
        variants.add(jidEncode(lidUser, lidServer));
      }
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) {
        const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        variants.add(jidEncode(pnUser, pnServer));
      }
    }
    
    return Array.from(variants);
  } catch (error) {
    return [jid];
  }
};

// Find participant by either PN JID or LID JID
const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  
  if (!targets.length) return null;
  
  return participants.find(participant => {
    if (!participant) return false;
    
    const participantIds = [
      participant.id,
      participant.lid,
      participant.userJid
    ]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

const isAdmin = async (sock, participant, groupId, groupMetadata = null) => {
  if (!participant) return false;
  
  // Early return for non-group JIDs (DMs) - prevents slow sock.groupMetadata() call
  if (!groupId || !groupId.endsWith('@g.us')) {
    return false;
  }
  
  // Always fetch live metadata for admin checks
  let liveMetadata = groupMetadata;
  if (!liveMetadata || !liveMetadata.participants) {
    if (groupId) {
      liveMetadata = await getLiveGroupMetadata(sock, groupId);
    } else {
      return false;
    }
  }
  
  if (!liveMetadata || !liveMetadata.participants) return false;
  
  // Use findParticipant to handle LID matching
  const foundParticipant = findParticipant(liveMetadata.participants, participant);
  if (!foundParticipant) return false;
  
  return foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin';
};

const isBotAdmin = async (sock, groupId, groupMetadata = null) => {
  if (!sock.user || !groupId) return false;
  
  // Early return for non-group JIDs (DMs) - prevents slow sock.groupMetadata() call
  if (!groupId.endsWith('@g.us')) {
    return false;
  }
  
  try {
    // Get bot's JID - Baileys stores it in sock.user.id
    const botId = sock.user.id;
    const botLid = sock.user.lid;
    
    if (!botId) return false;
    
    // Prepare bot JIDs to check - findParticipant will normalize them via buildComparableIds
    const botJids = [botId];
    if (botLid) {
      botJids.push(botLid);
    }
    
    // ALWAYS fetch live metadata for bot admin checks (never use cached)
    const liveMetadata = await getLiveGroupMetadata(sock, groupId);
    
    if (!liveMetadata || !liveMetadata.participants) return false;
    
    const participant = findParticipant(liveMetadata.participants, botJids);
    if (!participant) return false;
    
    return participant.admin === 'admin' || participant.admin === 'superadmin';
  } catch (error) {
    return false;
  }
};

const isUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return urlRegex.test(text);
};

const hasGroupLink = (text) => {
  const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i;
  return linkRegex.test(text);
};

// System JID filter - checks if JID is from broadcast/status/newsletter
const isSystemJid = (jid) => {
  if (!jid) return true;
  return jid.includes('@broadcast') || 
         jid.includes('status.broadcast') || 
         jid.includes('@newsletter') ||
         jid.includes('@newsletter.');
};

// Main message handler
const handleMessage = async (sock, msg) => {
  try {
    // Debug logging to see all messages
    // Debug log removed
    
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    
    // ── Auto-Status: view & acknowledge status updates ────────────────────
    // Status updates arrive from 'status@broadcast'. When autoStatus is ON
    // we mark them as read so they show as viewed on the sender's phone.
    if (from === 'status@broadcast') {
      if (dbSetting('autoStatus')) {
        try {
          await sock.readMessages([msg.key]);
        } catch (_) {}
      }
      return; // never pass status messages to commands
    }

    // System message filter - ignore remaining broadcast/newsletter messages
    if (isSystemJid(from)) {
      return;
    }

    // ── ANTI-BAN: global rate limiter ────────────────────────────────────────
    if (_isGlobalRateLimited()) {
      // Don't silently drop — user deserves to know the bot is busy
      try {
        await sock.sendMessage(from, { text: '⏳ Bot is busy, please wait a moment and try again.' }, { quoted: msg });
      } catch (_) {}
      return;
    }

    // Auto-React System (rate-limited per chat)
    try {
      if (dbSetting('autoReact') && msg.message && !msg.key.fromMe && _canReact(from)) {
        const content = msg.message.ephemeralMessage?.message || msg.message;
        const text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          '';

        const jid = msg.key.remoteJid;
        const emojis = ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'];
        
        const mode = dbSetting('autoReactMode') || 'bot';

        if (mode === 'bot') {
          const prefixList = ['.', '/', '#'];
          if (prefixList.includes(text?.trim()[0])) {
            await sock.sendMessage(jid, {
              react: { text: '⏳', key: msg.key }
            });
          }
        }

        if (mode === 'all') {
          const rand = emojis[Math.floor(Math.random() * emojis.length)];
          await sock.sendMessage(jid, {
            react: { text: rand, key: msg.key }
          });
        }
      }
    } catch (e) {
      console.error('[AutoReact Error]', e.message);
    }
    
    // Unwrap containers first
    const content = getMessageContent(msg);
    // Note: We don't return early if content is null because forwarded status messages might not have content
    
    // Still check for actual message content for regular processing
    let actualMessageTypes = [];
    if (content) {
      const allKeys = Object.keys(content);
      // Filter out protocol/system messages and find actual message content
      const protocolMessages = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
      actualMessageTypes = allKeys.filter(key => !protocolMessages.includes(key));
    }
    
    // We'll check for empty content later after we've processed group messages
    
    // Use the first actual message type (conversation, extendedTextMessage, etc.)
    const messageType = actualMessageTypes[0];
    
    // from already defined above in DM block check
    const isGroup = from.endsWith('@g.us');
    // ── Sender resolution ────────────────────────────────────────────────
    // In newer WhatsApp, when the owner sends from a linked device in a group,
    // msg.key.fromMe=true but msg.key.participant is a LID (e.g. "xxxx@lid")
    // instead of a phone JID. LID→phone mapping requires session files that
    // may not be available, causing isOwner() to return false in groups.
    //
    // Rule: if fromMe=true in ANY context, the sender is the paired phone owner.
    // Use sock.user.id (the bot's own login JID = the owner's number) directly.
    // For group messages from OTHER users, fromMe=false so we use participant.
    const ownerJid = sock.user?.id
      ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
      : null;
    const sender = msg.key.fromMe
      ? (ownerJid || msg.key.participant || msg.key.remoteJid)
      : (isGroup
          ? (msg.key.participant || msg.key.remoteJid)
          : msg.key.remoteJid);
    
    // Fetch group metadata immediately if it's a group
    const groupMetadata = isGroup ? await getGroupMetadata(sock, from) : null;
    
    // Track group message statistics
    if (isGroup) {
      addMessage(from, sender);
    }

    // ── Passive EXP — award on CHAT messages ONLY, NOT commands ─────────────
    // We check if the message starts with a command prefix BEFORE awarding EXP.
    // Casino / game commands must NOT give EXP — only real chat messages do.
    const userId = sender.split('@')[0];
    // Quick body peek just for the EXP check (full body parsed later)
    const _quickBody = (() => {
      const _r = msg.message || {};
      return (_r.conversation || _r.extendedTextMessage?.text || _r.imageMessage?.caption || '').trim();
    })();
    const _expPrefix   = dbSetting('prefix') || '.';
    const _expPrefixes = [...new Set([_expPrefix, '.', '/', '#'])];
    const _isCommand   = _expPrefixes.some(p => _quickBody.startsWith(p));
    const expResult    = _isCommand ? null : levelupCmd.awardPassiveExp(userId, from);
      if (expResult?.leveledUp) {
        const { level, name, emoji } = levelupCmd.getLevelInfo(expResult.newExp);
        // Try sending a level-up image card; fall back to text if it fails
        try {
          const { makeLevelUpCard, fetchPpBase64 } = require('./utils/imageCard');
          const ppBase64 = await fetchPpBase64(sock, sender).catch(() => null);
          // Use stored displayName first (set when they run .levelup), else pushName from this message, else number
          const lvlDisplayName = (database.getUser(userId)||{}).displayName || msg.pushName || userId;
          database.updateUser(userId, { displayName: lvlDisplayName });
          const imgBuf = await makeLevelUpCard({
            username: lvlDisplayName, level, levelName: name,
            exp: expResult.newExp, botName: config.botName, ppBase64,
          });
          const lvlCaption = `🎉 *${lvlDisplayName}* levelled up to *${emoji} Level ${level} — ${name}*!\n\n⭐ Total EXP: *${expResult.newExp.toLocaleString()}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
          await sock.sendMessage(from, {
            image: imgBuf, mimetype: 'image/png',
            caption: lvlCaption,
            mentions: [sender],
          }).catch(() => {});
        } catch {
          const lvlDisplayName = (database.getUser(userId)||{}).displayName || msg.pushName || userId;
          const lvlMsg =
            `🎉 *LEVEL UP!* 🎉\n\n*${lvlDisplayName}* reached *${emoji} Level ${level} — ${name}*\n` +
            `⭐ Total EXP: *${expResult.newExp.toLocaleString()}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
          sock.sendMessage(from, { text: lvlMsg, mentions: [sender] }).catch(() => {});
        }
      }
    
    // Return early only if there is truly no message content object at all.
    // Do NOT return just because all keys are "protocol" types — in Baileys v7
    // group messages often arrive as { messageContextInfo, extendedTextMessage }
    // and we must not drop them. We only hard-bail if content itself is null.
    if (!content) return;

    // ── WCG Word Chain Game — route free-text replies to active games ────────
    // Must happen BEFORE command parsing so plain words reach the game handler.
    // NOTE: `extra` is not a declared variable here — pass the needed fields inline.
    const wcgHandled = await wcgCmd.handleReply(sock, msg, {
      sender,
      from,
      pushName: msg.pushName || msg.verifiedBizName || sender.split('@')[0],
      reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
    }).catch(() => false);
    if (wcgHandled) return;
    
    // 🔹 Button response should also check unwrapped content
    const btn = content.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
    if (btn) {
      const buttonId = btn.selectedButtonId;
      const displayText = btn.selectedDisplayText;
      
      // Handle button clicks by routing to commands
      if (buttonId === 'btn_menu') {
        // Execute menu command
        const menuCmd = commands.get('menu');
        if (menuCmd) {
          await menuCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_ping') {
        // Execute ping command
        const pingCmd = commands.get('ping');
        if (pingCmd) {
          await pingCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_help') {
        // Execute list command again (help)
        const listCmd = commands.get('list');
        if (listCmd) {
          await listCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      }
    }
    
    // Get message body — cover all WhatsApp message wrapping variants
    const raw = msg.message || {};
    let body =
      raw.conversation ||
      raw.extendedTextMessage?.text ||
      raw.imageMessage?.caption ||
      raw.videoMessage?.caption ||
      raw.documentMessage?.caption ||
      raw.buttonsResponseMessage?.selectedDisplayText ||
      raw.listResponseMessage?.singleSelectReply?.selectedRowId ||
      raw.templateButtonReplyMessage?.selectedDisplayText ||
      raw.ephemeralMessage?.message?.conversation ||
      raw.ephemeralMessage?.message?.extendedTextMessage?.text ||
      raw.viewOnceMessage?.message?.imageMessage?.caption ||
      raw.viewOnceMessage?.message?.videoMessage?.caption ||
      '';
    body = (body || '').trim();
    
    // Check antiall protection (owner only feature)
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.antiall) {
        const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
        const senderIsOwner = isOwner(sender);
        
        if (!senderIsAdmin && !senderIsOwner) {
          const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
          if (botIsAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
          }
        }
      }
      
      // Anti-tag protection (check BEFORE text check, as tagall can have no text)
      if (groupSettings.antitag && !msg.key.fromMe) {
        const ctx = content.extendedTextMessage?.contextInfo;
        const mentionedJids = ctx?.mentionedJid || [];
        
        const messageText = (
          body ||
          content.imageMessage?.caption ||
          content.videoMessage?.caption ||
          ''
        );
        
        const textMentions = messageText.match(/@[\d+\s\-()~.]+/g) || [];
        const numericMentions = messageText.match(/@\d{10,}/g) || [];
        
        const uniqueNumericMentions = new Set();
        numericMentions.forEach((mention) => {
          const numMatch = mention.match(/@(\d+)/);
          if (numMatch) uniqueNumericMentions.add(numMatch[1]);
        });
        
        const mentionedJidCount = mentionedJids.length;
        const numericMentionCount = uniqueNumericMentions.size;
        const totalMentions = Math.max(mentionedJidCount, numericMentionCount);
        
        if (totalMentions >= 3) {
          try {
            const participants = groupMetadata.participants || [];
            const mentionThreshold = Math.max(3, Math.ceil(participants.length * 0.5));
            const hasManyNumericMentions = numericMentionCount >= 10 ||
              (numericMentionCount >= 5 && numericMentionCount >= mentionThreshold);
            
            if (totalMentions >= mentionThreshold || hasManyNumericMentions) {
              const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
              const senderIsOwner = isOwner(sender);
              
              if (!senderIsAdmin && !senderIsOwner) {
                const action = (groupSettings.antitagAction || 'delete').toLowerCase();
                
                if (action === 'delete') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { 
                      text: '⚠️ *Tagall Detected!*',
                      mentions: [sender]
                    }, { quoted: msg });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                } else if (action === 'kick') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                  
                  const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
                  if (botIsAdmin) {
                    try {
                      await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    } catch (e) {
                      console.error('Failed to kick for antitag:', e);
                    }
                    const usernames = [`@${sender.split('@')[0]}`];
                    await sock.sendMessage(from, {
                      text: `🚫 *Antitag Detected!*\n\n${usernames.join(', ')} has been kicked for tagging all members.`,
                      mentions: [sender],
                    }, { quoted: msg });
                  }
                }
                return;
              }
            }
          } catch (e) {
            console.error('Error during anti-tag enforcement:', e);
          }
        }
      }
    }
    
    // Anti-group mention protection (check BEFORE prefix check, as these are non-command messages)
    if (isGroup) {
      // Debug logging to confirm we're trying to call the handler
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.antigroupmention) {
        // Debug log removed
      }
      try {
        await handleAntigroupmention(sock, msg, groupMetadata);
      } catch (error) {
        console.error('Error in antigroupmention handler:', error);
      }
    }
    
    // AutoSticker feature - convert images/videos to stickers automatically
    if (isGroup) { // Process all messages in groups (including bot's own messages)
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.autosticker) {
        const mediaMessage = content?.imageMessage || content?.videoMessage;
        
        // Only process if it's an image or video (not documents)
        if (mediaMessage) {
          // Skip autosticker if message has a command prefix (let command handle it)
          const _asDbPfx = dbSetting('prefix') || '.';
          const _asPfxPool = [...new Set([_asDbPfx, '.', '/', '#'])];
          if (!_asPfxPool.some(p => body.startsWith(p))) {
            try {
              // Import sticker command logic
              const stickerCmd = commands.get('sticker');
              if (stickerCmd) {
                // Execute sticker conversion silently
                await stickerCmd.execute(sock, msg, [], {
                  from,
                  sender,
                  isGroup,
                  groupMetadata,
                  isOwner: isOwner(sender),
                  isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                  isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                  isMod: isMod(sender),
                  reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                  react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                return; // Don't process as command after auto-converting
              }
            } catch (error) {
              console.error('[AutoSticker Error]:', error);
              // Continue to normal processing if autosticker fails
            }
          }
        }
      }
    }

     // Check for active bomb games (before prefix check)
    try {
      const bombModule = require('./commands/fun/bomb');
      if (bombModule.gameState && bombModule.gameState.has(sender)) {
        const bombCommand = commands.get('bomb');
        if (bombCommand && bombCommand.execute) {
          // User has active game, process input
          await bombCommand.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          return; // Don't process as command
        }
      }
    } catch (e) {
      // Silently ignore if bomb command doesn't exist or has errors
    }
    
    // Check for active tictactoe games (before prefix check)
    try {
      const tictactoeModule = require('./commands/fun/tictactoe');
      if (tictactoeModule.handleTicTacToeMove) {
        // Check if user is in an active game
        const isInGame = Object.values(tictactoeModule.games || {}).some(room => 
          room.id.startsWith('tictactoe') && 
          [room.game.playerX, room.game.playerO].includes(sender) && 
          room.state === 'PLAYING'
        );
        
        if (isInGame) {
          // User has active game, process input
          const handled = await tictactoeModule.handleTicTacToeMove(sock, msg, {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          if (handled) return; // Don't process as command if move was handled
        }
      }
    } catch (e) {
      // Silently ignore if tictactoe command doesn't exist or has errors
    }
    
    
    // ── Auto-Reply: DMs + @mentions → Gemini AI response ────────────────────
    // Runs BEFORE the prefix check so non-command messages are handled too.
    // Only fires when autoReply is ON and message is not from the bot itself.
    if (!msg.key.fromMe && database.getSetting('autoReply', false)) {
      try {
        const botJid    = sock.user?.id || '';
        const botNumber = botJid.split(':')[0].split('@')[0];

        // Detect DM (not a group) OR a group @mention/reply to the bot
        const isDM = !isGroup;
        const _ctx = content?.extendedTextMessage?.contextInfo
                  || content?.imageMessage?.contextInfo
                  || content?.videoMessage?.contextInfo
                  || content?.documentMessage?.contextInfo
                  || {};
        const mentionedJids  = _ctx.mentionedJid || [];
        const isMentioned    = mentionedJids.some(j => j.includes(botNumber));

        // Detect reply to bot message: quotedMessage participant === bot JID
        const quotedParticipant = _ctx.participant || '';
        const isReplyToBot = quotedParticipant.includes(botNumber) ||
                             (isGroup && _ctx.stanzaId && quotedParticipant === (sock.user?.id || ''));

        // Plain-text @mention in body
        const _bodyMention = body && (body.includes(botNumber) || body.includes('@' + botNumber));
        const _isMentionedFull = isMentioned || _bodyMention || isReplyToBot;

        if ((isDM || _isMentionedFull) && body && !_expPrefixes.some(p => body.startsWith(p))) {
          const _aiMod = getMetaAI();
          if (!_aiMod) return; // module failed to load — don't crash handler
          const { askMetaAI, sendChunks, isCodingRequest, checkCodeRateLimit } = _aiMod;
          const config2  = require('./config');
          const botName2 = database.getSetting('botName', config2.botName) || 'Viper Bot';

          // Coding rate limit (same bucket as .metaai command — can't bypass via autoreply)
          if (isCodingRequest(body)) {
            const _uid = sender.split('@')[0];
            const rl   = checkCodeRateLimit(_uid);
            if (!rl.allowed) {
              await sock.sendMessage(from, {
                text: `⏱️ *Coding limit reached* — ~${rl.waitMins} min(s) remaining.\n_Normal chat is unlimited._`
              }, { quoted: msg });
              return;
            }
          }

          try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}

          // sessionId: bot own number — isolates memory per WhatsApp account
          const _sessionId = (sock.user?.id || '').split(':')[0].split('@')[0];

          let _aiResult;
          try {
            _aiResult = await askMetaAI(from, body, botName2, _sessionId);
          } catch (aiErr) {
            // Log full error so we can debug provider failures
            console.error('[AutoReply] askMetaAI failed:', aiErr.message, aiErr.stack?.split('\n')[1] || '');
            // Send a friendly error instead of silent failure
            await sock.sendMessage(from, {
              text: `❌ AI is temporarily unavailable. Try again shortly.\n_Error: ${aiErr.message}_`
            }, { quoted: msg }).catch(() => {});
            return;
          }

          try {
            await sendChunks(sock, from, _aiResult, msg);
          } catch (sendErr) {
            console.error('[AutoReply] sendChunks failed:', sendErr.message);
          }
          return;
        }
      } catch (e) {
        // Outer catch: only fires for pre-AI errors (body check, rate limit etc)
        console.error('[AutoReply] Setup error:', e.message, e.stack?.split('\n')[1] || '');
      }
    }

    // Check if message starts with ANY allowed prefix (.  /  #  or the DB-configured one)
    const _dbPrefix    = dbSetting('prefix') || '.';
    const _prefixPool  = [...new Set([_dbPrefix, '.', '/', '#'])]; // always include the three standard ones
    const _usedPrefix  = _prefixPool.find(p => body.startsWith(p));
    if (!_usedPrefix) return;

    // Parse command
    const args = body.slice(_usedPrefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    
    // Get command
    const command = commands.get(commandName);
    if (!command) return;
    
    // Check self mode (private mode) - only owner can use commands
    if (dbSetting('selfMode') && !isOwner(sender)) {
      return;
    }
    
    // Permission checks
    if (command.ownerOnly && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.ownerOnly }, { quoted: msg });
    }
    
    if (command.modOnly && !isMod(sender) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: '🔒 This command is only for moderators!' }, { quoted: msg });
    }
    
    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(from, { text: config.messages.groupOnly }, { quoted: msg });
    }
    
    if (command.privateOnly && isGroup) {
      return sock.sendMessage(from, { text: config.messages.privateOnly }, { quoted: msg });
    }
    
    if (command.adminOnly && !(await isAdmin(sock, sender, from, groupMetadata)) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.adminOnly }, { quoted: msg });
    }
    
    if (command.botAdminNeeded) {
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      if (!botIsAdmin) {
        return sock.sendMessage(from, { text: config.messages.botAdminNeeded }, { quoted: msg });
      }
    }
    
    // Auto-typing
    if (dbSetting('autoTyping')) {
      await sock.sendPresenceUpdate('composing', from);
    }

    // ── ANTI-BAN: per-chat cooldown + human-like delay ───────────────────────
    // Wait out any remaining cooldown instead of silently dropping the command.
    const _cooldownWait = _getChatCooldownRemaining(from);
    if (_cooldownWait > 0) await new Promise(r => setTimeout(r, _cooldownWait));
    _markChatUsed(from);
    _recordCmd();
    await _humanDelay(250, 700); // natural pause before every response

    // Execute command — isolated try-catch so a crashing command never
    // kills the handler or disconnects the bot from WhatsApp.
    // 90-second hard timeout prevents media/download commands from freezing
    // the entire bot when an external API hangs indefinitely.
    console.log(`Executing command: ${commandName} from ${sender}`);
    const CMD_TIMEOUT_MS = 90_000;
    try {
      await Promise.race([
        command.execute(sock, msg, args, {
          from,
          sender,
          isGroup,
          groupMetadata,
          isOwner: isOwner(sender),
          isAdmin: await isAdmin(sock, sender, from, groupMetadata),
          isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
          isMod: isMod(sender),
          // pushName: WhatsApp display name set by the user in their profile.
          // Use this everywhere instead of raw phone numbers for a friendly UX.
          pushName: msg.pushName || msg.verifiedBizName || sender.split('@')[0],
          usedPrefix: _usedPrefix,
          prefix: _usedPrefix,  // alias — some commands use extra.prefix
          reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
          react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
          sender
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`Command timed out after ${CMD_TIMEOUT_MS / 1000}s`)), CMD_TIMEOUT_MS)
        ),
      ]);
    } catch (cmdErr) {
      console.error(`[CMD ERROR] ${commandName}:`, cmdErr.message);
      try { await sock.sendMessage(from, { text: `❌ Command error: ${cmdErr.message}` }, { quoted: msg }); } catch (_) {}
    }

    // ── ANTI-BAN: stop typing indicator after command completes ─────────────
    if (dbSetting('autoTyping')) {
      try { await sock.sendPresenceUpdate('paused', from); } catch (_) {}
    }
    
  } catch (error) {
    console.error('Error in message handler:', error);
    
    // Don't send error messages for rate limit errors
    if (error.message && error.message.includes('rate-overlimit')) {
      console.warn('⚠️ Rate limit reached. Skipping error message.');
      return;
    }
    
    try {
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `${config.messages.error}\n\n${error.message}` 
      }, { quoted: msg });
    } catch (e) {
      // Don't log rate limit errors when sending error messages
      if (!e.message || !e.message.includes('rate-overlimit')) {
        console.error('Error sending error message:', e);
      }
    }
  }
};

// Group participant update handler
const handleGroupUpdate = async (sock, update) => {
  try {
    const { id, participants, action } = update;
    
    // Validate group JID before processing
    if (!id || !id.endsWith('@g.us')) {
      return;
    }
    
    const groupSettings = database.getGroupSettings(id);
    
    if (!groupSettings.welcome && !groupSettings.goodbye) return;
    
    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return; // Skip if metadata unavailable (forbidden or error)
    
    // Helper to extract participant JID
    const getParticipantJid = (participant) => {
      if (typeof participant === 'string') {
        return participant;
      }
      if (participant && participant.id) {
        return participant.id;
      }
      if (participant && typeof participant === 'object') {
        // Try to find JID in object
        return participant.jid || participant.participant || null;
      }
      return null;
    };
    
    for (const participant of participants) {
      const participantJid = getParticipantJid(participant);
      if (!participantJid) {
        console.warn('Could not extract participant JID:', participant);
        continue;
      }
      
      const participantNumber = participantJid.split('@')[0];
      
      if (action === 'add' && groupSettings.welcome) {
        try {
          // Get user's display name - find participant using phoneNumber or JID
          let displayName = participantNumber;
          
          // Try to find participant in group metadata
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            // Match by JID or phoneNumber
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          // Get phoneNumber JID to fetch contact name
          let phoneJid = null;
          if (participantInfo && participantInfo.phoneNumber) {
            phoneJid = participantInfo.phoneNumber;
          } else {
            // Try to normalize participantJid to phoneNumber format
            // If it's a LID, try to convert to phoneNumber
            try {
              const normalized = normalizeJidWithLid(participantJid);
              if (normalized && normalized.includes('@s.whatsapp.net')) {
                phoneJid = normalized;
              }
            } catch (e) {
              // If normalization fails, try using participantJid directly if it's a valid JID
              if (participantJid.includes('@s.whatsapp.net')) {
                phoneJid = participantJid;
              }
            }
          }
          
          // Try to get contact name from phoneNumber JID
          if (phoneJid) {
            try {
              // Method 1: Try to get from contact store if available
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
                  displayName = contact.name.trim();
                }
              }
              
              // (contact name lookup limited to local store for performance)
            } catch (contactError) {
              // Silently handle contact errors
            }
          }
          
          // Final fallback: use participantInfo.notify or name if available
          if (displayName === participantNumber && participantInfo) {
            if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
              displayName = participantInfo.notify.trim();
            } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
              displayName = participantInfo.name.trim();
            }
          }
          
          // Get user's profile picture URL
          let profilePicUrl = '';
          try {
            profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
          } catch (ppError) {
            // If profile picture not available, use default avatar
            profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
          }
          
          // Get group name and description
          const groupName = groupMetadata.subject || 'the group';
          const groupDesc = groupMetadata.desc || 'No description';
          
          // Get current time string
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
          
          // Create formatted welcome message
          const welcomeMsg = `╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @${displayName} 👋\n┃Member count: #${groupMetadata.participants.length}\n┃𝚃𝙸𝙼𝙴: ${timeString}⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@${displayName}* Welcome to *${groupName}*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\n${groupDesc}\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${dbSetting('botName')}*`;
          
          // Construct API URL for welcome image
          const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?type=join&textcolor=white&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
          
          // Download the welcome image
          const imageResponse = await axios.get(apiUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);
          
          // Send the welcome image with formatted caption
          await sock.sendMessage(id, { 
            image: imageBuffer,
            caption: welcomeMsg,
            mentions: [participantJid] 
          });
        } catch (welcomeError) {
          // Fallback to text message if image generation fails
          console.error('Welcome image error:', welcomeError);
          let message = groupSettings.welcomeMessage || 'Welcome @user to @group! 👋\nEnjoy your stay!';
          message = message.replace('@user', `@${participantNumber}`);
          message = message.replace('@group', groupMetadata.subject || 'the group');
          
          await sock.sendMessage(id, { 
            text: message, 
            mentions: [participantJid] 
          });
        }
      } else if (action === 'remove' && groupSettings.goodbye) {
        try {
          // Get user's display name - find participant using phoneNumber or JID
          let displayName = participantNumber;
          
          // Try to find participant in group metadata (before they left)
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            // Match by JID or phoneNumber
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          // Get phoneNumber JID to fetch contact name
          let phoneJid = null;
          if (participantInfo && participantInfo.phoneNumber) {
            phoneJid = participantInfo.phoneNumber;
          } else {
            // Try to normalize participantJid to phoneNumber format
            try {
              const normalized = normalizeJidWithLid(participantJid);
              if (normalized && normalized.includes('@s.whatsapp.net')) {
                phoneJid = normalized;
              }
            } catch (e) {
              if (participantJid.includes('@s.whatsapp.net')) {
                phoneJid = participantJid;
              }
            }
          }
          
          // Try to get contact name from phoneNumber JID
          if (phoneJid) {
            try {
              // Method 1: Try to get from contact store if available
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
                  displayName = contact.name.trim();
                }
              }
              
              // (contact lookup: local store only, no live API calls)
            } catch (contactError) {
              // Silently handle contact errors
            }
          }
          
          // Final fallback: use participantInfo.notify or name if available
          if (displayName === participantNumber && participantInfo) {
            if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
              displayName = participantInfo.notify.trim();
            } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
              displayName = participantInfo.name.trim();
            }
          }
          
          // Get user's profile picture URL
          let profilePicUrl = '';
          try {
            profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
          } catch (ppError) {
            // If profile picture not available, use default avatar
            profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
          }
          
          // Get group name and description
          const groupName = groupMetadata.subject || 'the group';
          const groupDesc = groupMetadata.desc || 'No description';
          
          // Get current time string
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
          
          // Create simple goodbye message
          const goodbyeMsg = `Goodbye @${displayName} 👋 We will never miss you!`;
          
          // Construct API URL for goodbye image (using leave type)
          const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?type=leave&textcolor=white&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
          
          // Download the goodbye image
          const imageResponse = await axios.get(apiUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);
          
          // Send the goodbye image with caption
          await sock.sendMessage(id, { 
            image: imageBuffer,
            caption: goodbyeMsg,
            mentions: [participantJid] 
          });
        } catch (goodbyeError) {
          // Fallback to simple goodbye message
          console.error('Goodbye error:', goodbyeError);
          const goodbyeMsg = `Goodbye @${participantNumber} 👋 We will never miss you! 💀`;
          
          await sock.sendMessage(id, { 
            text: goodbyeMsg, 
            mentions: [participantJid] 
          });
        }
      }
    }
  } catch (error) {
    // Silently handle forbidden errors and other group metadata errors
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      // Silently skip forbidden groups
      return;
    }
    // Only log non-forbidden errors
    if (!error.message || !error.message.includes('forbidden')) {
      console.error('Error handling group update:', error);
    }
  }
};

// Antilink handler
const handleAntilink = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antilink) return;
    
    const body = msg.message?.conversation || 
                  msg.message?.extendedTextMessage?.text || 
                  msg.message?.imageMessage?.caption || 
                  msg.message?.videoMessage?.caption || '';
    
    // Comprehensive link detection - matches links with or without protocols
    // Matches: https://t.me/..., http://wa.me/..., t.me/..., wa.me/..., google.com, telegram.com, etc.
    // Pattern breakdown:
    // 1. (https?:\/\/)? - Optional http:// or https://
    // 2. ([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,} - Domain pattern (e.g., google.com, t.me)
    // 3. (\/[^\s]*)? - Optional path after domain
    const linkPattern = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;
    
    // Check for any links (with or without protocol)
    if (linkPattern.test(body)) {
              const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = isOwner(sender);
      
      if (senderIsAdmin || senderIsOwner) return;
      
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action     = (groupSettings.antilinkAction || 'delete').toLowerCase();
      const MAX_WARNS  = config.maxWarnings || 3;
      const senderTag  = `@${sender.split('@')[0]}`;

      // Always delete the link first regardless of action
      try { await sock.sendMessage(from, { delete: msg.key }); } catch (_) {}

      if (action === 'kick' && botIsAdmin) {
        try {
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await sock.sendMessage(from, {
            text: `🔗 *Antilink* — Link removed!

👢 ${senderTag} has been *kicked* for sharing a link.`,
            mentions: [sender],
          });
        } catch (e) { console.error('[Antilink] kick failed:', e.message); }

      } else if (action === 'warn') {
        // Increment warning count for this sender in this group
        const grpData = database.getGroupSettings(from);
        const warnings = grpData.warnings || {};
        const senderId = sender.split('@')[0];
        warnings[senderId] = (warnings[senderId] || 0) + 1;
        database.updateGroupSettings(from, { warnings });

        const count = warnings[senderId];
        if (count >= MAX_WARNS && botIsAdmin) {
          // Max warnings reached — kick
          warnings[senderId] = 0;
          database.updateGroupSettings(from, { warnings });
          try {
            await sock.groupParticipantsUpdate(from, [sender], 'remove');
            await sock.sendMessage(from, {
              text: `🔗 *Antilink* — Link removed!

⚠️ ${senderTag} reached *${MAX_WARNS}/${MAX_WARNS} warnings* and has been *kicked*!`,
              mentions: [sender],
            });
          } catch (e) { console.error('[Antilink] warn-kick failed:', e.message); }
        } else {
          await sock.sendMessage(from, {
            text: `🔗 *Antilink* — Link removed!

⚠️ Warning *${count}/${MAX_WARNS}* for ${senderTag}.
${count >= MAX_WARNS - 1 ? '🚨 _One more link and you will be kicked!_' : '_Repeated links will get you removed._'}`,
            mentions: [sender],
          });
        }

      } else {
        // Default: delete + notify
        try {
          await sock.sendMessage(from, {
            text: `🔗 *Antilink* — Link removed!

${senderTag} please avoid sharing links here.`,
            mentions: [sender],
          });
        } catch (e) { console.error('[Antilink] delete failed:', e.message); }
      }
    }
  } catch (error) {
    console.error('Error in antilink handler:', error);
  }
};


// Anti-group mention handler
const handleAntigroupmention = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    
    // Debug logging to confirm handler is being called
    if (groupSettings.antigroupmention) {
      // Debug log removed
      // Log simplified message info instead of full structure to avoid huge logs
      // Debug log removed
    }
    
    if (!groupSettings.antigroupmention) return;
    
    // Check if this is a forwarded status message that mentions the group
    // Comprehensive detection for various status mention message types
    let isForwardedStatus = false;
    
    if (msg.message) {
      // Direct checks for known status mention message types
      isForwardedStatus = isForwardedStatus || !!msg.message.groupStatusMentionMessage;
      isForwardedStatus = isForwardedStatus || 
        (msg.message.protocolMessage && msg.message.protocolMessage.type === 25); // STATUS_MENTION_MESSAGE
      
      // Check for forwarded newsletter info in various message types
      isForwardedStatus = isForwardedStatus || 
        (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo && 
         msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.conversation && msg.message.contextInfo && 
         msg.message.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.imageMessage && msg.message.imageMessage.contextInfo && 
         msg.message.imageMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.videoMessage && msg.message.videoMessage.contextInfo && 
         msg.message.videoMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.contextInfo && msg.message.contextInfo.forwardedNewsletterMessageInfo);
      
      // Generic check for any forwarded message
      if (msg.message.contextInfo) {
        const ctx = msg.message.contextInfo;
        isForwardedStatus = isForwardedStatus || !!ctx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!ctx.forwardingScore;
        // Additional check for forwarded status specifically
        isForwardedStatus = isForwardedStatus || !!ctx.quotedMessageTimestamp;
      }
      
      // Additional checks for forwarded messages
      if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo) {
        const extCtx = msg.message.extendedTextMessage.contextInfo;
        isForwardedStatus = isForwardedStatus || !!extCtx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!extCtx.forwardingScore;
      }
    }
    
    // Additional debug logging for detection
    if (groupSettings.antigroupmention) {
      // Debug log removed
    }
    
    // Additional debug logging to help identify message structure
    if (groupSettings.antigroupmention) {
      // Debug log removed
      // Debug log removed
      if (msg.message) {
        // Debug log removed
        // Log specific message types that might indicate a forwarded status
        if (msg.message.protocolMessage) {
          // Debug log removed
        }
        if (msg.message.contextInfo) {
          // Debug log removed
        }
        if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo) {
          // Debug log removed
        }
      }
    }
    
    // Debug logging for detection
    if (groupSettings.antigroupmention) {
      // Debug log removed
    }
    
    if (isForwardedStatus) {
      if (groupSettings.antigroupmention) {
        // Process forwarded status message
      }
      
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = isOwner(sender);
      
      if (groupSettings.antigroupmention) {
        // Debug log removed
      }
      
      // Don't act on admins or owners
      if (senderIsAdmin || senderIsOwner) return;
      
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action = (groupSettings.antigroupmentionAction || 'delete').toLowerCase();
      
      if (groupSettings.antigroupmention) {
        // Debug log removed
      }
      
      if (action === 'kick' && botIsAdmin) {
        try {
          if (groupSettings.antigroupmention) {
            // Delete and kick user
          }
          await sock.sendMessage(from, { delete: msg.key });
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          // Silent removal
        } catch (e) {
          console.error('Failed to kick for antigroupmention:', e);
        }
      } else {
        // Default: delete message
        try {
          if (groupSettings.antigroupmention) {
            // Delete message
          }
          await sock.sendMessage(from, { delete: msg.key });
          // Silent deletion
        } catch (e) {
          console.error('Failed to delete message for antigroupmention:', e);
        }
      }
    } else if (groupSettings.antigroupmention) {
      // Debug log removed
    }
  } catch (error) {
    console.error('Error in antigroupmention handler:', error);
  }
};


// Anti-call feature initializer
const initializeAntiCall = (sock) => {
  // Anti-call feature - reject and block incoming calls
  sock.ev.on('call', async (calls) => {
    try {
      // Reload config to get fresh settings
      delete require.cache[require.resolve('./config')];
      const config = require('./config');
      
      if (!config.defaultGroupSettings.anticall) return;

      for (const call of calls) {
        if (call.status === 'offer') {
          // Reject the call
          await sock.rejectCall(call.id, call.from);

          // Block the caller
          await sock.updateBlockStatus(call.from, 'block');

          // Notify user
          await sock.sendMessage(call.from, {
            text: '🚫 Calls are not allowed. You have been blocked.'
          });
        }
      }
    } catch (err) {
      console.error('[ANTICALL ERROR]', err);
    }
  });
};

module.exports = {
  handleMessage,
  handleGroupUpdate,
  handleAntilink,
  handleAntigroupmention,
  initializeAntiCall,
  isOwner,
  isAdmin,
  isBotAdmin,
  isMod,
  getGroupMetadata,
  findParticipant,
  bulkDelay,
};
