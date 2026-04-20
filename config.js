/**
 * ╔═══════════════════════════════════════╗
 * ║     ᴠɪᴘᴇʀ ʙᴏᴛ ᴍᴅ — ᴄᴏɴꜰɪɢ           ║
 * ║  Owner: Sarg-Tech & Viper             ║
 * ╚═══════════════════════════════════════╝
 *
 * NOTE: All scalar settings below that can be changed by the bot owner
 * (botName, prefix, selfMode, autoRead, autoTyping, autoSticker,
 *  autoReact, autoStatus) are automatically overridden per-session by
 * the session's settings.json DB when a user runs the corresponding
 * set command (.setbotname, .setprefix, .mode, etc.).
 *
 * This is achieved by the Proxy wrapper at the bottom of this file.
 * You do NOT need to touch individual command files — they all read
 * config.botName / config.prefix etc. and get the session-specific
 * value transparently.
 *
 * ownerNumber / ownerName are NOT proxied — they are the platform
 * super-owner list and must never be overridden per-session.
 */

const raw = {
    ownerNumber: ['2348083086811', '2349041088690'],
    ownerName:   ['Sarg-Tech', 'Viper'],
    ownerGithub: ['remzytech001', 'sargtech1'],
    ownerChatId: '6952558480',

    botName:     'VIPER BOT MD',
    prefix:      '.',
    sessionName: 'session',
    sessionID:   process.env.SESSION_ID || '',
    botVersion:  '2.7',

    newsletterJid: '120363422481725473@newsletter',
    updateZipUrl:  'https://github.com/remzytech001/viperbotmd/archive/refs/heads/main.zip',

    packname:   'VIPER BOT MD',
    packauthor: 'Sarg-Tech',

    selfMode:      false,
    autoRead:      false,
    autoTyping:    false,
    autoBio:       false,
    autoSticker:   false,
    autoReact:     false,
    autoReactMode: 'bot',
    autoStatus:    false,   // renamed from autoDownload

    telegramBotToken: process.env.TG_BOT_TOKEN || '',
    telegramOwnerId:  process.env.TG_OWNER_ID  || '6952558480',

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
        welcomeMessage: '╭╼━≪•ɴᴇᴡ ᴍᴇᴍʙᴇʀ•≫━╾╮\n┃ᴡᴇʟᴄᴏᴍᴇ: @user 👋\n┃ᴍᴇᴍʙᴇʀ: #memberCount\n┃ᴛɪᴍᴇ: time ⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ VIPER BOT MD*',
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
// (via database.getSetting) before falling back to the raw defaults above.
// This means every command that reads config.botName, config.prefix, etc.
// automatically gets the session-specific value — no command files needed
// to be changed individually.
const SESSION_OVERRIDABLE = new Set([
    'botName',
    'prefix',
    'selfMode',
    'autoRead',
    'autoTyping',
    'autoSticker',
    'autoReact',
    'autoReactMode',
    'autoStatus',
    // legacy key kept for backward-compat reads
    'autoDownload',
]);

module.exports = new Proxy(raw, {
    get(target, prop) {
        if (typeof prop === 'string' && SESSION_OVERRIDABLE.has(prop)) {
            try {
                // Lazy-require to avoid circular dependency during module init.
                // Node caches modules so this is effectively free after first load.
                const database = require('./database');
                // autoDownload is the legacy key — redirect to autoStatus in DB
                const dbKey = prop === 'autoDownload' ? 'autoStatus' : prop;
                const val = database.getSetting(dbKey, undefined);
                if (val !== null && val !== undefined) return val;
            } catch (_) {
                // database not ready yet (rare, e.g. during very early boot) — use raw
            }
        }
        return target[prop];
    },
    // Allow direct assignment to raw (e.g. config.prefix = '!' would be unusual
    // but shouldn't silently fail — write to raw and let DB take precedence)
    set(target, prop, value) {
        target[prop] = value;
        return true;
    },
    // Ensure JSON.stringify and Object.keys still work on the raw object
    ownKeys: (target) => Reflect.ownKeys(target),
    getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
});
