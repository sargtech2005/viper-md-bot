/**
 * imageCard.js — Generate rank card & casino result images using Sharp + SVG
 *
 * Sharp is already installed (vips-dev is in the Dockerfile).
 * We render SVG → PNG buffer. No canvas, no puppeteer, no new packages.
 *
 * Font note: Alpine Linux (our Docker base) ships NO fonts by default.
 * The Dockerfile installs ttf-freefont + font-noto to fix this.
 * Font-family in SVGs must use generic fallbacks that map to those packages:
 *   sans-serif  → FreeSans / Noto Sans
 *   monospace   → FreeMono
 *   serif       → FreeSerif
 * Do NOT use Arial, Courier New, etc. — they are unavailable on Alpine.
 *
 * Functions:
 *   makeRankCard(opts)  → Buffer (PNG)
 *   makeHeistCard(opts) → Buffer (PNG)
 *   makeLevelUpCard(opts)→ Buffer (PNG)
 */

const sharp = require('sharp');
const axios = require('axios');

// ── Fetch profile picture as base64 (for embedding in SVG) ──────────────────
async function fetchPpBase64(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    if (!url) return null;
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    const b64 = Buffer.from(r.data).toString('base64');
    const mime = r.headers['content-type'] || 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch { return null; }
}

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg:        '#0d1117',
  bgCard:    '#161b22',
  accent:    '#00e5ff',
  accentDim: '#005f6b',
  green:     '#00ff88',
  red:       '#ff4757',
  gold:      '#ffd700',
  white:     '#ffffff',
  grey:      '#8b949e',
  border:    '#30363d',
  xpFill:    '#00e5ff',
  xpTrack:   '#21262d',
};

// ── escapeXml helper ─────────────────────────────────────────────────────────
function x(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── SVG → PNG buffer ─────────────────────────────────────────────────────────
// MIN_BYTES guard: a legitimate card should be well over 5 KB.
// If Sharp returns a tiny buffer it means the SVG failed to render content
// (usually a font or librsvg issue). Throwing here triggers the text fallback.
const MIN_BYTES = 5000;

async function svgToPng(svg, width, height) {
  const buf = await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toBuffer();

  if (buf.length < MIN_BYTES) {
    throw new Error(`SVG render produced a suspiciously small image (${buf.length} bytes). ` +
      'Fonts may not be installed — check Dockerfile for ttf-freefont / font-noto.');
  }
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RANK CARD
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.username      — e.g. "2348083086811"
 * @param {number}  opts.level         — integer
 * @param {string}  opts.levelName     — e.g. "Knight"
 * @param {string}  opts.levelEmoji    — e.g. "🏇"
 * @param {number}  opts.exp           — current EXP
 * @param {number|null} opts.nextExp   — EXP for next level (null = max)
 * @param {number}  opts.progress      — 0-100
 * @param {string}  opts.botName       — e.g. "VIPER MD"
 * @param {string|null} opts.ppBase64  — data URI or null
 */
async function makeRankCard(opts) {
  const W = 860, H = 200;
  const {
    username, level, levelName, levelEmoji,
    exp, nextExp, progress, botName, ppBase64
  } = opts;

  const barW    = 480;
  const barX    = 280;
  const barY    = 138;
  const barH    = 22;
  const fillW   = Math.round((Math.min(progress, 100) / 100) * barW);
  const expText = nextExp ? `${exp.toLocaleString()} / ${nextExp.toLocaleString()} XP` : `${exp.toLocaleString()} XP (MAX)`;

  // Avatar — circle clip using clipPath
  const avatarImg = ppBase64
    ? `<image href="${ppBase64}" x="24" y="24" width="152" height="152" clip-path="url(#avatarClip)"/>`
    : `<circle cx="100" cy="100" r="76" fill="${C.bgCard}" stroke="${C.border}" stroke-width="2"/>
       <text x="100" y="116" text-anchor="middle" font-size="48" font-family="sans-serif" fill="${C.grey}">?</text>`;

  // NOTE: font-family uses generic CSS families (sans-serif, monospace) which
  // map to FreeSans/Noto on Alpine. Do NOT use Arial, Courier New, etc.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="100%" stop-color="#00ff88"/>
    </linearGradient>
    <clipPath id="avatarClip">
      <circle cx="100" cy="100" r="76"/>
    </clipPath>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" rx="16" fill="url(#bgGrad)"/>
  <!-- Border glow -->
  <rect width="${W}" height="${H}" rx="16" fill="none" stroke="${C.accent}" stroke-width="2" opacity="0.5"/>
  <!-- Left accent bar -->
  <rect x="0" y="20" width="4" height="${H - 40}" rx="2" fill="${C.accent}"/>

  <!-- Avatar border ring -->
  <circle cx="100" cy="100" r="80" fill="none" stroke="${C.accent}" stroke-width="3" filter="url(#glow)"/>
  ${avatarImg}

  <!-- Level badge -->
  <rect x="64" y="156" width="72" height="26" rx="13" fill="${C.accent}"/>
  <text x="100" y="174" text-anchor="middle" font-family="sans-serif" font-size="13"
        font-weight="bold" fill="${C.bg}">LEVEL ${x(level)}</text>

  <!-- Username -->
  <text x="${barX}" y="44" font-family="sans-serif" font-size="22" font-weight="bold"
        fill="${C.white}" filter="url(#glow)">${x(username)}</text>

  <!-- Level name -->
  <text x="${barX}" y="76" font-family="sans-serif" font-size="16" fill="${C.accent}">
    ${x(levelName.toUpperCase())}
  </text>

  <!-- EXP label -->
  <text x="${barX + barW}" y="130" text-anchor="end" font-family="sans-serif"
        font-size="14" fill="${C.grey}">${x(expText)}</text>

  <!-- XP bar track -->
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="${C.xpTrack}"/>
  <!-- XP bar fill -->
  <rect x="${barX}" y="${barY}" width="${fillW}" height="${barH}" rx="${barH / 2}" fill="url(#barGrad)" filter="url(#glow)"/>

  <!-- Bot name footer -->
  <text x="${W - 20}" y="${H - 16}" text-anchor="end" font-family="sans-serif"
        font-size="11" fill="${C.grey}">POWERED BY ${x(botName.toUpperCase())}</text>
</svg>`;

  return svgToPng(svg, W, H);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEIST REPORT CARD
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {boolean} opts.success
 * @param {string}  opts.userId
 * @param {string}  opts.date        — e.g. "4/25/2026"
 * @param {number}  opts.amount      — coins won or lost
 * @param {number}  opts.crewSize
 * @param {string}  opts.botName
 * @param {string|null} opts.ppBase64
 */
async function makeHeistCard(opts) {
  const W = 800, H = 400;
  const { success, userId, date, amount, crewSize, botName, ppBase64 } = opts;

  const headerBg   = success ? '#00c853' : '#d32f2f';
  const headerText = success ? 'HEIST REPORT: SUCCESS' : 'HEIST REPORT: CAUGHT';
  const outcomeText = success ? 'MISSION ACCOMPLISHED' : 'BUSTED BY ANTI-CORRUPT';
  const amountText  = success ? `+$${Math.abs(amount).toLocaleString()}` : `-$${Math.abs(amount).toLocaleString()}`;
  const amountColor = success ? '#00ff88' : '#ff4757';

  const avatarImg = ppBase64
    ? `<image href="${ppBase64}" x="60" y="130" width="120" height="120" clip-path="url(#hClip)"/>`
    : `<circle cx="120" cy="190" r="60" fill="#21262d" stroke="#30363d" stroke-width="2"/>
       <text x="120" y="198" text-anchor="middle" font-size="36" font-family="sans-serif" fill="${C.grey}">?</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="hClip"><circle cx="120" cy="190" r="60"/></clipPath>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#0d1117"/>

  <!-- Header banner -->
  <rect width="${W}" height="90" fill="${headerBg}"/>
  <text x="${W / 2}" y="58" text-anchor="middle" font-family="sans-serif"
        font-size="32" font-weight="900" fill="#ffffff">${x(headerText)}</text>

  <!-- Card body -->
  <rect x="40" y="110" width="${W - 80}" height="${H - 150}" rx="12" fill="#161b22" stroke="#30363d" stroke-width="1"/>

  <!-- Avatar -->
  <circle cx="120" cy="190" r="64" fill="none" stroke="${success ? '#00ff88' : '#ff4757'}" stroke-width="3"/>
  ${avatarImg}

  <!-- Info lines -->
  <text x="240" y="158" font-family="monospace" font-size="16" fill="#8b949e">ID</text>
  <text x="310" y="158" font-family="monospace" font-size="16" fill="#ffffff">:  ${x(userId)}</text>

  <text x="240" y="190" font-family="monospace" font-size="16" fill="#8b949e">DATE</text>
  <text x="310" y="190" font-family="monospace" font-size="16" fill="#ffffff">:  ${x(date)}</text>

  <text x="240" y="222" font-family="monospace" font-size="16" fill="#8b949e">CREW</text>
  <text x="310" y="222" font-family="monospace" font-size="16" fill="#ffffff">:  ${x(crewSize)} members</text>

  <text x="240" y="254" font-family="monospace" font-size="16" fill="#8b949e">OUTCOME</text>
  <text x="340" y="254" font-family="monospace" font-size="16" font-weight="bold"
        fill="${success ? '#00ff88' : '#ff4757'}">:  ${x(outcomeText)}</text>

  <!-- Amount -->
  <text x="240" y="300" font-family="sans-serif" font-size="28"
        font-weight="900" fill="${amountColor}">${success ? 'EARNED: ' : 'FINE: '} ${x(amountText)}</text>

  <!-- Footer -->
  <text x="${W / 2}" y="${H - 18}" text-anchor="middle" font-family="sans-serif"
        font-size="11" fill="#30363d">${x(botName.toUpperCase())} CASINO ENGINE</text>
</svg>`;

  return svgToPng(svg, W, H);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL-UP ANNOUNCEMENT CARD
// ═══════════════════════════════════════════════════════════════════════════════
async function makeLevelUpCard(opts) {
  const W = 700, H = 200;
  const { username, level, levelName, exp, botName, ppBase64 } = opts;

  const avatarImg = ppBase64
    ? `<image href="${ppBase64}" x="24" y="24" width="152" height="152" clip-path="url(#luClip)"/>`
    : `<circle cx="100" cy="100" r="76" fill="#21262d"/>
       <text x="100" y="116" text-anchor="middle" font-size="48" font-family="sans-serif" fill="${C.grey}">?</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="luBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#0d2b1a"/>
    </linearGradient>
    <clipPath id="luClip"><circle cx="100" cy="100" r="76"/></clipPath>
    <filter id="glow2">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#luBg)"/>
  <rect width="${W}" height="${H}" rx="16" fill="none" stroke="${C.green}" stroke-width="2" opacity="0.7"/>
  <rect x="0" y="20" width="4" height="${H - 40}" rx="2" fill="${C.green}"/>

  <!-- Starburst glow behind avatar -->
  <circle cx="100" cy="100" r="84" fill="${C.green}" opacity="0.08" filter="url(#glow2)"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="${C.green}" stroke-width="3" filter="url(#glow2)"/>
  ${avatarImg}

  <!-- Level badge -->
  <rect x="60" y="158" width="80" height="26" rx="13" fill="${C.green}"/>
  <text x="100" y="176" text-anchor="middle" font-family="sans-serif" font-size="13"
        font-weight="bold" fill="#0d1117">LEVEL ${x(level)}</text>

  <!-- LEVEL UP banner -->
  <text x="220" y="52" font-family="sans-serif" font-size="30"
        font-weight="900" fill="${C.green}" filter="url(#glow2)">** LEVEL UP! **</text>

  <text x="220" y="88" font-family="sans-serif" font-size="18" fill="${C.white}">
    ${x(username)}
  </text>

  <text x="220" y="118" font-family="sans-serif" font-size="15" fill="${C.accent}">
    Reached ${x(levelName.toUpperCase())}
  </text>

  <text x="220" y="148" font-family="sans-serif" font-size="14" fill="${C.grey}">
    Total EXP: ${x(exp.toLocaleString())}
  </text>

  <text x="${W - 20}" y="${H - 16}" text-anchor="end" font-family="sans-serif"
        font-size="11" fill="${C.grey}">POWERED BY ${x(botName.toUpperCase())}</text>
</svg>`;

  return svgToPng(svg, W, H);
}

module.exports = { makeRankCard, makeHeistCard, makeLevelUpCard, fetchPpBase64 };
