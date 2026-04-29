/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  VIPER BOT MD — Website Scraper Suite  (Structure-Preserving Edition)       ║
 * ║                                                                              ║
 * ║  ZIP mirrors the EXACT hosting structure of the website:                    ║
 * ║   /about/team  →  about/team/index.html                                     ║
 * ║   /assets/css/style.css  →  assets/css/style.css                           ║
 * ║   All internal links rewritten so site works offline (local server)         ║
 * ║                                                                              ║
 * ║  .scrape   <url>  → Frontend (HTML+CSS+JS+images+fonts) exact structure     ║
 * ║  .scrapefd <url>  → Same as .scrape                                         ║
 * ║  .scrapebd <url>  → Backend probe (APIs, JSON, headers, server info)        ║
 * ║  .scrapedb <url>  → DB/Config probe (.env, sql dumps, phpinfo, .git)        ║
 * ║  .scrapeall <url> → Everything + tech stack report                          ║
 * ║                                                                              ║
 * ║  Free proxy fallback (no API key needed):                                   ║
 * ║    ScraperAPI → allorigins.win → corsproxy.io → thingproxy → Direct        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios  = require('axios');
const zlib   = require('zlib');
const path   = require('path');
const config = require('../../config');

// ─── LIMITS ───────────────────────────────────────────────────────────────────
const MAX_PAGES      = 80;
const MAX_ASSETS     = 300;
const MAX_ZIP_MB     = 28;
const FETCH_TIMEOUT  = 30000;
const CRAWL_DELAY_MS = 300;
const USER_AGENT     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const BACKEND_PROBE_PATHS = [
  '/api','/api/v1','/api/v2','/api/health','/api/status','/api/config',
  '/api/users','/api/products','/api/data','/api/info',
  '/graphql','/graphiql','/swagger','/swagger-ui','/swagger.json',
  '/openapi.json','/api-docs','/api-docs.json',
  '/health','/status','/ping','/version','/server-info','/info','/debug',
  '/.well-known/openid-configuration','/.well-known/security.txt','/security.txt',
];

const DB_PROBE_PATHS = [
  '/.env','/.env.bak','/.env.local','/.env.production','/.env.example',
  '/config.php','/config.js','/config.json','/configuration.php',
  '/settings.php','/settings.json','/wp-config.php','/wp-config.bak',
  '/database.php','/db.php','/db.json','/connection.php',
  '/backup.sql','/dump.sql','/database.sql','/db.sql',
  '/.git/config','/.git/HEAD','/.gitignore','/.htaccess',
  '/phpinfo.php','/info.php','/test.php','/debug.php',
  '/server-status','/server-info',
  '/robots.txt','/sitemap.xml','/sitemap_index.xml',
  '/crossdomain.xml','/clientaccesspolicy.xml',
  '/package.json','/composer.json','/requirements.txt',
  '/web.config','/nginx.conf','/httpd.conf',
];

// ─── FREE PROXY FALLBACK CHAIN ────────────────────────────────────────────────
async function fetchWithFallback(url, { binary = false } = {}) {
  const responseType = binary ? 'arraybuffer' : 'text';
  const hdrs = { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' };

  if (process.env.SCRAPERAPI_KEY) {
    try {
      const r = await axios.get('https://api.scraperapi.com/', {
        params: { api_key: process.env.SCRAPERAPI_KEY, url, render: 'true' },
        timeout: FETCH_TIMEOUT, responseType, headers: hdrs, maxRedirects: 8,
        validateStatus: s => s < 400,
      });
      return { data: r.data, ct: r.headers['content-type']||'', proxy: 'ScraperAPI', resHeaders: r.headers };
    } catch (_) {}
  }

  try {
    const r = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
      timeout: FETCH_TIMEOUT, responseType, headers: hdrs, maxRedirects: 8, validateStatus: s => s < 500,
    });
    if (r.data && (typeof r.data === 'string' ? r.data.length > 20 : r.data.byteLength > 20))
      return { data: r.data, ct: r.headers['content-type']||'', proxy: 'allorigins.win', resHeaders: r.headers };
  } catch (_) {}

  try {
    const r = await axios.get(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
      timeout: FETCH_TIMEOUT, responseType, headers: hdrs, maxRedirects: 8, validateStatus: s => s < 500,
    });
    if (r.data && (typeof r.data === 'string' ? r.data.length > 20 : r.data.byteLength > 20))
      return { data: r.data, ct: r.headers['content-type']||'', proxy: 'corsproxy.io', resHeaders: r.headers };
  } catch (_) {}

  try {
    const r = await axios.get(`https://thingproxy.freeboard.io/fetch/${url}`, {
      timeout: FETCH_TIMEOUT, responseType, headers: hdrs, maxRedirects: 8, validateStatus: s => s < 500,
    });
    if (r.data && (typeof r.data === 'string' ? r.data.length > 20 : r.data.byteLength > 20))
      return { data: r.data, ct: r.headers['content-type']||'', proxy: 'thingproxy', resHeaders: r.headers };
  } catch (_) {}

  const r = await axios.get(url, {
    timeout: FETCH_TIMEOUT, responseType, headers: hdrs, maxRedirects: 8, validateStatus: s => s < 400,
  });
  return { data: r.data, ct: r.headers['content-type']||'', proxy: 'Direct', resHeaders: r.headers };
}

async function probeUrl(targetUrl) {
  try {
    const r = await axios.get(targetUrl, {
      timeout: 12000, headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 5, validateStatus: () => true,
    });
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const ct   = r.headers['content-type'] || '';
    return { url: targetUrl, status: r.status, body: body.slice(0, 8000), headers: r.headers,
      isJson: ct.includes('json') || body.trimStart().startsWith('{') || body.trimStart().startsWith('['),
      isHtml: ct.includes('html'), size: body.length };
  } catch (e) {
    return { url: targetUrl, status: 0, body: '', headers: {}, isJson: false, isHtml: false, size: 0, error: e.message };
  }
}

// ─── URL HELPERS ──────────────────────────────────────────────────────────────
function normaliseUrl(raw) {
  raw = raw.trim();
  if (!raw.startsWith('http')) raw = 'https://' + raw;
  try { return new URL(raw).href; } catch { return null; }
}
function getOrigin(url) { try { return new URL(url).origin; } catch { return ''; } }
function resolveUrl(base, href) {
  if (!href || href.startsWith('data:') || href.startsWith('javascript:') || href.startsWith('mailto:')) return null;
  try { return new URL(href, base).href; } catch { return null; }
}
function isSameOrigin(origin, url) { try { return new URL(url).origin === origin; } catch { return false; } }

/**
 * Convert a URL to a local file path that EXACTLY mirrors the server structure.
 *
 *  https://site.com/               →  index.html
 *  https://site.com/about          →  about/index.html
 *  https://site.com/about/         →  about/index.html
 *  https://site.com/about.html     →  about.html
 *  https://site.com/blog/post-1    →  blog/post-1/index.html
 *  https://site.com/assets/app.js  →  assets/app.js
 *  https://site.com/img/logo.png   →  img/logo.png
 */
function urlToFilePath(url) {
  try {
    const u = new URL(url);
    let p = u.pathname;

    // Root URL
    if (p === '' || p === '/') return 'index.html';

    // Strip leading slash
    p = p.replace(/^\//, '');

    // Sanitise path traversal
    p = p.replace(/\.\./g, '__');

    // Trailing slash = directory index
    if (p.endsWith('/')) return p + 'index.html';

    // Has a recognised file extension → keep exact path
    if (/\.[a-zA-Z0-9]{1,8}$/.test(p)) return p;

    // No extension = clean URL / server route → save as folder/index.html
    // This mirrors how web servers serve directory routes
    return p + '/index.html';
  } catch {
    return '_unknown/' + Math.random().toString(36).slice(2) + '.html';
  }
}

/** Depth of a file path — used to compute relative path prefix */
function pathDepth(filePath) {
  return filePath.split('/').length - 1;
}

/** Build a relative prefix like '../../' for going up N levels */
function relativePrefix(depth) {
  if (depth === 0) return './';
  return '../'.repeat(depth);
}

/**
 * Rewrite all internal absolute URLs in HTML/CSS to root-relative paths.
 * This makes the cloned site work with any local web server (Live Server, Python http.server, etc.)
 *
 * Strategy:
 *   https://example.com/about  →  /about/index.html
 *   https://example.com/assets/style.css  →  /assets/style.css
 *   External URLs (other domains, CDNs) are left untouched so they still load.
 */
function rewriteHtmlUrls(html, origin, urlToPathMap) {
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace all origin-absolute URLs in attributes (href, src, action, data-src, srcset, etc.)
  html = html.replace(
    new RegExp(
      `((?:href|src|action|data-src|data-href|srcset|content|data-url)\\s*=\\s*["'])(${escapedOrigin})(/[^"']*?)?(["'])`,
      'gi'
    ),
    (match, attrEq, orig, urlPath, quote) => {
      const absUrl = orig + (urlPath || '');
      // If we downloaded this file, use its exact local path
      if (urlToPathMap && urlToPathMap.has(absUrl)) {
        return `${attrEq}/${urlToPathMap.get(absUrl)}${quote}`;
      }
      // Otherwise make root-relative (remove origin prefix)
      return `${attrEq}${urlPath || '/'}${quote}`;
    }
  );

  // Also handle srcset which has comma-separated entries
  html = html.replace(/srcset=["']([^"']+)["']/gi, (match, srcset) => {
    const rewritten = srcset.replace(
      new RegExp(escapedOrigin + '(/[^\\s,]*)', 'g'),
      (m, p) => p
    );
    return `srcset="${rewritten}"`;
  });

  return html;
}

/**
 * Rewrite absolute URLs in CSS files (url(...) and @import)
 */
function rewriteCssUrls(css, origin) {
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // url('https://site.com/img/logo.png') → url('/img/logo.png')
  css = css.replace(
    new RegExp(`url\\(["']?(${escapedOrigin})(/[^"')]*?)["']?\\)`, 'gi'),
    (match, orig, p) => `url('${p}')`
  );
  // @import 'https://site.com/...' → @import '/...'
  css = css.replace(
    new RegExp(`@import\\s+["'](${escapedOrigin})(/[^"']*)["']`, 'gi'),
    (match, orig, p) => `@import '${p}'`
  );
  return css;
}

// ─── HTML LINK EXTRACTOR ──────────────────────────────────────────────────────
function* pullMatches(pattern, html, group) {
  let m; group = group || 1;
  const re = new RegExp(pattern.source, pattern.flags);
  while ((m = re.exec(html)) !== null) { const v = m[group]?.trim(); if (v) yield v; }
}

function extractLinks(html, baseUrl, origin) {
  const links = { pages: [], css: [], js: [], images: [], fonts: [], other: [] };
  const add = (arr, u) => { if (u && !arr.includes(u)) arr.push(u); };

  // Pages (same-origin <a href>)
  for (const href of pullMatches(/<a[^>]+href=["']([^"'#?][^"']*?)["']/gi, html)) {
    const abs = resolveUrl(baseUrl, href);
    if (abs && isSameOrigin(origin, abs)) add(links.pages, abs.split('?')[0].split('#')[0]);
  }

  // CSS
  for (const href of pullMatches(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi, html))
    add(links.css, resolveUrl(baseUrl, href));
  for (const href of pullMatches(/@import\s+["']([^"']+\.css[^"']*)["']/gi, html))
    add(links.css, resolveUrl(baseUrl, href));

  // JS
  for (const href of pullMatches(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi, html))
    add(links.js, resolveUrl(baseUrl, href));

  // Images
  for (const href of pullMatches(/<img[^>]+src=["']([^"']+)["']/gi, html)) {
    if (/\.(png|jpe?g|gif|svg|webp|ico|avif)(\?|$)/i.test(href))
      add(links.images, resolveUrl(baseUrl, href));
  }
  // srcset
  (html.match(/srcset=["']([^"']+)["']/gi) || []).forEach(ss =>
    ss.split(',').forEach(part => {
      const u = resolveUrl(baseUrl, part.trim().split(/\s+/)[0]);
      if (u && /\.(png|jpe?g|gif|svg|webp|ico|avif)(\?|$)/i.test(u)) add(links.images, u);
    })
  );
  // CSS background images
  for (const href of pullMatches(/url\(["']?([^"')]+\.(png|jpe?g|gif|svg|webp|ico|avif)[^"')']*)["']?\)/gi, html))
    add(links.images, resolveUrl(baseUrl, href));

  // Fonts
  for (const href of pullMatches(/url\(["']?([^"')]+\.(?:woff2?|ttf|eot|otf)[^"')']*)["']?\)/gi, html))
    add(links.fonts, resolveUrl(baseUrl, href));

  // Other linked resources (video, audio, pdf, etc.)
  for (const href of pullMatches(/<(?:source|video|audio|embed|object)[^>]+(?:src|data)=["']([^"']+)["']/gi, html)) {
    const u = resolveUrl(baseUrl, href);
    if (u && isSameOrigin(origin, u)) add(links.other, u);
  }

  return links;
}

function extractInlineCode(html) {
  const scripts = [], styles = []; let m;
  const sr = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
  while ((m = sr.exec(html)) !== null) if (m[1].trim().length > 10) scripts.push(m[1].trim());
  const str = /<style(?:[^>]*)>([\s\S]*?)<\/style>/gi;
  while ((m = str.exec(html)) !== null) if (m[1].trim().length > 5) styles.push(m[1].trim());
  return { scripts, styles };
}

// ─── TECH STACK DETECTOR ──────────────────────────────────────────────────────
function detectTechStack(html, headers, allJs, allCss) {
  const s = { frontend:[], backend:[], cms:[], analytics:[], ui:[], hosting:[], security:[], fonts:[], buildTool:[], database:[], language:[] };
  const h = html.toLowerCase(), hd = JSON.stringify(headers).toLowerCase();
  const js = [...allJs].join(' ').toLowerCase(), css = [...allCss].join(' ').toLowerCase();

  if (h.includes('react')||js.includes('react')) s.frontend.push('React');
  if (h.includes('vue')||js.includes('vue')) s.frontend.push('Vue.js');
  if (h.includes('angular')||js.includes('angular')) s.frontend.push('Angular');
  if (h.includes('svelte')||js.includes('svelte')) s.frontend.push('Svelte');
  if (js.includes('_next')||h.includes('__next')) s.frontend.push('Next.js');
  if (js.includes('nuxt')||h.includes('__nuxt')) s.frontend.push('Nuxt.js');
  if (js.includes('jquery')||h.includes('jquery')) s.frontend.push('jQuery');

  if (css.includes('bootstrap')||h.includes('bootstrap')) s.ui.push('Bootstrap');
  if (h.includes('tailwind')||css.includes('tailwind')) s.ui.push('Tailwind CSS');
  if (h.includes('material')||h.includes('mui')) s.ui.push('Material UI');
  if (h.includes('bulma')) s.ui.push('Bulma');
  if (h.includes('fontawesome')||h.includes('font-awesome')) s.ui.push('Font Awesome');

  if (h.includes('wp-content')||h.includes('wp-includes')) s.cms.push('WordPress');
  if (h.includes('drupal')) s.cms.push('Drupal');
  if (h.includes('cdn.shopify')||h.includes('shopify')) s.cms.push('Shopify');
  if (h.includes('wixsite')) s.cms.push('Wix');
  if (h.includes('squarespace')) s.cms.push('Squarespace');
  if (h.includes('ghost')) s.cms.push('Ghost');

  if (hd.includes('x-powered-by: php')||hd.includes('.php')) s.language.push('PHP');
  if (hd.includes('x-powered-by: express')) s.backend.push('Express.js');
  if (hd.includes('laravel')) s.backend.push('Laravel');
  if (h.includes('csrfmiddlewaretoken')) s.backend.push('Django');
  if (hd.includes('ruby')||hd.includes('rails')) s.backend.push('Ruby on Rails');
  if (hd.includes('asp.net')) s.backend.push('ASP.NET');

  if (hd.includes('nginx')) s.hosting.push('Nginx');
  if (hd.includes('apache')) s.hosting.push('Apache');
  if (hd.includes('cloudflare')) s.hosting.push('Cloudflare');
  if (hd.includes('vercel')) s.hosting.push('Vercel');
  if (hd.includes('netlify')) s.hosting.push('Netlify');
  if (hd.includes('x-amz')||hd.includes('amazonaws')) s.hosting.push('AWS');
  if (hd.includes('fly.io')) s.hosting.push('Fly.io');
  if (hd.includes('render')) s.hosting.push('Render.com');

  if (h.includes('googletagmanager')||h.includes('gtag')) s.analytics.push('Google Analytics');
  if (h.includes('fbevents')) s.analytics.push('Facebook Pixel');
  if (h.includes('hotjar')) s.analytics.push('Hotjar');

  if (hd.includes('content-security-policy')) s.security.push('CSP Header');
  if (hd.includes('strict-transport-security')) s.security.push('HSTS');
  if (h.includes('recaptcha')) s.security.push('reCAPTCHA');

  if (h.includes('fonts.googleapis')) s.fonts.push('Google Fonts');
  if (h.includes('typekit')) s.fonts.push('Adobe Fonts');
  if (h.includes('bunny.net/fonts')) s.fonts.push('Bunny Fonts');

  if (h.includes('__webpack')||js.includes('webpack')) s.buildTool.push('Webpack');
  if (h.includes('/@vite/')||js.includes('vite')) s.buildTool.push('Vite');

  if (h.includes('firebase')||h.includes('firebaseapp')) s.database.push('Firebase');
  if (h.includes('supabase')) s.database.push('Supabase');

  for (const k of Object.keys(s)) s[k] = [...new Set(s[k])];
  return s;
}

function formatTechStack(s) {
  const labels = { frontend:'⚛️ Frontend', ui:'🎨 UI/CSS', backend:'🛠️ Backend', language:'🐘 Language',
    cms:'📝 CMS', database:'🗄️ Database', hosting:'☁️ Hosting', buildTool:'⚙️ Build Tool',
    analytics:'📊 Analytics', fonts:'🔤 Fonts', security:'🔒 Security' };
  return Object.entries(labels)
    .filter(([k]) => s[k]?.length > 0)
    .map(([k, label]) => `${label}: ${s[k].join(', ')}`)
    .join('\n') || '❔ No stack detected';
}

// ─── ZIP BUILDER ──────────────────────────────────────────────────────────────
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n,0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n,0); return b; }
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i=0;i<256;i++){let v=i;for(let j=0;j<8;j++)v=(v&1)?(0xEDB88320^(v>>>1)):(v>>>1);t[i]=v;}
  return t;
})();
function crc32(buf) { let c=0xFFFFFFFF; for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xFF]^(c>>>8); return(c^0xFFFFFFFF)>>>0; }

function buildZip(files) {
  const entries=[]; let offset=0;
  for (const f of files) {
    const nameBuf=Buffer.from(f.name,'utf8');
    const raw=Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data);
    const compressed=zlib.deflateRawSync(raw,{level:6});
    const crc=crc32(raw);
    const local=Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]),u16(20),u16(0),u16(8),u16(0),u16(0),
      u32(crc),u32(compressed.length),u32(raw.length),
      u16(nameBuf.length),u16(0),nameBuf,compressed,
    ]);
    entries.push({nameBuf,crc,compressed,raw,offset,local});
    offset+=local.length;
  }
  const centralDirs=entries.map(e=>Buffer.concat([
    Buffer.from([0x50,0x4B,0x01,0x02]),
    u16(20),u16(20),u16(0),u16(8),u16(0),u16(0),
    u32(e.crc),u32(e.compressed.length),u32(e.raw.length),
    u16(e.nameBuf.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(e.offset),
    e.nameBuf,
  ]));
  const centralBuf=Buffer.concat(centralDirs);
  const eocd=Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),u16(0),u16(0),
    u16(entries.length),u16(entries.length),
    u32(centralBuf.length),u32(offset),u16(0),
  ]);
  return Buffer.concat([...entries.map(e=>e.local),centralBuf,eocd]);
}

function dedupeFiles(files) {
  const seen = new Map();
  return files.map(f => {
    if (!seen.has(f.name)) { seen.set(f.name,0); return f; }
    const n = seen.get(f.name)+1; seen.set(f.name,n);
    const ext=path.extname(f.name), base=f.name.slice(0,-ext.length||undefined);
    return { name:`${base}_${n}${ext}`, data:f.data };
  });
}

// ─── FRONTEND CRAWL ───────────────────────────────────────────────────────────
async function crawlFrontend(startUrl) {
  const origin  = getOrigin(startUrl);
  const visited = new Set();
  const queue   = [startUrl.split('?')[0].split('#')[0]];

  // These maps track: absolute URL → local file path in ZIP
  const urlToPathMap = new Map();   // for URL rewriting
  const htmlPages    = [];          // { url, html, localPath }
  const assets       = [];          // { url, binary, localPath }

  const allCss    = new Set();
  const allJs     = new Set();
  const allImages = new Set();
  const allFonts  = new Set();
  const allOther  = new Set();
  let   usedProxy = 'Direct';

  while (queue.length > 0 && htmlPages.length < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      await new Promise(r => setTimeout(r, CRAWL_DELAY_MS));
      const result = await fetchWithFallback(url);
      usedProxy = result.proxy;
      const html = result.data;
      if (typeof html !== 'string' || html.length < 10) continue;

      const localPath = urlToFilePath(url);
      urlToPathMap.set(url, localPath);
      // Also map URL without trailing slash variants
      try {
        const u = new URL(url);
        if (u.pathname !== '/' && u.pathname.endsWith('/'))
          urlToPathMap.set(origin + u.pathname.slice(0,-1), localPath);
        else
          urlToPathMap.set(origin + u.pathname + '/', localPath);
      } catch {}

      htmlPages.push({ url, html, localPath });

      const links = extractLinks(html, url, origin);

      // Queue new pages
      for (const p of links.pages) {
        if (!visited.has(p) && !queue.includes(p)) queue.push(p);
      }

      // Collect assets
      links.css.forEach(u => { if(u){ allCss.add(u); if(!urlToPathMap.has(u)) urlToPathMap.set(u, urlToFilePath(u)); }});
      links.js.forEach(u  => { if(u){ allJs.add(u);  if(!urlToPathMap.has(u)) urlToPathMap.set(u, urlToFilePath(u)); }});
      links.images.forEach(u=>{ if(u){ allImages.add(u); if(!urlToPathMap.has(u)) urlToPathMap.set(u, urlToFilePath(u)); }});
      links.fonts.forEach(u => { if(u){ allFonts.add(u);  if(!urlToPathMap.has(u)) urlToPathMap.set(u, urlToFilePath(u)); }});
      links.other.forEach(u => { if(u){ allOther.add(u);  if(!urlToPathMap.has(u)) urlToPathMap.set(u, urlToFilePath(u)); }});
    } catch (e) {
      console.log(`[Scrape] ${url} — ${e.message}`);
    }
  }

  return { htmlPages, assets, allCss, allJs, allImages, allFonts, allOther, urlToPathMap, origin, usedProxy };
}

// ─── BUILD FRONTEND ZIP ───────────────────────────────────────────────────────
async function buildFrontendZip(crawlResult, includeInline = false) {
  const { htmlPages, allCss, allJs, allImages, allFonts, allOther, urlToPathMap, origin } = crawlResult;
  const zipFiles = [];
  let zipBytes = 0;

  // ── 1. HTML pages (with URL rewriting) ──
  for (const { url, html, localPath } of htmlPages) {
    // Rewrite all internal URLs to root-relative paths
    let rewritten = rewriteHtmlUrls(html, origin, urlToPathMap);

    const buf = Buffer.from(rewritten, 'utf-8');
    zipFiles.push({ name: localPath, data: buf });
    zipBytes += buf.length;

    // Inline scripts/styles as separate files (for .scrapeall)
    if (includeInline) {
      const { scripts, styles } = extractInlineCode(html);
      const base = localPath.replace(/\/index\.html$/, '').replace(/\.html$/, '');
      scripts.forEach((s, i) => {
        const nm = `${base}/_inline/script_${i}.js`;
        zipFiles.push({ name: nm, data: Buffer.from(s, 'utf-8') });
        zipBytes += s.length;
      });
      styles.forEach((s, i) => {
        const nm = `${base}/_inline/style_${i}.css`;
        zipFiles.push({ name: nm, data: Buffer.from(s, 'utf-8') });
        zipBytes += s.length;
      });
    }
  }

  // ── 2. Assets ──
  let assetCount = 0;
  const assetGroups = [
    { set: allCss,    binary: false, type: 'css'   },
    { set: allJs,     binary: false, type: 'js'    },
    { set: allImages, binary: true,  type: 'image' },
    { set: allFonts,  binary: true,  type: 'font'  },
    { set: allOther,  binary: true,  type: 'other' },
  ];

  for (const { set, binary, type } of assetGroups) {
    for (const assetUrl of set) {
      if (assetCount >= MAX_ASSETS || zipBytes > MAX_ZIP_MB * 1024 * 1024) break;
      const localPath = urlToPathMap.get(assetUrl) || urlToFilePath(assetUrl);
      try {
        await new Promise(r => setTimeout(r, 150));
        const { data } = await fetchWithFallback(assetUrl, { binary });
        let buf;
        if (binary) {
          buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        } else {
          // For CSS: rewrite internal URLs too
          let text = typeof data === 'string' ? data : data.toString('utf-8');
          if (type === 'css') text = rewriteCssUrls(text, origin);
          buf = Buffer.from(text, 'utf-8');
        }
        zipFiles.push({ name: localPath, data: buf });
        zipBytes += buf.length;
        assetCount++;
      } catch { /* skip failed assets */ }
    }
  }

  // ── 3. README for local serving ──
  const hostname = origin.replace(/^https?:\/\//, '');
  const readme = [
    `# ${hostname} — Cloned Website`,
    ``,
    `Scraped by VIPER BOT MD`,
    `Date: ${new Date().toUTCString()}`,
    `Source: ${origin}`,
    ``,
    `## Structure`,
    `This ZIP preserves the exact hosting structure of the original site.`,
    ``,
    `## How to view locally`,
    ``,
    `**Option 1 — VS Code Live Server (recommended)**`,
    `  1. Extract this ZIP`,
    `  2. Open the folder in VS Code`,
    `  3. Right-click index.html → "Open with Live Server"`,
    ``,
    `**Option 2 — Python**`,
    `  cd into extracted folder, then:`,
    `  python3 -m http.server 8080`,
    `  Open: http://localhost:8080`,
    ``,
    `**Option 3 — Node.js**`,
    `  npx serve .`,
    ``,
    `## Files`,
    `- HTML pages: ${htmlPages.length}`,
    `- CSS files:  ${[...allCss].length}`,
    `- JS files:   ${[...allJs].length}`,
    `- Images:     ${[...allImages].length}`,
    `- Fonts:      ${[...allFonts].length}`,
  ].join('\n');
  zipFiles.push({ name: 'README.md', data: Buffer.from(readme, 'utf-8') });

  return dedupeFiles(zipFiles);
}

// ─── BACKEND / DB PROBES ──────────────────────────────────────────────────────
async function probeBackend(startUrl) {
  const origin = getOrigin(startUrl); const results = [];
  await Promise.allSettled(BACKEND_PROBE_PATHS.map(async p => {
    const r = await probeUrl(origin + p);
    if (r.status > 0 && r.status !== 404 && r.size > 0) results.push(r);
  }));
  try { const b = await probeUrl(startUrl); if(b.status>0) results.unshift({...b,url:startUrl+' (root)'}); } catch {}
  return results;
}

async function probeDatabase(startUrl) {
  const origin = getOrigin(startUrl); const results = [];
  await Promise.allSettled(DB_PROBE_PATHS.map(async p => {
    const r = await probeUrl(origin + p);
    if (r.status > 0 && r.status !== 404 && r.size > 0) results.push({...r, path:p});
  }));
  return results;
}

function buildReportZip(hostname, backendResults, dbResults) {
  const zipFiles = [];
  let report = `# Backend Probe — ${hostname}\nDate: ${new Date().toISOString()}\n\n`;
  for (const r of backendResults) {
    report += `## ${r.url}\nStatus: ${r.status} | Size: ${r.size}b | Type: ${r.isJson?'JSON':r.isHtml?'HTML':'Other'}\n`;
    const ih = ['server','x-powered-by','content-type','x-frame-options','content-security-policy'];
    if(r.headers) for(const h of ih) if(r.headers[h]) report += `${h}: ${r.headers[h]}\n`;
    if(r.body) report += `\n\`\`\`\n${r.body.slice(0,1500)}\n\`\`\`\n`;
    report += '\n---\n\n';
  }
  zipFiles.push({ name:'backend/api_report.md', data:Buffer.from(report,'utf-8') });

  let dbr = `# DB/Config Probe — ${hostname}\nDate: ${new Date().toISOString()}\n\n`;
  if(!dbResults.length) { dbr+='✅ No exposed files found.\n'; }
  else {
    dbr += `⚠️ ${dbResults.length} exposed file(s):\n\n`;
    for(const r of dbResults){
      dbr+=`## ${r.path} [HTTP ${r.status}]\n${r.url}\nSize: ${r.size}b\n`;
      if(r.body) dbr+=`\n\`\`\`\n${r.body.slice(0,2000)}\n\`\`\`\n`;
      dbr+='\n---\n\n';
      if(r.body) zipFiles.push({name:'exposed'+r.path.replace(/[^a-z0-9._-]/gi,'_'),data:Buffer.from(r.body,'utf-8')});
    }
  }
  zipFiles.push({ name:'backend/db_config_report.md', data:Buffer.from(dbr,'utf-8') });
  return dedupeFiles(zipFiles);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
async function handleScrape(sock, msg, args, extra, mode) {
  const rawUrl = args.join('').trim();
  if (!rawUrl) {
    return extra.reply(
      '🕷️ *Viper Web Scraper — Structure-Preserving*\n\n```\n' +
      '.scrape   <url>  — Clone site (exact folder structure)\n' +
      '.scrapefd <url>  — Frontend only (same as .scrape)\n' +
      '.scrapebd <url>  — Backend API probe → report ZIP\n' +
      '.scrapedb <url>  — DB/config exposure probe → report ZIP\n' +
      '.scrapeall <url> — Everything + tech stack report\n' +
      '```\n\n' +
      '📁 _ZIP mirrors the exact server structure. Open locally with Live Server or `python3 -m http.server`_'
    );
  }

  const startUrl = normaliseUrl(rawUrl);
  if (!startUrl) return extra.reply('❌ Invalid URL.\nExample: `.scrape https://example.com`');

  const origin   = getOrigin(startUrl);
  const hostname = new URL(startUrl).hostname.replace('www.','');
  const hasProxy = !!process.env.SCRAPERAPI_KEY;
  const modeLabels = { fd0:'🕷️ Frontend Clone', fd:'🕷️ Frontend Clone', bd:'🔍 Backend Probe', db:'🗄️ DB/Config Probe', all:'🌐 Full Scrape' };

  await extra.reply(
    `${modeLabels[mode]||'🕷️ Scrape'}: \`${hostname}\`\n\n\`\`\`\n` +
    `Proxy  : ${hasProxy?'ScraperAPI ✅ + fallbacks':'allorigins / corsproxy / thingproxy / Direct'}\n` +
    `Target : ${startUrl}\n` +
    `Mode   : ${mode.toUpperCase()}\n` +
    `Limits : ${MAX_PAGES} pages · ${MAX_ASSETS} assets · ${FETCH_TIMEOUT/1000}s timeout\n` +
    `\`\`\`\n_Building ZIP with exact site structure... (30–120s)_`
  );

  try {
    let zipBuf, zipName, caption;

    // ── FRONTEND ──
    if (mode === 'fd' || mode === 'fd0') {
      const crawl = await crawlFrontend(startUrl);
      if (!crawl.htmlPages.length) return extra.reply('❌ Could not fetch any pages.\n```\nSite may block bots. Try .scrapeall.\n```');
      const files = await buildFrontendZip(crawl, false);
      zipBuf  = buildZip(files);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_clone.zip`;
      const cssCnt = files.filter(f=>f.name.endsWith('.css')).length;
      const jsCnt  = files.filter(f=>f.name.endsWith('.js')).length;
      const imgCnt = files.filter(f=>/\.(png|jpe?g|gif|svg|webp|ico|avif)$/i.test(f.name)).length;
      caption =
        `🕷️ *${hostname} — Cloned (Exact Structure)*\n\n\`\`\`\n` +
        `Pages  : ${crawl.htmlPages.length}\n` +
        `CSS    : ${cssCnt}\n` +
        `JS     : ${jsCnt}\n` +
        `Images : ${imgCnt}\n` +
        `Fonts  : ${files.filter(f=>/\.(woff2?|ttf|eot)$/i.test(f.name)).length}\n` +
        `Total  : ${files.length} files\n` +
        `Size   : ${(zipBuf.length/1024).toFixed(1)} KB\n` +
        `Proxy  : ${crawl.usedProxy}\n` +
        `\`\`\`\n📁 _Exact server structure. Open index.html with Live Server._\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    // ── BACKEND ──
    else if (mode === 'bd') {
      const backendResults = await probeBackend(startUrl);
      if (!backendResults.length) return extra.reply(`🔍 *${hostname}*\n\`\`\`\nNo accessible API endpoints found.\n\`\`\``);
      const files = buildReportZip(hostname, backendResults, []);
      zipBuf  = buildZip(files);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_backend.zip`;
      caption = `🔍 *${hostname} — Backend*\n\`\`\`\nEndpoints: ${backendResults.length}\nJSON: ${backendResults.filter(r=>r.isJson).length}\nSize: ${(zipBuf.length/1024).toFixed(1)} KB\n\`\`\`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    // ── DB PROBE ──
    else if (mode === 'db') {
      const dbResults = await probeDatabase(startUrl);
      const files = buildReportZip(hostname, [], dbResults);
      zipBuf  = buildZip(files);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_db_probe.zip`;
      caption = `🗄️ *${hostname} — DB/Config Probe*\n\`\`\`\nPaths tested: ${DB_PROBE_PATHS.length}\nExposed: ${dbResults.length}\nSize: ${(zipBuf.length/1024).toFixed(1)} KB\n\`\`\`\n${dbResults.length?'⚠️ *Exposed files found!*':'✅ Nothing exposed.'}\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    // ── FULL ──
    else if (mode === 'all') {
      const [crawl, backendResults, dbResults] = await Promise.all([
        crawlFrontend(startUrl), probeBackend(startUrl), probeDatabase(startUrl),
      ]);
      const allFiles = [];

      if (crawl.htmlPages.length > 0) {
        const fdFiles = await buildFrontendZip(crawl, true);
        fdFiles.forEach(f => allFiles.push(f));  // at root level — exact structure
      }
      const bdFiles = buildReportZip(hostname, backendResults, dbResults);
      bdFiles.forEach(f => allFiles.push({ name: '_reports/' + f.name, data: f.data }));

      // Tech stack
      const mainHtml = crawl.htmlPages[0]?.html || '';
      const stack    = detectTechStack(mainHtml, {}, crawl.allJs, crawl.allCss);
      const stackTxt = formatTechStack(stack);
      const stackRpt =
        `# Tech Stack — ${hostname}\nDate: ${new Date().toISOString()}\n\n## Technologies\n\n${stackTxt}\n\n` +
        `## Stats\n- Pages: ${crawl.htmlPages.length}\n- CSS: ${[...crawl.allCss].length}\n- JS: ${[...crawl.allJs].length}\n` +
        `- Images: ${[...crawl.allImages].length}\n- Backend endpoints: ${backendResults.length}\n- Exposed configs: ${dbResults.length}\n\n` +
        `## CSS URLs\n${[...crawl.allCss].map(u=>`- ${u}`).join('\n')||'none'}\n\n` +
        `## JS URLs\n${[...crawl.allJs].map(u=>`- ${u}`).join('\n')||'none'}\n`;
      allFiles.push({ name: '_reports/TECH_STACK.md', data: Buffer.from(stackRpt,'utf-8') });

      const deduped = dedupeFiles(allFiles);
      zipBuf  = buildZip(deduped);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_full.zip`;
      caption =
        `🌐 *${hostname} — Full Clone*\n\n\`\`\`\n` +
        `Pages   : ${crawl.htmlPages.length}\nCSS     : ${[...crawl.allCss].length}\nJS      : ${[...crawl.allJs].length}\n` +
        `Images  : ${[...crawl.allImages].length}\nAPI     : ${backendResults.length} endpoints\nExposed : ${dbResults.length} configs\n` +
        `Total   : ${deduped.length} files\nSize    : ${(zipBuf.length/1024).toFixed(1)} KB\nProxy   : ${crawl.usedProxy}\n\`\`\`\n` +
        `🔬 *Tech Stack:*\n\`\`\`\n${stackTxt}\n\`\`\`\n📁 _Open index.html with Live Server_\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    await sock.sendMessage(extra.from, {
      document: zipBuf, fileName: zipName, mimetype: 'application/zip', caption,
    }, { quoted: msg });

  } catch (e) {
    console.error('[Scrape Error]', e.message, e.stack?.split('\n')[1]||'');
    await extra.reply(`❌ Scrape failed: \`${e.message}\`\n\nTry a different URL or mode.`);
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = [
  {
    name:'scrape', aliases:['scrapeweb','clonesite','webscrape','dlsite'],
    category:'developer', description:'Clone website with exact folder structure (HTML/CSS/JS/images/fonts) → ZIP', usage:'.scrape <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'fd0'); },
  },
  {
    name:'scrapefd', aliases:['scrapefrontend','scrapefront'],
    category:'developer', description:'Frontend clone with exact structure → ZIP', usage:'.scrapefd <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'fd'); },
  },
  {
    name:'scrapebd', aliases:['scrapebackend','scrapeback','apiprobe'],
    category:'developer', description:'Backend probe — APIs, JSON, headers, robots → ZIP report', usage:'.scrapebd <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'bd'); },
  },
  {
    name:'scrapedb', aliases:['scrapeconfig','dbprobe','envprobe'],
    category:'developer', description:'Probe for exposed .env, DB dumps, configs, phpinfo → ZIP report', usage:'.scrapedb <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'db'); },
  },
  {
    name:'scrapeall', aliases:['fullscrape','clonesiteful','scrapefull'],
    category:'developer', description:'Full clone + backend probe + tech stack report → ZIP', usage:'.scrapeall <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'all'); },
  },
];
