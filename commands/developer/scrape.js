/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  .scrape <url>  — Frontend Source Code Scraper  (VIPER BOT MD)  ║
 * ║                                                                  ║
 * ║  Crawls ALL pages of a website and downloads frontend files:     ║
 * ║   • HTML pages (all crawled pages)                               ║
 * ║   • CSS stylesheets                                              ║
 * ║   • JavaScript files                                             ║
 * ║   • Images (png/jpg/gif/svg/webp/ico)                            ║
 * ║   • Fonts (woff/woff2/ttf)                                       ║
 * ║                                                                  ║
 * ║  Uses rotating proxy via ScraperAPI (SCRAPERAPI_KEY in .env)     ║
 * ║  Falls back to direct fetch if no proxy key is set.              ║
 * ║                                                                  ║
 * ║  Output: sends a .zip document with full folder structure        ║
 * ║                                                                  ║
 * ║  Usage:                                                          ║
 * ║    .scrape https://example.com                                   ║
 * ║    .scrape google.com                                            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios  = require('axios');
const zlib   = require('zlib');
const path   = require('path');
const config = require('../../config');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const MAX_PAGES       = 40;
const MAX_ASSETS      = 120;
const MAX_ZIP_MB      = 18;
const FETCH_TIMEOUT   = 18000;
const CRAWL_DELAY_MS  = 400;
const USER_AGENT      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ─── PROXY FETCH — ScraperAPI (JS rendering capable) ─────────────────────────
async function proxyFetch(url, { binary = false } = {}) {
  const key = process.env.SCRAPERAPI_KEY;

  let fetchUrl = url;
  let params   = {};

  if (key) {
    fetchUrl = 'https://api.scraperapi.com/';
    params   = { api_key: key, url, render: 'true', keep_headers: 'false' };
  }

  const res = await axios.get(fetchUrl, {
    params,
    timeout: FETCH_TIMEOUT,
    responseType: binary ? 'arraybuffer' : 'text',
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    maxRedirects: 8,
    validateStatus: s => s < 400,
  });

  return { data: res.data, contentType: res.headers['content-type'] || '' };
}

// ─── URL HELPERS ──────────────────────────────────────────────────────────────
function normaliseUrl(raw) {
  raw = raw.trim();
  if (!raw.startsWith('http')) raw = 'https://' + raw;
  try { return new URL(raw).href; } catch { return null; }
}

function getOrigin(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

function resolveUrl(base, href) {
  if (!href || href.startsWith('data:') || href.startsWith('javascript:') || href.startsWith('mailto:')) return null;
  try { return new URL(href, base).href; } catch { return null; }
}

function isSameOrigin(origin, url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}

function urlToPath(origin, url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p.endsWith('/') || p === '') p += 'index.html';
    if (!/\.[a-zA-Z0-9]{1,6}$/.test(p)) p += '.html';
    return p.replace(/^\//, '').replace(/\.\./g, '_');
  } catch {
    return 'unknown/' + Date.now();
  }
}

// ─── HTML LINK EXTRACTOR ──────────────────────────────────────────────────────
function* pullMatches(pattern, html, group = 1) {
  let m;
  const re = new RegExp(pattern.source, pattern.flags);
  while ((m = re.exec(html)) !== null) {
    const val = m[group]?.trim();
    if (val) yield val;
  }
}

function extractLinks(html, baseUrl) {
  const links  = { pages: [], css: [], js: [], images: [], fonts: [] };
  const origin = getOrigin(baseUrl);

  const add = (arr, url) => { if (url && !arr.includes(url)) arr.push(url); };

  for (const href of pullMatches(/<a[^>]+href=["']([^"'#?][^"']*?)["']/gi, html)) {
    const abs = resolveUrl(baseUrl, href);
    if (abs && isSameOrigin(origin, abs)) add(links.pages, abs);
  }

  for (const href of pullMatches(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi, html)) {
    add(links.css, resolveUrl(baseUrl, href));
  }
  for (const href of pullMatches(/@import\s+["']([^"']+\.css[^"']*)["']/gi, html)) {
    add(links.css, resolveUrl(baseUrl, href));
  }

  for (const href of pullMatches(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi, html)) {
    add(links.js, resolveUrl(baseUrl, href));
  }

  for (const href of pullMatches(/<img[^>]+src=["']([^"']+)["']/gi, html)) {
    if (/\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(href)) {
      add(links.images, resolveUrl(baseUrl, href));
    }
  }

  const srcsets = html.match(/srcset=["']([^"']+)["']/gi) || [];
  for (const ss of srcsets) {
    ss.split(',').forEach(part => {
      const u = resolveUrl(baseUrl, part.trim().split(/\s+/)[0]);
      if (u) add(links.images, u);
    });
  }

  for (const href of pullMatches(/url\(["']?([^"')]+\.(?:woff2?|ttf|eot|otf)[^"')']*)["']?\)/gi, html)) {
    add(links.fonts, resolveUrl(baseUrl, href));
  }

  return links;
}

// ─── MINI ZIP BUILDER ─────────────────────────────────────────────────────────
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    for (let j = 0; j < 8; j++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1);
    t[i] = v;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
  const entries = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf     = Buffer.from(f.name, 'utf8');
    const raw         = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const compressed  = zlib.deflateRawSync(raw, { level: 6 });
    const crc         = crc32(raw);

    const local = Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]),
      u16(20), u16(0), u16(8),
      u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(raw.length),
      u16(nameBuf.length), u16(0),
      nameBuf, compressed,
    ]);

    entries.push({ nameBuf, crc, compressed, raw, offset, local });
    offset += local.length;
  }

  const centralDirs = entries.map(e => Buffer.concat([
    Buffer.from([0x50,0x4B,0x01,0x02]),
    u16(20), u16(20), u16(0), u16(8),
    u16(0), u16(0),
    u32(e.crc), u32(e.compressed.length), u32(e.raw.length),
    u16(e.nameBuf.length), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(e.offset),
    e.nameBuf,
  ]));

  const centralBuf = Buffer.concat(centralDirs);
  const eocd = Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),
    u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralBuf.length), u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...entries.map(e => e.local), centralBuf, eocd]);
}

// ─── MAIN COMMAND ─────────────────────────────────────────────────────────────
module.exports = {
  name: 'scrape',
  aliases: ['scrapeweb', 'clonesite', 'webscrape', 'dlsite'],
  category: 'developer',
  description: 'Scrape all frontend source files (HTML/CSS/JS/images) from a website and send as ZIP',
  usage: '.scrape <url>',

  async execute(sock, msg, args, extra) {
    let rawUrl = args.join('').trim();
    if (!rawUrl) {
      return extra.reply(
        '🕷️ *Web Frontend Scraper*\n\n' +
        '```\nUsage: .scrape <url>\n\nExamples:\n  .scrape https://google.com\n  .scrape example.com\n```\n\n' +
        '_Crawls all pages and packages HTML, CSS, JS, images & fonts into a ZIP._'
      );
    }

    const startUrl = normaliseUrl(rawUrl);
    if (!startUrl) return extra.reply('❌ Invalid URL.\n```\nTip: Include full URL e.g. https://example.com\n```');

    const origin   = getOrigin(startUrl);
    const hostname = new URL(startUrl).hostname.replace('www.', '');
    const hasProxy = !!process.env.SCRAPERAPI_KEY;

    await extra.reply(
      `🕷️ *Scraping* \`${hostname}\`...\n\n` +
      '```\n' +
      `Proxy   : ${hasProxy ? 'ScraperAPI (JS rendered) ✅' : 'Direct HTTP (no SCRAPERAPI_KEY)'}\n` +
      `Target  : ${startUrl}\n` +
      `Limit   : ${MAX_PAGES} pages · ${MAX_ASSETS} assets max\n` +
      '```\n' +
      '_Please wait, this can take 30–90s..._'
    );

    // ── CRAWL ─────────────────────────────────────────────────────────────────
    const visited   = new Set();
    const queue     = [startUrl];
    const allCss    = new Set();
    const allJs     = new Set();
    const allImages = new Set();
    const allFonts  = new Set();
    const htmlFiles = [];

    while (queue.length > 0 && htmlFiles.length < MAX_PAGES) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        await new Promise(r => setTimeout(r, CRAWL_DELAY_MS));
        const { data: html } = await proxyFetch(url);
        if (typeof html !== 'string' || html.length < 10) continue;

        htmlFiles.push({ url, html });
        const links = extractLinks(html, url);

        for (const p of links.pages) {
          if (!visited.has(p) && !queue.includes(p)) queue.push(p);
        }
        links.css.forEach(u => allCss.add(u));
        links.js.forEach(u => allJs.add(u));
        links.images.forEach(u => allImages.add(u));
        links.fonts.forEach(u => allFonts.add(u));
      } catch (e) {
        console.log(`[Scrape] ${url} — ${e.message}`);
      }
    }

    if (htmlFiles.length === 0) {
      return extra.reply(
        '❌ *Could not fetch any pages.*\n\n' +
        '```\nPossible causes:\n• Site blocks bots\n• Network/timeout error\n• No SCRAPERAPI_KEY set in .env\n```\n\n' +
        '_Add SCRAPERAPI_KEY to your .env for JS-rendered / protected sites._'
      );
    }

    // ── ASSEMBLE ZIP ──────────────────────────────────────────────────────────
    const zipFiles = [];
    let zipBytes   = 0;

    for (const { url, html } of htmlFiles) {
      const buf = Buffer.from(html, 'utf-8');
      zipFiles.push({ name: urlToPath(origin, url), data: buf });
      zipBytes += buf.length;
    }

    const assetGroups = [
      { set: allCss,    binary: false },
      { set: allJs,     binary: false },
      { set: allImages, binary: true  },
      { set: allFonts,  binary: true  },
    ];

    let assetCount = 0;
    for (const { set, binary } of assetGroups) {
      for (const assetUrl of set) {
        if (assetCount >= MAX_ASSETS || zipBytes > MAX_ZIP_MB * 1024 * 1024) break;
        try {
          await new Promise(r => setTimeout(r, 180));
          const { data } = await proxyFetch(assetUrl, { binary });
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, binary ? 'binary' : 'utf-8');
          zipFiles.push({ name: urlToPath(origin, assetUrl), data: buf });
          zipBytes += buf.length;
          assetCount++;
        } catch { /* skip failed assets */ }
      }
    }

    // Deduplicate names
    const seen = new Map();
    const deduped = zipFiles.map(f => {
      if (!seen.has(f.name)) { seen.set(f.name, 0); return f; }
      seen.set(f.name, seen.get(f.name) + 1);
      const ext  = path.extname(f.name);
      const base = f.name.slice(0, -ext.length || undefined);
      return { name: `${base}_${seen.get(f.name)}${ext}`, data: f.data };
    });

    let zipBuf;
    try { zipBuf = buildZip(deduped); }
    catch (e) { return extra.reply(`❌ ZIP build error: \`${e.message}\``); }

    const zipName   = `${hostname.replace(/[^a-z0-9]/gi, '_')}_frontend.zip`;
    const cssCount  = deduped.filter(f => f.name.endsWith('.css')).length;
    const jsCount   = deduped.filter(f => f.name.endsWith('.js')).length;
    const imgCount  = deduped.filter(f => /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(f.name)).length;
    const sizeKB    = (zipBuf.length / 1024).toFixed(1);

    const caption =
      `🕷️ *${hostname} — Frontend Source Files*\n\n` +
      '```\n' +
      `Pages crawled : ${htmlFiles.length}\n` +
      `CSS files     : ${cssCount}\n` +
      `JS files      : ${jsCount}\n` +
      `Images        : ${imgCount}\n` +
      `Total files   : ${deduped.length}\n` +
      `ZIP size      : ${sizeKB} KB\n` +
      `Proxy mode    : ${hasProxy ? 'ScraperAPI (JS rendered)' : 'Direct HTTP'}\n` +
      '```\n' +
      `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

    try {
      await sock.sendMessage(extra.from, {
        document: zipBuf,
        fileName: zipName,
        mimetype: 'application/zip',
        caption,
      }, { quoted: msg });
    } catch (e) {
      await extra.reply(`❌ Could not send ZIP: \`${e.message}\``);
    }
  },
};
