/**
 * Category menu builder — VIPER BOT MD
 * Each category menu now generates a styled SVG image card (like casino game cards)
 * instead of using the plain bot_image.jpg.
 */
const config  = require('../config');
const { loadCommands } = require('./commandLoader');
const sharp   = require('sharp');
const fs      = require('fs');
const path    = require('path');

const sc = s => {
  const m = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',
             k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',
             u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
  return s.toLowerCase().split('').map(c => m[c] || c).join('');
};

function x(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Category visual themes
const THEMES = {
  general:   { grad1: '#0d1117', grad2: '#1a1f2e', accent: '#00e5ff', icon: '🐍', label: 'VIPER'     },
  admin:     { grad1: '#1a0a0a', grad2: '#2d1515', accent: '#ff4757', icon: '⚔️', label: 'SQUAD'     },
  owner:     { grad1: '#1a1500', grad2: '#2d2500', accent: '#ffd700', icon: '👑', label: 'VENOM'     },
  fun:       { grad1: '#0a1a0a', grad2: '#152d15', accent: '#00ff88', icon: '🎮', label: 'ARCADE'    },
  ai:        { grad1: '#0a0a1a', grad2: '#15152d', accent: '#a855f7', icon: '🤖', label: 'NEXUS'     },
  download:  { grad1: '#001a1a', grad2: '#002d2d', accent: '#06b6d4', icon: '📥', label: 'MEDIA'     },
  utility:   { grad1: '#0a0a0a', grad2: '#1a1a1a', accent: '#f59e0b', icon: '🔐', label: 'VAULT'     },
  search:    { grad1: '#0a001a', grad2: '#15002d', accent: '#8b5cf6', icon: '🔍', label: 'RADAR'     },
  sports:    { grad1: '#001a00', grad2: '#002d00', accent: '#22c55e', icon: '⚽', label: 'ARENA'     },
  textmaker: { grad1: '#1a000a', grad2: '#2d0015', accent: '#ec4899', icon: '🖋️', label: 'STUDIO'   },
  developer: { grad1: '#001510', grad2: '#002d20', accent: '#10b981', icon: '💻', label: 'LAB'       },
  default:   { grad1: '#0d1117', grad2: '#161b22', accent: '#00e5ff', icon: '📋', label: 'MENU'      },
};

const MIN_BYTES = 5000;

async function makeCategoryCard(opts) {
  const { category, icon, title, cmdList, botName } = opts;
  const theme = THEMES[category] || THEMES.default;
  const W = 820, H = 280;
  const accent = theme.accent;

  // Determine number of columns based on cmd count
  const cmds = cmdList.slice(0, 24); // max 24 in card
  const col1 = cmds.slice(0, Math.ceil(cmds.length / 2));
  const col2 = cmds.slice(Math.ceil(cmds.length / 2));

  const renderCol = (list, baseX, baseY) =>
    list.map((cmd, i) =>
      `<text x="${baseX}" y="${baseY + i * 22}" font-family="monospace" font-size="13" fill="#c9d1d9">
         <tspan fill="${accent}">›</tspan> ${x(cmd)}
       </text>`
    ).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.grad1}"/>
      <stop offset="100%" stop-color="${theme.grad2}"/>
    </linearGradient>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.05"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Card background -->
  <rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="16" fill="none" stroke="${accent}" stroke-width="2" opacity="0.5"/>

  <!-- Header bar -->
  <rect width="${W}" height="68" rx="16" fill="url(#header)"/>
  <rect x="0" y="52" width="${W}" height="16" fill="${theme.grad1}"/>

  <!-- Left accent stripe -->
  <rect x="0" y="16" width="5" height="${H - 32}" rx="2" fill="${accent}" filter="url(#glow)"/>

  <!-- Icon circle -->
  <circle cx="46" cy="34" r="22" fill="${accent}" opacity="0.15" filter="url(#glow)"/>
  <circle cx="46" cy="34" r="20" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6"/>
  <text x="46" y="43" text-anchor="middle" font-size="22" font-family="sans-serif">${x(icon)}</text>

  <!-- Title -->
  <text x="78" y="28" font-family="sans-serif" font-size="22" font-weight="900" fill="#ffffff" filter="url(#glow)">${x(title.toUpperCase())}</text>
  <text x="78" y="48" font-family="sans-serif" font-size="13" fill="${accent}">${x(sc(category))} ᴄᴀᴛᴇɢᴏʀʏ  ·  ${cmds.length} ᴄᴏᴍᴍᴀɴᴅꜱ</text>

  <!-- Divider -->
  <line x1="18" y1="72" x2="${W - 18}" y2="72" stroke="${accent}" stroke-width="1" opacity="0.3"/>

  <!-- Command columns -->
  <g>${renderCol(col1.map(c => c.name), 28, 96)}</g>
  <g>${renderCol(col2.map(c => c.name), 420, 96)}</g>

  <!-- Corner badge -->
  <rect x="${W - 110}" y="12" width="98" height="26" rx="13" fill="${accent}" opacity="0.15" stroke="${accent}" stroke-width="1" opacity="0.4"/>
  <text x="${W - 61}" y="30" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${accent}">${x(theme.label)}</text>

  <!-- Footer -->
  <text x="${W - 16}" y="${H - 10}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#30363d">POWERED BY ${x(botName.toUpperCase())}</text>
</svg>`;

  const buf = await sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
  if (buf.length < MIN_BYTES) throw new Error('Category card render too small');
  return buf;
}

// ── Shared newsletter context ─────────────────────────────────────────────────
function newsletterCtx() {
  try {
    const database = require('../database');
    const jid  = database.getSetting('newsletterJid', config.newsletterJid);
    const name = database.getSetting('botName',        config.botName);
    return {
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid:    jid,
          newsletterName:   name,
          serverMessageId: -1,
        },
      },
    };
  } catch (_) { return {}; }
}

// ── Send a category menu with a generated image card ─────────────────────────
async function sendCategoryMenu(sock, msg, extra, category, icon, title) {
  const cmds = loadCommands();
  const list = [];
  cmds.forEach((cmd, name) => {
    if (cmd.name === name && cmd.category === category && !cmd.isNavShortcut) list.push(cmd);
  });

  if (!list.length) {
    return extra.reply(`❌ No commands found in *${category}* category yet!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`);
  }

  const sorted = list.sort((a, b) => a.name.localeCompare(b.name));

  let t = `┏❐ 《 *${icon} ${sc(title)} ᴍᴇɴᴜ* 》 ❐\n`;
  sorted.forEach(cmd => { t += `┣◆ ${config.prefix}${cmd.name}\n`; });
  t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

  const botName = config.botName || 'VIPER MD';

  // Always attach newsletter context (groups included now)
  const ctx = newsletterCtx();

  // Generate the category card
  try {
    const cardBuf = await makeCategoryCard({ category, icon, title, cmdList: sorted, botName });
    await sock.sendMessage(extra.from, {
      image:   cardBuf,
      caption: t,
      mimetype: 'image/png',
      ...ctx,
    }, { quoted: msg });
  } catch (cardErr) {
    console.error('[CategoryMenu] Card generation failed, using bot_image fallback:', cardErr.message);
    // Fallback: bot_image.jpg
    const candidates = [
      path.join(__dirname, 'bot_image.jpg'),
      path.join(__dirname, '../utils/bot_image.jpg'),
      path.resolve(process.cwd(), 'utils/bot_image.jpg'),
    ];
    const imgPath = candidates.find(p => fs.existsSync(p)) || null;

    if (imgPath) {
      try {
        await sock.sendMessage(extra.from, {
          image:   fs.readFileSync(imgPath),
          caption: t,
          ...ctx,
        }, { quoted: msg });
      } catch (_) {
        await sock.sendMessage(extra.from, { text: t, ...ctx }, { quoted: msg });
      }
    } else {
      await sock.sendMessage(extra.from, { text: t, ...ctx }, { quoted: msg });
    }
  }
}

module.exports = { sendCategoryMenu, sc };
