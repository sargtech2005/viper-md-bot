/**
 * Category menu builder — VIPER BOT MD
 */
const config = require('../config');
const { loadCommands } = require('./commandLoader');
const fs   = require('fs');
const path = require('path');

const sc = s => {
  const m = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',
             k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',
             u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
  return s.toLowerCase().split('').map(c=>m[c]||c).join('');
};

// ── Resolve bot_image.jpg from anywhere in the project ───────────────────────
function getBotImage() {
  // Walk up from utils/ to project root, then into utils/
  const candidates = [
    path.join(__dirname, 'bot_image.jpg'),               // if called from utils/
    path.join(__dirname, '../utils/bot_image.jpg'),       // from commands/category/
    path.join(__dirname, '../../utils/bot_image.jpg'),    // deep nesting
    path.resolve(process.cwd(), 'utils/bot_image.jpg'),   // cwd-relative fallback
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;  // image not found — will fall back to text-only
}

// ── Shared newsletter context ────────────────────────────────────────────────
function newsletterCtx() {
  return {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: config.newsletterJid,
        newsletterName: config.botName,
        serverMessageId: -1,
      },
    },
  };
}

// ── Send a category menu (with bot_image.jpg caption if available) ────────────
async function sendCategoryMenu(sock, msg, extra, category, icon, title) {
  const cmds = loadCommands();
  const list = [];
  cmds.forEach((cmd, name) => {
    if (cmd.name === name && cmd.category === category) list.push(cmd);
  });

  if (!list.length) {
    return extra.reply(`❌ No commands found in *${category}* category yet!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`);
  }

  const sorted = list.sort((a, b) => a.name.localeCompare(b.name));
  let t = `┏❐ 《 *${icon} ${sc(title)} ᴍᴇɴᴜ* 》 ❐\n`;
  sorted.forEach(cmd => { t += `┣◆ ${config.prefix}${cmd.name}\n`; });
  t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

  const imgPath = getBotImage();
  const ctx     = newsletterCtx();

  if (imgPath) {
    await sock.sendMessage(extra.from, {
      image: fs.readFileSync(imgPath),
      caption: t,
      ...ctx,
    }, { quoted: msg });
  } else {
    await sock.sendMessage(extra.from, { text: t }, { quoted: msg });
  }
}

module.exports = { sendCategoryMenu, sc };
