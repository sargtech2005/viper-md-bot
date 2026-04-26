/**
 * Category menu builder — VIPER BOT MD
 *
 * Card design mirrors the casino game-card style from imageCard.js:
 *   * SVG -> PNG via Sharp (same pipeline as makeGameCard / makeHeistCard)
 *   * ZERO emoji in SVG text — Alpine Linux has no colour-emoji font.
 *     Emoji break librsvg rendering and cause bot_image fallbacks.
 *   * Category is shown as a text badge (e.g. "VIPER", "SQUAD")
 *   * Commands are listed in up to 3 monospace columns
 *   * Fallback is plain-text only — never the generic bot_image
 */
const config           = require('../config');
const { loadCommands } = require('./commandLoader');
const sharp            = require('sharp');

// ── Small-caps mapper ─────────────────────────────────────────────────────────
const sc = s => {
  const m = {a:'\u1d00',b:'\u0299',c:'\u1d04',d:'\u1d05',e:'\u1d07',f:'\ua730',g:'\u0262',
             h:'\u029c',i:'\u026a',j:'\u1d0a',k:'\u1d0b',l:'\u029f',m:'\u1d0d',n:'\u0274',
             o:'\u1d0f',p:'\u1d18',q:'\u01eb',r:'\u0280',s:'\ua731',t:'\u1d1b',u:'\u1d1c',
             v:'\u1d20',w:'\u1d21',x:'x',y:'\u028f',z:'\u1d22'};
  return s.toLowerCase().split('').map(c => m[c] || c).join('');
};

// ── XML-escape helper ─────────────────────────────────────────────────────────
const xe = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Per-category visual themes ────────────────────────────────────────────────
// label = short ALL-CAPS badge text  |  sym = plain ASCII accent (NO emoji)
const THEMES = {
  general:   { grad1:'#0d1117', grad2:'#1a1f2e', accent:'#00e5ff', label:'VIPER',  sym:'~>' },
  admin:     { grad1:'#180808', grad2:'#2d1010', accent:'#ff4757', label:'SQUAD',  sym:'##' },
  owner:     { grad1:'#1a1400', grad2:'#2d2200', accent:'#ffd700', label:'VENOM',  sym:'**' },
  fun:       { grad1:'#081808', grad2:'#102d10', accent:'#00ff88', label:'ARCADE', sym:':)' },
  ai:        { grad1:'#08081a', grad2:'#10102d', accent:'#a855f7', label:'NEXUS',  sym:'@@' },
  download:  { grad1:'#001818', grad2:'#002828', accent:'#06b6d4', label:'MEDIA',  sym:'//' },
  utility:   { grad1:'#0a0a0a', grad2:'#1a1a1a', accent:'#f59e0b', label:'VAULT',  sym:'!!' },
  search:    { grad1:'#08001a', grad2:'#10002d', accent:'#8b5cf6', label:'RADAR',  sym:'??' },
  sports:    { grad1:'#001800', grad2:'#002800', accent:'#22c55e', label:'ARENA',  sym:'||' },
  textmaker: { grad1:'#180008', grad2:'#2d0010', accent:'#ec4899', label:'STUDIO', sym:'%%' },
  developer: { grad1:'#001410', grad2:'#002818', accent:'#10b981', label:'LAB',    sym:'<>' },
  default:   { grad1:'#0d1117', grad2:'#161b22', accent:'#00e5ff', label:'MENU',   sym:'::' },
};

// ── SVG -> PNG (same pipeline as imageCard.js) ────────────────────────────────
const MIN_BYTES = 8000;

async function svgToPng(svg, W, H) {
  const buf = await sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
  if (buf.length < MIN_BYTES) {
    throw new Error('SVG render too small (' + buf.length + ' bytes) — font/librsvg issue');
  }
  return buf;
}

// ── Build the casino-style category card ──────────────────────────────────────
async function makeCategoryCard({ category, title, cmdList, botName, prefix }) {
  const theme  = THEMES[category] || THEMES.default;
  const accent = theme.accent;
  const pfx    = prefix || '.';

  // Max 27 commands in 3 columns of 9
  const cmds   = cmdList.slice(0, 27);
  const cols   = cmds.length > 18 ? 3 : cmds.length > 9 ? 2 : 1;
  const perCol = Math.ceil(cmds.length / cols);

  const W     = 820;
  const ROW_H = 26;
  const H     = Math.max(280, 104 + perCol * ROW_H + 52);

  // Build column data
  const colData = [];
  for (let c = 0; c < cols; c++) {
    colData.push(cmds.slice(c * perCol, (c + 1) * perCol));
  }
  const colWidth = Math.floor((W - 56) / cols);
  const colXs    = colData.map(function(_, i) { return 28 + i * colWidth; });

  // Render a command column
  function renderCol(list, baseX, baseY) {
    return list.map(function(cmd, i) {
      var yPos = baseY + i * ROW_H;
      return '<text x="' + baseX + '" y="' + yPos + '" font-family="monospace" font-size="13" fill="#555e6a">' + xe(pfx) + '</text>' +
             '<text x="' + (baseX + 13) + '" y="' + yPos + '" font-family="monospace" font-size="13" font-weight="bold" fill="#c9d1d9">' + xe(cmd.name) + '</text>';
    }).join('\n  ');
  }

  var allCols = colData.map(function(list, i) { return renderCol(list, colXs[i], 128); }).join('\n  ');

  // Column sub-headers
  var colHeaders = colData.map(function(_, i) {
    return '<text x="' + colXs[i] + '" y="112" font-family="monospace" font-size="10" fill="' + accent + '" opacity="0.6">COMMAND</text>' +
           '<rect x="' + (colXs[i] - 4) + '" y="100" width="3" height="10" rx="1" fill="' + accent + '" opacity="0.5"/>';
  }).join('\n  ');

  // Badge width scales with label length
  var badgeW = Math.max(72, theme.label.length * 12 + 20);

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">\n' +
  '  <defs>\n' +
  '    <linearGradient id="cb" x1="0" y1="0" x2="1" y2="1">\n' +
  '      <stop offset="0%"   stop-color="' + theme.grad1 + '"/>\n' +
  '      <stop offset="100%" stop-color="' + theme.grad2 + '"/>\n' +
  '    </linearGradient>\n' +
  '    <linearGradient id="ch" x1="0" y1="0" x2="1" y2="0">\n' +
  '      <stop offset="0%"   stop-color="' + accent + '" stop-opacity="0.20"/>\n' +
  '      <stop offset="100%" stop-color="' + accent + '" stop-opacity="0.02"/>\n' +
  '    </linearGradient>\n' +
  '    <filter id="cg">\n' +
  '      <feGaussianBlur stdDeviation="3" result="b"/>\n' +
  '      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>\n' +
  '    </filter>\n' +
  '  </defs>\n' +

  '  <!-- Background -->\n' +
  '  <rect width="' + W + '" height="' + H + '" rx="14" fill="url(#cb)"/>\n' +
  '  <rect width="' + W + '" height="' + H + '" rx="14" fill="none" stroke="' + accent + '" stroke-width="2" opacity="0.5"/>\n' +

  '  <!-- Header band -->\n' +
  '  <rect width="' + W + '" height="84" rx="14" fill="url(#ch)"/>\n' +
  '  <rect y="70" width="' + W + '" height="14" fill="' + theme.grad1 + '"/>\n' +

  '  <!-- Left accent stripe -->\n' +
  '  <rect x="0" y="16" width="4" height="' + (H - 32) + '" rx="2" fill="' + accent + '" filter="url(#cg)"/>\n' +

  '  <!-- Category badge (like WIN/LOSS badge in casino cards) -->\n' +
  '  <rect x="18" y="17" width="' + badgeW + '" height="34" rx="17" fill="' + accent + '"/>\n' +
  '  <text x="' + (18 + badgeW / 2) + '" y="39" text-anchor="middle"\n' +
  '        font-family="sans-serif" font-size="14" font-weight="900" fill="#0d1117">' + xe(theme.label) + '</text>\n' +

  '  <!-- Decorative sym (top-right, replaces emoji) -->\n' +
  '  <rect x="' + (W - 58) + '" y="17" width="44" height="34" rx="17"\n' +
  '        fill="' + accent + '" fill-opacity="0.10"\n' +
  '        stroke="' + accent + '" stroke-width="1.5" stroke-opacity="0.45"/>\n' +
  '  <text x="' + (W - 36) + '" y="38" text-anchor="middle"\n' +
  '        font-family="monospace" font-size="14" font-weight="bold"\n' +
  '        fill="' + accent + '" filter="url(#cg)">' + xe(theme.sym) + '</text>\n' +

  '  <!-- Title -->\n' +
  '  <text x="' + (badgeW + 32) + '" y="35" font-family="sans-serif" font-size="24" font-weight="900"\n' +
  '        fill="#ffffff" filter="url(#cg)">' + xe(title.toUpperCase()) + ' COMMANDS</text>\n' +
  '  <text x="' + (badgeW + 32) + '" y="57" font-family="sans-serif" font-size="12" fill="' + accent + '">' +
        xe(sc(category)) + ' category  -  ' + cmds.length + ' commands' +
        (cmdList.length > 27 ? '  (first 27 shown)' : '') + '</text>\n' +

  '  <!-- Divider -->\n' +
  '  <line x1="18" y1="90" x2="' + (W - 18) + '" y2="90" stroke="' + accent + '" stroke-width="1" opacity="0.22"/>\n' +

  '  <!-- Column sub-headers -->\n' +
  '  ' + colHeaders + '\n' +

  '  <!-- Commands -->\n' +
  '  ' + allCols + '\n' +

  '  <!-- Footer -->\n' +
  '  <text x="' + (W - 16) + '" y="' + (H - 10) + '" text-anchor="end"\n' +
  '        font-family="sans-serif" font-size="10" fill="#30363d">POWERED BY ' + xe(botName.toUpperCase()) + '</text>\n' +
  '</svg>';

  return svgToPng(svg, W, H);
}

// ── Shared newsletter context ─────────────────────────────────────────────────
function newsletterCtx() {
  try {
    const database = require('../database');
    return {
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid:    database.getSetting('newsletterJid', config.newsletterJid),
          newsletterName:   database.getSetting('botName',        config.botName),
          serverMessageId: -1,
        },
      },
    };
  } catch (_) { return {}; }
}

// ── Style-3 list-message category popup ──────────────────────────────────────
async function sendCategoryMenuStyle3(sock, msg, extra, category, icon, title, sorted, prefix, botName) {
  const CHUNK = 10;
  const sections = [];
  for (var i = 0; i < sorted.length; i += CHUNK) {
    var chunk = sorted.slice(i, i + CHUNK);
    sections.push({
      title: i === 0 ? title.toUpperCase() + ' COMMANDS' : title.toUpperCase() + ' (cont.)',
      rows: chunk.map(function(cmd) {
        return {
          title:       prefix + cmd.name,
          description: (cmd.description || '').slice(0, 72),
          rowId:       prefix + cmd.name,
        };
      }),
    });
  }

  try {
    await sock.sendMessage(extra.from, {
      listMessage: {
        title:       title.toUpperCase() + ' COMMANDS',
        description: sorted.length + ' commands  -  tap any to run it',
        buttonText:  'View Commands',
        footerText:  'Powered by ' + botName,
        listType:    1,
        sections:    sections,
      },
    }, { quoted: msg });
  } catch (_) {
    var t = '\u250f\u2590 \u300a *' + icon + ' ' + sc(title) + ' \u1d0d\u1d07\u0274\u1d1c* \u300b \u2590\n';
    sorted.forEach(function(cmd) { t += '\u2523\u25c6 ' + prefix + cmd.name + '\n'; });
    t += '\u2517\u2590\n\n> *\u1d18\u1d0f\u1d21\u1d07\u0280\u1d07\u1d05 \u0299\u028f ' + botName + '* \uD83D\uDC0D';
    await sock.sendMessage(extra.from, { text: t }, { quoted: msg });
  }
}

// ── Main category menu sender ─────────────────────────────────────────────────
async function sendCategoryMenu(sock, msg, extra, category, icon, title) {
  // Always read live prefix & botName from DB
  var prefix  = config.prefix;
  var botName = config.botName;
  try {
    var database = require('../database');
    prefix  = database.getSetting('prefix',  config.prefix);
    botName = database.getSetting('botName', config.botName);
  } catch (_) {}

  var cmdsMap = loadCommands();
  var list = [];
  cmdsMap.forEach(function(cmd, name) {
    if (cmd.name === name && cmd.category === category && !cmd.isNavShortcut) list.push(cmd);
  });

  if (!list.length) {
    return extra.reply('\u274c No commands found in *' + category + '* category yet!\n\n> *\u1d18\u1d0f\u1d21\u1d07\u0280\u1d07\u1d05 \u0299\u028f ' + botName + '* \uD83D\uDC0D');
  }

  var sorted = list.sort(function(a, b) { return a.name.localeCompare(b.name); });

  // ── Style 3: interactive WhatsApp list popup ──────────────────────────────
  try {
    var db = require('../database');
    if (db.getSetting('menuStyle', 1) === 3) {
      return sendCategoryMenuStyle3(sock, msg, extra, category, icon, title, sorted, prefix, botName);
    }
  } catch (_) {}

  // ── Styles 1 & 2: generated image card + text caption ────────────────────
  var t = '\u250f\u2590 \u300a *' + icon + ' ' + sc(title) + ' \u1d0d\u1d07\u0274\u1d1c* \u300b \u2590\n';
  sorted.forEach(function(cmd) { t += '\u2523\u25c6 ' + prefix + cmd.name + '\n'; });
  t += '\u2517\u2590\n\n> *\u1d18\u1d0f\u1d21\u1d07\u0280\u1d07\u1d05 \u0299\u028f ' + botName + '* \uD83D\uDC0D';

  var ctx = newsletterCtx();

  // Generate casino-style card — fallback to text-only (NEVER bot_image)
  try {
    var cardBuf = await makeCategoryCard({ category: category, title: title, cmdList: sorted, botName: botName, prefix: prefix });
    await sock.sendMessage(extra.from, {
      image:    cardBuf,
      caption:  t,
      mimetype: 'image/png',
    }, { quoted: msg });
  } catch (cardErr) {
    console.error('[CategoryMenu] Card generation failed:', cardErr.message);
    // Text-only fallback — no generic bot_image
    await sock.sendMessage(extra.from, { text: t, ...ctx }, { quoted: msg });
  }
}

module.exports = { sendCategoryMenu, sc };
