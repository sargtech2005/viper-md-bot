/**
 * ╔═══════════════════════════════════════╗
 * ║          BOT MD — CONFIG              ║
 * ╚═══════════════════════════════════════╝
 *
 * Per-session values (botName, ownerName, prefix, selfMode, autoRead,
 * autoTyping, autoSticker, autoReact, autoReactMode, autoStatus)
 * are automatically overridden from the session's settings.json via
 * the Proxy wrapper below. No command files need changing.
 *
 * Platform super-owners (ownerNumber) come from env vars only.
 * Never hardcode personal numbers here.
 */

const raw = {
    // ── Platform super-owners — set via env vars, never hardcoded ──────────
    ownerNumber: (process.env.OWNER_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean),
    ownerChatId: process.env.OWNER_CHAT_ID || '',

    // ── Bot defaults — overridden per-session from settings.json ───────────
    botName:     'BOT MD',
    prefix:      '.',
    sessionName: 'session',
    sessionID:   process.env.SESSION_ID || '',
    botVersion:  '2.7',

    newsletterJid: process.env.NEWSLETTER_JID || '',
    updateZipUrl:  process.env.UPDATE_ZIP_URL || '',

    packname:   'BOT MD',
    packauthor: 'Bot Owner',

    selfMode:      false,
    autoRead:      false,
    autoTyping:    false,
    autoBio:       false,
    autoSticker:   false,
    autoReact:     false,
    autoReactMode: 'bot',
    autoStatus:    false,

    telegramBotToken: process.env.TG_BOT_TOKEN || '',
    telegramOwnerId:  process.env.TG_OWNER_ID  || '',

    defaultGroupSettings: {
        antilink:              false,
        antilinkAction:        'delete',
        antitag:               false,
        antitagAction:         'delete',
        antiall:               false,
        antiviewonce:          false,
        antibot:               false,
        anticall:              false,
        antigroupmention:      false,
        antigroupmentionAction:'delete',
        welcome:               false,
        welcomeMessage: '╭╼━≪•ɴᴇᴡ ᴍᴇᴍʙᴇʀ•≫━╾╮\n┃ᴡᴇʟᴄᴏᴍᴇ: @user 👋\n┃ᴍᴇᴍʙᴇʀ: #memberCount\n┃ᴛɪᴍᴇ: time ⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ BOT MD*',
        goodbye:               false,
        goodbyeMessage:        "👋 @user just left. Don't let the door hit you 😂",
        antiSpam:              false,
        antidelete:            false,
        nsfw:                  false,
        detect:                false,
        chatbot:               false,
        autosticker:           false,
    },

    messages: {
        ownerOnly:  '❌ *Owner only command!*\n\nOnly the bot owner can use this.',
        adminOnly:  '❌ *Admins only!*\n\nYou need admin rights to run this command.',
        groupOnly:  '❌ *Group command!*\n\nThis command only works in groups.',
        privateOnly:'❌ *Private command!*\n\nThis command only works in private chat.',
        botAdmin:   '❌ *Bot needs admin!*\n\nMake the bot an admin first.',
        cooldown:   '⏱ *Slow down!*\n\nWait a moment before using this command again.',
    },

    maxWarnings: 3,
    antiSpamThreshold: 5,
    antiSpamWindow: 10000,
};

// ── Per-session config override via Proxy ─────────────────────────────────
// Keys in this set are automatically read from the session's settings.json
// before falling back to the raw defaults above.
const SESSION_OVERRIDABLE = new Set([
    'botName',
    'ownerName',     // per-session owner display name
    'packname',      // derives from botName
    'packauthor',    // derives from ownerName
    'prefix',
    'selfMode',
    'autoRead',
    'autoTyping',
    'autoSticker',
    'autoReact',
    'autoReactMode',
    'autoStatus',
    'autoDownload',  // legacy alias for autoStatus
]);

module.exports = new Proxy(raw, {
    get(target, prop) {
        if (typeof prop === 'string' && SESSION_OVERRIDABLE.has(prop)) {
            try {
                const database = require('./database');
                // packname/packauthor derive from botName/ownerName
                if (prop === 'packname') {
                    const v = database.getSetting('botName', undefined);
                    if (v !== null && v !== undefined) return v;
                }
                if (prop === 'packauthor') {
                    const v = database.getSetting('ownerName', undefined)
                           || database.getSetting('ownerDisplayName', undefined);
                    if (v !== null && v !== undefined) return v;
                }
                const dbKey = prop === 'autoDownload' ? 'autoStatus' : prop;
                const val = database.getSetting(dbKey, undefined);
                if (val !== null && val !== undefined) return val;
            } catch (_) {
                // database not ready yet — use raw default
            }
        }
        return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; },
    ownKeys: (target) => Reflect.ownKeys(target),
    getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
});
