/**
 * ᴍᴇɴᴜ ᴄᴏᴍᴍᴀɴᴅ — VIPER BOT MD
 * Style 1 : compact header + category shortcuts  (default)
 * Style 2 : header + every command grouped by category
 */
const config   = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');
const fs   = require('fs');
const path = require('path');

// ── Small-caps font mapper ────────────────────────────────────────────────────
const sc = s => {
  const m = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',
             k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',
             u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
  return s.toLowerCase().split('').map(c => m[c] || c).join('');
};

// ── Category meta — shared by both styles ─────────────────────────────────────
// label = what shows in the main menu (branded)
// hint  = the command users type to open that sub-menu (must match nav shortcut name/alias)
// Both menus (Style 1 compact + Style 2 expanded) use this single source of truth,
// so renaming here automatically keeps both menus consistent.
const CAT = {
  general:   { icon: '🐍', hint: '.viper',      label: 'ᴠɪᴘᴇʀ'    },  // core commands
  admin:     { icon: '⚔️', hint: '.squad',      label: 'ꜱQᴜᴀᴅ'    },  // group management
  owner:     { icon: '👑', hint: '.venom',      label: 'ᴠᴇɴᴏᴍ'    },  // owner-only
  fun:       { icon: '🎮', hint: '.arcade',     label: 'ᴀʀᴄᴀᴅᴇ'   },  // games & fun
  ai:        { icon: '🤖', hint: '.nexus',      label: 'ɴᴇxᴜꜱ'    },  // AI suite
  download:  { icon: '📥', hint: '.media',      label: 'ᴍᴇᴅɪᴀ'    },  // downloads & stickers
  utility:   { icon: '🔐', hint: '.vault',      label: 'ᴠᴀᴜʟᴛ'    },  // utility tools
  search:    { icon: '🔍', hint: '.radar',      label: 'ʀᴀᴅᴀʀ'    },  // search
  sports:    { icon: '⚽', hint: '.arena',      label: 'ᴀʀᴇɴᴀ'    },  // sports
  textmaker: { icon: '🖋️', hint: '.studio',     label: 'ꜱᴛᴜᴅɪᴏ'  },  // text art
  developer: { icon: '💻', hint: '.lab',        label: 'ʟᴀʙ'      },  // dev tools
};

// ── Runtime formatter ─────────────────────────────────────────────────────────
function formatRuntime(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const parts = [];
  if (d > 0) parts.push(d + ' day' + (d !== 1 ? 's' : ''));
  if (h > 0) parts.push(h + ' hour' + (h !== 1 ? 's' : ''));
  if (m > 0) parts.push(m + ' minute' + (m !== 1 ? 's' : ''));
  if (parts.length === 0 || s > 0) parts.push(s + ' second' + (s !== 1 ? 's' : ''));
  return parts.join(', ');
}

// ── Build newsletter / forward context ───────────────────────────────────────
function buildCtx(sender) {
  return {
    mentions: [sender],
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid:    database.getSetting('newsletterJid', config.newsletterJid),
        newsletterName:   database.getSetting('botName', config.botName),
        serverMessageId: -1,
      },
    },
  };
}

// ── Resolve menu image ────────────────────────────────────────────────────────
function resolveMenuImage() {
  const sessionImgPath = database.getSetting('menuImagePath', null);
  return [
    sessionImgPath,
    path.join(database.DB_PATH, 'menu_image.jpg'),
    path.join(__dirname, '../../utils/bot_image.jpg'),
    path.join(__dirname, '../utils/bot_image.jpg'),
    path.resolve(process.cwd(), 'utils/bot_image.jpg'),
  ].filter(Boolean).find(p => fs.existsSync(p)) || null;
}

// ── Send helper (image caption or text) ──────────────────────────────────────
async function send(sock, msg, extra, text) {
  const imgPath = resolveMenuImage();
  // Include newsletter/forwarded context in all chats including groups.
  // WhatsApp now supports forwarded-newsletter display in groups — this adds the
  // "View Channel" button automatically.
  const ctx = buildCtx(extra.sender);
  if (imgPath) {
    try {
      await sock.sendMessage(extra.from,
        { image: fs.readFileSync(imgPath), caption: text, ...ctx },
        { quoted: msg });
    } catch (_) {
      // Image send failed — fall back to plain text so the menu always shows
      await sock.sendMessage(extra.from, { text }, { quoted: msg });
    }
  } else {
    await sock.sendMessage(extra.from, { text }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 1 — Classic compact menu (original design)
// ─────────────────────────────────────────────────────────────────────────────
async function renderStyle1(sock, msg, extra, cmds, cats, total) {
  const botName  = database.getSetting('botName', config.botName);
  const prefix   = database.getSetting('prefix',  config.prefix);
  const selfMode = database.getSetting('selfMode', config.selfMode);
  const user     = extra.sender.split('@')[0];
  const ownerDisplay = database.getSetting('ownerDisplayName', null)
    || database.getSetting('ownerDisplayNumber', null)
    || process.env.SESSION_NUMBER
    || 'Bot Owner';
  const now = new Date().toLocaleString('en-NG', { timeZone: config.timezone });

  let t = '';
  t += '┏❐ 《 *' + sc(botName) + ' v' + config.botVersion + '* 》 ❐\n';
  t += '┃\n';
  t += '┣◆ 👤 ' + sc('user') + ': @' + user + '\n';
  t += '┣◆ 🕐 ' + sc('time') + ': ' + now + '\n';
  t += '┣◆ ⚡ ' + sc('prefix') + ': ' + prefix + '\n';
  t += '┣◆ 📦 ' + sc('commands') + ': ' + total + '\n';
  t += '┣◆ 👑 ' + sc('owner') + ': ' + ownerDisplay + '\n';
  t += '┃\n';
  t += '┣◆ *📂 ' + sc('categories') + '* — ᴛʏᴘᴇ ᴛᴏ ᴏᴘᴇɴ:\n';
  t += '┃\n';

  for (const [key, meta] of Object.entries(CAT)) {
    const count = cats[key] ? cats[key].length : 0;
    if (count > 0) {
      t += '┣◆ ' + meta.icon + ' *' + meta.hint + '*  ‹ ' + count + ' ᴄᴍᴅꜱ ›\n';
    }
  }

  t += '┃\n';
  t += '┣◆ 💡 ' + sc('example') + ': *' + prefix + 'admin* → see admin cmds\n';
  t += '┣◆ 🐍 ' + sc('mode') + ': *' + (selfMode ? 'ᴘʀɪᴠᴀᴛᴇ' : 'ᴘᴜʙʟɪᴄ') + '*\n';
  t += '┗❐\n\n';
  t += '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + botName + '* 🐍';

  await send(sock, msg, extra, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 2 — Full expanded category list (new design)
// ─────────────────────────────────────────────────────────────────────────────
async function renderStyle2(sock, msg, extra, cmds, cats, total) {
  const botName  = database.getSetting('botName', config.botName);
  const prefix   = database.getSetting('prefix',  config.prefix);
  const selfMode = database.getSetting('selfMode', config.selfMode);
  const ownerDisplay = database.getSetting('ownerDisplayName', null)
    || database.getSetting('ownerDisplayNumber', null)
    || process.env.SESSION_NUMBER
    || 'Bot Owner';
  const runtime = formatRuntime(Math.floor(process.uptime()));
  const version = config.botVersion || '2.7';

  let t = '';
  t += '┏❐ 《 *' + sc(botName) + ' v' + version + '* 》 ❐\n';
  t += '┃\n';
  t += '*╭┈───〔 ┈───⊷*\n';
  t += '*├▢ 🐍 ' + sc('bot') + ':* ' + botName + '\n';
  t += '*├▢ 🤖 ' + sc('owner') + ':* ' + ownerDisplay + '\n';
  t += '*├▢ 📜 ' + sc('commands') + ':* ' + total + '\n';
  t += '*├▢ ⏱️ ' + sc('runtime') + ':* ' + runtime + '\n';
  t += '*├▢ 📦 ' + sc('prefix') + ':* ' + prefix + '\n';
  t += '*├▢ ⚙️ ' + sc('mode') + ':* ' + (selfMode ? 'ᴘʀɪᴠᴀᴛᴇ' : 'ᴘᴜʙʟɪᴄ') + '\n';
  t += '*├▢ 🏷️ ' + sc('version') + ':* ' + version + '\n';
  t += '*╰───────────────────⊷*\n';

  for (const [key, meta] of Object.entries(CAT)) {
    const list = cats[key];
    if (!list || list.length === 0) continue;

    const sorted = list.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });

    t += '\n`『 ' + meta.icon + ' ' + meta.label + ' 』`\n';
    t += '╭───────────────────⊷\n';
    sorted.forEach(function(cmd) {
      t += '*┋ ⬡ ' + sc(cmd.name) + '*\n';
    });
    t += '╰───────────────────⊷';
  }

  t += '\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + botName + '* 🐍';

  await send(sock, msg, extra, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 3 — Interactive list-message menu (WhatsApp popup style)
// ─────────────────────────────────────────────────────────────────────────────
async function renderStyle3(sock, msg, extra, cmds, cats, total) {
  const botName = database.getSetting('botName', config.botName);
  const prefix  = database.getSetting('prefix',  config.prefix);

  // Build one row per non-empty category
  const rows = [];
  for (const [key, meta] of Object.entries(CAT)) {
    const count = cats[key] ? cats[key].length : 0;
    if (count > 0) {
      // Strip the hardcoded '.' from hint and reapply the live prefix
      const cmdName = meta.hint.replace(/^[^a-zA-Z]+/, ''); // 'viper', 'squad', …
      rows.push({
        title:       meta.icon + ' ' + meta.label,
        description: count + ' commands — tap to browse',
        rowId:       prefix + cmdName,
      });
    }
  }

  try {
    await sock.sendMessage(extra.from, {
      listMessage: {
        title:       '🐍 ' + botName + ' — MENU',
        description: total + ' commands  •  ' + rows.length + ' categories\nPrefix: ' + prefix,
        buttonText:  '📂 Browse Categories',
        footerText:  'Powered by ' + botName,
        listType:    1,          // SINGLE_SELECT
        sections:    [{ title: 'Categories', rows }],
      },
    }, { quoted: msg });
  } catch (_) {
    // Fallback: style 1 compact text if list messages aren't supported
    await renderStyle1(sock, msg, extra, cmds, cats, total);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Command export
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'start'],
  category: 'general',
  description: 'Show all command categories',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const cmds  = loadCommands();
      const cats  = {};
      cmds.forEach(function(cmd, name) {
        if (cmd.name === name && !cmd.isNavShortcut) {
          if (!cats[cmd.category]) cats[cmd.category] = [];
          cats[cmd.category].push(cmd);
        }
      });

      const total = [...cmds.keys()].filter(
        function(k) { return cmds.get(k).name === k && !cmds.get(k).isNavShortcut; }
      ).length;

      const style = database.getSetting('menuStyle', 1);

      if (style === 3) {
        await renderStyle3(sock, msg, extra, cmds, cats, total);
      } else if (style === 2) {
        await renderStyle2(sock, msg, extra, cmds, cats, total);
      } else {
        await renderStyle1(sock, msg, extra, cmds, cats, total);
      }
    } catch (err) {
      await extra.reply('❌ ' + err.message);
    }
  },
};
