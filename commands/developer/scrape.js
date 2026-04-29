/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  VIPER BOT MD — Deep Website Scraper  (Discovery-First Architecture)         ║
 * ║                                                                               ║
 * ║  PHASE 1 — DISCOVERY (finds every page before downloading anything)          ║
 * ║   • robots.txt  → parse Sitemap: directives + Disallow paths                ║
 * ║   • sitemap.xml / sitemap_index.xml → recursive sitemap parsing              ║
 * ║   • WP REST API → /wp-json/wp/v2/pages, /posts (WordPress sites)            ║
 * ║   • BFS crawl   → follow every <a href> recursively                          ║
 * ║   • JS route scan → extract paths from router definitions in .js files       ║
 * ║   • Cross-origin → api.site.com, cdn.site.com auto-discovered                ║
 * ║                                                                               ║
 * ║  PHASE 2 — DEEP SCRAPE (accurate code, full structure)                       ║
 * ║   • Exact server folder structure preserved in ZIP                           ║
 * ║   • Source maps (.js.map) downloaded and included                            ║
 * ║   • Inline <script> and <style> extracted as separate files                  ║
 * ║   • CSS @import chains fully resolved                                        ║
 * ║   • All internal URLs rewritten so site works locally                        ║
 * ║                                                                               ║
 * ║  Commands:                                                                    ║
 * ║   .scrape   <url> → Full frontend clone (exact structure)                   ║
 * ║   .scrapefd <url> → Frontend only (alias)                                   ║
 * ║   .scrapebd <url> → Backend probe (APIs, JSON, headers)                     ║
 * ║   .scrapedb <url> → DB/config probe (.env, dumps, phpinfo)                  ║
 * ║   .scrapeall <url>→ EVERYTHING: frontend + backend + DB + tech stack        ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios  = require('axios');
const zlib   = require('zlib');
const path   = require('path');
const config = require('../../config');

// ─── LIMITS ──────────────────────────────────────────────────────────────────
const MAX_PAGES       = 300;   // find up to 300 pages
const MAX_ASSETS      = 500;   // up to 500 assets
const MAX_ZIP_MB      = 48;    // 48 MB zip cap
const FETCH_TIMEOUT   = 25000; // 25s per request
const PROBE_TIMEOUT   = 8000;  // 8s for probe requests (fast-fail)
const CRAWL_DELAY_MS  = 120;   // 120ms between crawl requests
const USER_AGENT      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Backend probe paths
const BACKEND_PROBE_PATHS = [
  '/api','/api/v1','/api/v2','/api/v3','/api/health','/api/status','/api/config',
  '/api/users','/api/products','/api/data','/api/info','/api/me','/api/auth',
  '/api/login','/api/register','/api/settings','/api/admin',
  '/graphql','/graphiql','/swagger','/swagger-ui','/swagger.json','/swagger-ui.html',
  '/openapi.json','/openapi.yaml','/api-docs','/api-docs.json','/redoc',
  '/health','/healthz','/status','/ping','/ready','/live','/version',
  '/server-info','/info','/debug','/metrics',
  '/.well-known/openid-configuration','/.well-known/security.txt','/security.txt',
  '/wp-json','/wp-json/wp/v2','/wp-json/wp/v2/pages','/wp-json/wp/v2/posts',
  '/rest/api','/rest/v1','/rest/v2',
  '/v1','/v2','/v3',
];

// DB/config probe paths
const DB_PROBE_PATHS = [
  '/.env','/.env.bak','/.env.local','/.env.production','/.env.example','/.env.staging',
  '/config.php','/config.js','/config.json','/config.yaml','/config.yml','/configuration.php',
  '/settings.php','/settings.json','/settings.py',
  '/wp-config.php','/wp-config.bak','/wp-config.php.bak',
  '/database.php','/db.php','/db.json','/db.yaml','/connection.php','/database.yml',
  '/backup.sql','/dump.sql','/database.sql','/db.sql','/data.sql','/export.sql',
  '/.git/config','/.git/HEAD','/.git/FETCH_HEAD','/.gitignore','/.gitmodules',
  '/.htaccess','/.htpasswd','/web.config','/nginx.conf','/apache2.conf','/httpd.conf',
  '/phpinfo.php','/info.php','/test.php','/debug.php','/status.php',
  '/server-status','/server-info',
  '/robots.txt','/sitemap.xml','/sitemap_index.xml',
  '/crossdomain.xml','/clientaccesspolicy.xml',
  '/package.json','/composer.json','/Gemfile','/Gemfile.lock','/requirements.txt',
  '/Dockerfile','/docker-compose.yml','/docker-compose.yaml',
  '/Makefile','/.travis.yml','/.github/workflows',
  '/proc/self/environ','/etc/passwd',
];

// ─── HTTP FETCH WITH FREE PROXY FALLBACK CHAIN ───────────────────────────────
async function fetchWithFallback(url, { binary = false, timeout = FETCH_TIMEOUT } = {}) {
  const rType = binary ? 'arraybuffer' : 'text';
  const hdrs  = { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br' };
  const opts  = { timeout, maxRedirects: 10, validateStatus: s => s < 400 };

  // 1. ScraperAPI (paid, if key available)
  if (process.env.SCRAPERAPI_KEY) {
    try {
      const r = await axios.get('https://api.scraperapi.com/', {
        params: { api_key: process.env.SCRAPERAPI_KEY, url, render: 'true' },
        responseType: rType, headers: hdrs, ...opts,
      });
      return { data: r.data, ct: r.headers['content-type']||'', proxy: 'ScraperAPI', resHeaders: r.headers };
    } catch {}
  }

  // 2. allorigins.win (free)
  try {
    const r = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
      responseType: rType, headers: hdrs, timeout, maxRedirects: 8, validateStatus: s => s < 500,
    });
    const ok = typeof r.data === 'string' ? r.data.length > 20 : r.data?.byteLength > 20;
    if (ok) return { data: r.data, ct: r.headers['content-type']||'', proxy: 'allorigins.win', resHeaders: r.headers };
  } catch {}

  // 3. corsproxy.io (free)
  try {
    const r = await axios.get(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
      responseType: rType, headers: hdrs, timeout, maxRedirects: 8, validateStatus: s => s < 500,
    });
    const ok = typeof r.data === 'string' ? r.data.length > 20 : r.data?.byteLength > 20;
    if (ok) return { data: r.data, ct: r.headers['content-type']||'', proxy: 'corsproxy.io', resHeaders: r.headers };
  } catch {}

  // 4. thingproxy (free)
  try {
    const r = await axios.get(`https://thingproxy.freeboard.io/fetch/${url}`, {
      responseType: rType, headers: hdrs, timeout, maxRedirects: 8, validateStatus: s => s < 500,
    });
    const ok = typeof r.data === 'string' ? r.data.length > 20 : r.data?.byteLength > 20;
    if (ok) return { data: r.data, ct: r.headers['content-type']||'', proxy: 'thingproxy', resHeaders: r.headers };
  } catch {}

  // 5. Direct HTTP
  const r = await axios.get(url, { responseType: rType, headers: hdrs, ...opts });
  return { data: r.data, ct: r.headers['content-type']||'', proxy: 'Direct', resHeaders: r.headers };
}

// Fast probe — tries direct only, no fallbacks (used for page discovery)
async function quickFetch(url) {
  try {
    const r = await axios.get(url, {
      timeout: PROBE_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 5,
      validateStatus: () => true,
    });
    return { ok: r.status < 400, status: r.status, data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data), headers: r.headers };
  } catch {
    return { ok: false, status: 0, data: '', headers: {} };
  }
}

// ─── URL HELPERS ─────────────────────────────────────────────────────────────
function normaliseUrl(raw) {
  raw = raw.trim().replace(/\s+/g, '');
  if (!raw.startsWith('http')) raw = 'https://' + raw;
  try { return new URL(raw).href; } catch { return null; }
}
function getOrigin(url)    { try { return new URL(url).origin; } catch { return ''; } }
function getHostname(url)  { try { return new URL(url).hostname; } catch { return ''; } }
function getRootDomain(url) {
  try {
    const parts = new URL(url).hostname.split('.');
    return parts.slice(-2).join('.');
  } catch { return ''; }
}
function resolveUrl(base, href) {
  if (!href || /^(data:|javascript:|mailto:|tel:|#)/.test(href)) return null;
  try { return new URL(href, base).href; } catch { return null; }
}
function isSameOrigin(origin, url)  { try { return new URL(url).origin === origin; } catch { return false; } }
function isSameRootDomain(root, url){ try { return new URL(url).hostname.endsWith(root) || new URL(url).hostname === root; } catch { return false; } }
function cleanUrl(url) { try { const u = new URL(url); u.hash = ''; return u.href; } catch { return url; } }

/**
 * URL → local file path preserving exact server structure
 *   /                    → index.html
 *   /about               → about/index.html
 *   /about.html          → about.html
 *   /assets/app.js       → assets/app.js
 *   /blog/post-1         → blog/post-1/index.html
 */
function urlToFilePath(url) {
  try {
    const u = new URL(url);
    let p = u.pathname.replace(/\.\./g, '__');
    if (p === '' || p === '/') return 'index.html';
    p = p.replace(/^\//, '');
    if (p.endsWith('/')) return p + 'index.html';
    if (/\.[a-zA-Z0-9]{1,8}$/.test(p)) return p;
    return p + '/index.html';
  } catch { return '_unknown/' + Math.random().toString(36).slice(2) + '.html'; }
}

// ─── PHASE 1: DISCOVERY ENGINE ───────────────────────────────────────────────
// Finds EVERY page URL before downloading anything.
// Uses: robots.txt, sitemaps, WP REST API, BFS crawl, JS route parsing.

/**
 * Parse robots.txt — extract Sitemap: directives and Disallow paths
 */
async function parseRobots(origin) {
  const discovered = { sitemaps: [], paths: [] };
  const { ok, data } = await quickFetch(origin + '/robots.txt');
  if (!ok || !data) return discovered;
  for (const line of data.split('\n')) {
    const l = line.trim();
    if (/^Sitemap:/i.test(l)) {
      const sm = l.replace(/^Sitemap:\s*/i, '').trim();
      if (sm) discovered.sitemaps.push(sm);
    }
    if (/^(Disallow|Allow):\s*\//i.test(l)) {
      const p = l.replace(/^(Disallow|Allow):\s*/i, '').trim().split('?')[0].split('*')[0];
      if (p && p !== '/' && p.length > 1) discovered.paths.push(origin + p);
    }
  }
  return discovered;
}

/**
 * Parse a sitemap XML — returns list of URLs, recursing into sitemap indexes
 */
async function parseSitemap(sitemapUrl, depth = 0) {
  if (depth > 4) return [];
  const { ok, data } = await quickFetch(sitemapUrl);
  if (!ok || !data || typeof data !== 'string') return [];

  const urls = [];

  // Sitemap index — contains <sitemap><loc> entries pointing to child sitemaps
  const childSitemaps = [...data.matchAll(/<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi)].map(m => m[1].trim());
  if (childSitemaps.length) {
    const nested = await Promise.all(childSitemaps.map(u => parseSitemap(u, depth + 1)));
    nested.forEach(list => urls.push(...list));
  }

  // Regular sitemap — contains <url><loc> entries
  const pageUrls = [...data.matchAll(/<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi)].map(m => m[1].trim());
  urls.push(...pageUrls);

  return urls;
}

/**
 * WordPress REST API discovery — gets all page and post slugs
 */
async function discoverWordPress(origin) {
  const urls = [];
  const endpoints = [
    `${origin}/wp-json/wp/v2/pages?per_page=100&_fields=link`,
    `${origin}/wp-json/wp/v2/posts?per_page=100&_fields=link`,
    `${origin}/wp-json/wp/v2/categories?per_page=100&_fields=link`,
    `${origin}/?rest_route=/wp/v2/pages&per_page=100&_fields=link`,
  ];
  await Promise.allSettled(endpoints.map(async ep => {
    const { ok, data } = await quickFetch(ep);
    if (!ok || !data) return;
    try {
      const items = JSON.parse(data);
      if (Array.isArray(items)) items.forEach(p => { if (p.link) urls.push(p.link); });
    } catch {}
  }));
  return urls;
}

/**
 * Extract page routes from JavaScript files
 * Finds patterns like: path: '/about', route('/contact'), href="/pricing"
 */
function extractRoutesFromJs(jsText, origin) {
  const routes = new Set();
  const patterns = [
    /(?:path|route|href|to|url)\s*[:=]\s*["'`](\/[a-zA-Z0-9_\-\/\.]+)["'`]/g,
    /["'`](\/[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-]+)+)["'`]/g,
    /component\s*:\s*["'`](\/[^"'`]+)["'`]/g,
  ];
  for (const re of patterns) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(jsText)) !== null) {
      const p = m[1];
      if (p && !p.includes('*') && !p.includes('{') && p.length < 100) {
        routes.add(origin + p);
      }
    }
  }
  return [...routes];
}

/**
 * Discover cross-origin related hosts (api.*, cdn.*, static.*, etc.)
 */
function discoverRelatedHosts(origin, allHtml) {
  const rootDomain = getRootDomain(origin);
  const found = new Set();
  const prefixes = ['api', 'cdn', 'static', 'assets', 'media', 'img', 'images', 'files', 'storage', 'uploads', 'backend', 'app', 'www', 'dev', 'staging'];
  // Find any subdomain.rootdomain.com references in the HTML
  const re = new RegExp(`https?://([a-zA-Z0-9_-]+\\.${rootDomain.replace('.','\\.')})`, 'gi');
  let m;
  while ((m = re.exec(allHtml)) !== null) {
    found.add('https://' + m[1]);
    found.add('http://' + m[1]);
  }
  // Also try common prefixes
  for (const p of prefixes) {
    found.add(`https://${p}.${rootDomain}`);
  }
  return [...found];
}

/**
 * MAIN DISCOVERY ENGINE — finds all page URLs before downloading
 */
async function discoverAllPages(startUrl) {
  const origin    = getOrigin(startUrl);
  const rootDomain= getRootDomain(startUrl);
  const discovered= new Set();
  const sitemapUrls = [];

  console.log(`[Scraper] Discovery phase starting for ${origin}`);

  // 1. robots.txt
  const robots = await parseRobots(origin);
  robots.paths.forEach(u => discovered.add(cleanUrl(u)));
  robots.sitemaps.forEach(u => sitemapUrls.push(u));

  // 2. Common sitemap locations
  sitemapUrls.push(
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemaps.xml`,
    `${origin}/sitemap/sitemap.xml`,
    `${origin}/page-sitemap.xml`,
    `${origin}/post-sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
  );

  // 3. Parse all sitemaps
  const sitemapResults = await Promise.all([...new Set(sitemapUrls)].map(u => parseSitemap(u)));
  sitemapResults.flat().forEach(u => { if (u && isSameRootDomain(rootDomain, u)) discovered.add(cleanUrl(u)); });

  console.log(`[Scraper] Sitemap phase: ${discovered.size} URLs found`);

  // 4. WordPress REST API
  const wpUrls = await discoverWordPress(origin);
  wpUrls.forEach(u => discovered.add(cleanUrl(u)));

  // 5. Common page paths to probe
  const commonPaths = [
    '/','/index','/home','/about','/about-us','/contact','/contact-us',
    '/services','/products','/pricing','/plans','/blog','/news','/faq',
    '/login','/register','/signup','/sign-up','/dashboard','/profile',
    '/portfolio','/gallery','/team','/careers','/jobs','/help','/support',
    '/terms','/terms-of-service','/privacy','/privacy-policy','/cookies',
    '/docs','/documentation','/api','/sitemap','/404','/500',
    '/shop','/store','/cart','/checkout','/orders','/account',
    '/admin','/panel','/cp','/cpanel','/management',
  ];
  // Probe them all in parallel
  const probeResults = await Promise.allSettled(
    commonPaths.map(async p => {
      const u = origin + p;
      const r = await quickFetch(u);
      if (r.ok && r.data && typeof r.data === 'string' && r.data.includes('<')) discovered.add(u);
    })
  );

  console.log(`[Scraper] Common paths + WP: ${discovered.size} URLs`);

  // 6. Seed discovered with the start URL itself
  discovered.add(cleanUrl(startUrl));

  return { discovered, origin, rootDomain };
}

// ─── PHASE 2: DEEP CRAWL ─────────────────────────────────────────────────────
// BFS from all discovered URLs, extracts links from every page and JS file.

function extractAllLinks(html, baseUrl, origin, rootDomain) {
  const links = { pages: new Set(), css: new Set(), js: new Set(), images: new Set(), fonts: new Set(), other: new Set() };

  // <a href>
  for (const [, href] of html.matchAll(/href=["']([^"'#][^"']*?)["']/gi)) {
    const abs = resolveUrl(baseUrl, href);
    if (!abs) continue;
    if (isSameOrigin(origin, abs)) links.pages.add(cleanUrl(abs));
    else if (isSameRootDomain(rootDomain, abs)) links.pages.add(cleanUrl(abs)); // sub-domains
  }

  // CSS
  for (const [, href] of html.matchAll(/(?:href|url)=["']([^"']+\.css[^"']*)["']/gi))
    links.css.add(resolveUrl(baseUrl, href) || '');
  for (const [, href] of html.matchAll(/@import\s+["']([^"']+\.css[^"']*)["']/gi))
    links.css.add(resolveUrl(baseUrl, href) || '');

  // JS
  for (const [, src] of html.matchAll(/src=["']([^"']+\.m?js[^"']*)["']/gi))
    links.js.add(resolveUrl(baseUrl, src) || '');

  // Images
  for (const [, src] of html.matchAll(/(?:src|data-src|data-lazy)=["']([^"']+)["']/gi)) {
    if (/\.(png|jpe?g|gif|svg|webp|ico|avif|bmp)(\?|$)/i.test(src)) {
      const abs = resolveUrl(baseUrl, src);
      if (abs) links.images.add(abs);
    }
  }
  for (const [, ss] of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    ss.split(',').forEach(part => {
      const abs = resolveUrl(baseUrl, part.trim().split(/\s+/)[0]);
      if (abs && /\.(png|jpe?g|gif|svg|webp|ico|avif)(\?|$)/i.test(abs)) links.images.add(abs);
    });
  }
  // CSS background images
  for (const [, u] of html.matchAll(/url\(["']?([^"')]+\.(png|jpe?g|gif|svg|webp|ico|avif)[^"')']*)["']?\)/gi)) {
    const abs = resolveUrl(baseUrl, u);
    if (abs) links.images.add(abs);
  }

  // Fonts
  for (const [, u] of html.matchAll(/url\(["']?([^"')]+\.(?:woff2?|ttf|eot|otf)[^"')']*)["']?\)/gi)) {
    const abs = resolveUrl(baseUrl, u);
    if (abs) links.fonts.add(abs);
  }

  // Source maps
  for (const [, u] of html.matchAll(/sourceMappingURL=([^\s\n]+\.map)/gi)) {
    const abs = resolveUrl(baseUrl, u);
    if (abs) links.other.add(abs);
  }

  // Remove empty strings
  for (const k of Object.keys(links)) links[k].delete('');
  return links;
}

// ─── MAIN CRAWL ENGINE ───────────────────────────────────────────────────────
async function deepCrawl(startUrl, preDiscovered) {
  const origin    = getOrigin(startUrl);
  const rootDomain= getRootDomain(startUrl);

  const visited   = new Set();
  const queue     = [];
  const htmlPages = [];   // { url, html, localPath, headers }
  const allCss    = new Set();
  const allJs     = new Set();
  const allImages = new Set();
  const allFonts  = new Set();
  const allOther  = new Set();
  const urlToPathMap = new Map();
  let   allHtmlText  = '';
  let   usedProxy    = 'Direct';

  // Seed queue from discovery phase first (sitemap + probed pages)
  if (preDiscovered) preDiscovered.forEach(u => queue.push(u));
  queue.push(startUrl); // always include start

  // BFS loop
  while (queue.length > 0 && htmlPages.length < MAX_PAGES) {
    const url = queue.shift();
    const clean = cleanUrl(url);
    if (visited.has(clean)) continue;
    visited.add(clean);

    try {
      await new Promise(r => setTimeout(r, CRAWL_DELAY_MS));
      const result = await fetchWithFallback(clean);
      usedProxy = result.proxy;
      const html = result.data;
      if (typeof html !== 'string' || html.length < 30) continue;

      const localPath = urlToFilePath(clean);
      urlToPathMap.set(clean, localPath);
      // Map URL variants
      try {
        const u = new URL(clean);
        const noTrail = u.pathname.endsWith('/') ? origin + u.pathname.slice(0,-1) : origin + u.pathname + '/';
        urlToPathMap.set(noTrail, localPath);
      } catch {}

      htmlPages.push({ url: clean, html, localPath, headers: result.resHeaders || {} });
      allHtmlText += html.slice(0, 5000); // collect for cross-origin discovery

      const links = extractAllLinks(html, clean, origin, rootDomain);

      // Queue new pages
      for (const p of links.pages) {
        if (!visited.has(p) && !queue.includes(p)) queue.push(p);
      }

      // Collect assets
      links.css.forEach(u    => { if(u){ allCss.add(u);    urlToPathMap.set(u, urlToFilePath(u)); }});
      links.js.forEach(u     => { if(u){ allJs.add(u);     urlToPathMap.set(u, urlToFilePath(u)); }});
      links.images.forEach(u => { if(u){ allImages.add(u); urlToPathMap.set(u, urlToFilePath(u)); }});
      links.fonts.forEach(u  => { if(u){ allFonts.add(u);  urlToPathMap.set(u, urlToFilePath(u)); }});
      links.other.forEach(u  => { if(u){ allOther.add(u);  urlToPathMap.set(u, urlToFilePath(u)); }});

      // Parse JS files for additional routes
      for (const jsUrl of links.js) {
        if (!jsUrl || visited.has(jsUrl)) continue;
        visited.add(jsUrl);
        try {
          await new Promise(r => setTimeout(r, 80));
          const jsResult = await fetchWithFallback(jsUrl);
          const jsText = typeof jsResult.data === 'string' ? jsResult.data : '';
          if (jsText) {
            const routes = extractRoutesFromJs(jsText, origin);
            routes.forEach(r => { if (!visited.has(r) && !queue.includes(r)) queue.push(r); });
          }
        } catch {}
      }

    } catch (e) {
      console.log(`[Crawl] ${url} — ${e.message?.slice(0,60)}`);
    }
  }

  // Discover and probe cross-origin related hosts
  const relatedHosts = discoverRelatedHosts(origin, allHtmlText);
  const crossOriginAssets = new Set();
  await Promise.allSettled(relatedHosts.map(async host => {
    const r = await quickFetch(host);
    if (r.ok && r.data) {
      const links2 = extractAllLinks(r.data, host, host, getRootDomain(host));
      links2.css.forEach(u    => { if(u){ allCss.add(u); crossOriginAssets.add(u); }});
      links2.js.forEach(u     => { if(u){ allJs.add(u);  crossOriginAssets.add(u); }});
      links2.images.forEach(u => { if(u){ allImages.add(u); }});
    }
  }));

  return { htmlPages, allCss, allJs, allImages, allFonts, allOther, urlToPathMap, origin, usedProxy, crossOriginAssets };
}

// ─── URL REWRITING ────────────────────────────────────────────────────────────
function rewriteHtml(html, origin, urlToPathMap) {
  const esc = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Rewrite absolute origin URLs to root-relative
  html = html.replace(
    new RegExp(`((?:href|src|action|data-src|data-href|content|data-url)\\s*=\\s*["'])(${esc})(/[^"']*?)(["'])`, 'gi'),
    (match, attr, orig, urlPath, quote) => {
      const abs = orig + urlPath;
      return `${attr}${urlToPathMap.has(abs) ? '/' + urlToPathMap.get(abs) : urlPath}${quote}`;
    }
  );
  return html;
}

function rewriteCss(css, origin) {
  const esc = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css
    .replace(new RegExp(`url\\(["']?(${esc})(/[^"')]*?)["']?\\)`, 'gi'), 'url(\'$2\')')
    .replace(new RegExp(`@import\\s+["'](${esc})(/[^"']*)["']`, 'gi'), "@import '$2'");
}

function extractInline(html) {
  const scripts = [], styles = []; let m;
  const sr = /<script(?:\s[^>]*)?>( [\s\S]*?)<\/script>/gi;
  while ((m = sr.exec(html)) !== null) if (m[1].trim().length > 15) scripts.push(m[1].trim());
  const tr = /<style(?:\s[^>]*)?>( [\s\S]*?)<\/style>/gi;
  while ((m = tr.exec(html)) !== null) if (m[1].trim().length > 5)  styles.push(m[1].trim());
  return { scripts, styles };
}

// ─── TECH STACK DETECTOR ─────────────────────────────────────────────────────
function detectTechStack(html, headers, jsUrls, cssUrls) {
  const s = { frontend:[], backend:[], cms:[], analytics:[], ui:[], hosting:[], security:[], fonts:[], buildTool:[], database:[], language:[] };
  const h = html.toLowerCase(), hd = JSON.stringify(headers||{}).toLowerCase();
  const js = [...jsUrls].join(' ').toLowerCase(), css = [...cssUrls].join(' ').toLowerCase();

  if (h.includes('react')||js.includes('react'))           s.frontend.push('React');
  if (h.includes('vue')||js.includes('vue'))               s.frontend.push('Vue.js');
  if (h.includes('angular')||js.includes('angular'))       s.frontend.push('Angular');
  if (h.includes('svelte')||js.includes('svelte'))         s.frontend.push('Svelte');
  if (js.includes('_next')||h.includes('__next'))          s.frontend.push('Next.js');
  if (js.includes('nuxt')||h.includes('__nuxt'))           s.frontend.push('Nuxt.js');
  if (js.includes('jquery')||h.includes('jquery'))         s.frontend.push('jQuery');
  if (h.includes('alpinejs')||js.includes('alpine'))       s.frontend.push('Alpine.js');
  if (h.includes('ember')||js.includes('ember'))           s.frontend.push('Ember.js');

  if (css.includes('bootstrap')||h.includes('bootstrap'))  s.ui.push('Bootstrap');
  if (h.includes('tailwind')||css.includes('tailwind'))    s.ui.push('Tailwind CSS');
  if (h.includes('material')||h.includes('mui'))           s.ui.push('Material UI');
  if (h.includes('bulma'))                                  s.ui.push('Bulma');
  if (h.includes('fontawesome')||h.includes('font-awesome'))s.ui.push('Font Awesome');
  if (h.includes('ant-design')||h.includes('antd'))        s.ui.push('Ant Design');
  if (h.includes('chakra'))                                 s.ui.push('Chakra UI');
  if (h.includes('shadcn'))                                 s.ui.push('shadcn/ui');

  if (h.includes('wp-content')||h.includes('wp-includes')) s.cms.push('WordPress');
  if (h.includes('drupal'))                                 s.cms.push('Drupal');
  if (h.includes('cdn.shopify')||h.includes('shopify'))    s.cms.push('Shopify');
  if (h.includes('wixsite')||h.includes('wix.com'))        s.cms.push('Wix');
  if (h.includes('squarespace'))                            s.cms.push('Squarespace');
  if (h.includes('ghost')||h.includes('ghost.io'))         s.cms.push('Ghost');
  if (h.includes('webflow'))                                s.cms.push('Webflow');
  if (h.includes('joomla'))                                 s.cms.push('Joomla');

  if (hd.includes('x-powered-by: php')||h.includes('.php')) s.language.push('PHP');
  if (hd.includes('x-powered-by: express'))                  s.backend.push('Express.js');
  if (hd.includes('laravel'))                                 s.backend.push('Laravel');
  if (h.includes('csrfmiddlewaretoken')||hd.includes('django'))s.backend.push('Django');
  if (hd.includes('flask'))                                    s.backend.push('Flask');
  if (hd.includes('ruby')||hd.includes('rails'))              s.backend.push('Ruby on Rails');
  if (hd.includes('asp.net'))                                  s.backend.push('ASP.NET');
  if (h.includes('codeigniter'))                               s.backend.push('CodeIgniter');
  if (h.includes('symfony'))                                    s.backend.push('Symfony');

  if (hd.includes('nginx'))                                    s.hosting.push('Nginx');
  if (hd.includes('apache'))                                    s.hosting.push('Apache');
  if (hd.includes('cloudflare'))                               s.hosting.push('Cloudflare');
  if (hd.includes('vercel'))                                   s.hosting.push('Vercel');
  if (hd.includes('netlify'))                                  s.hosting.push('Netlify');
  if (hd.includes('x-amz')||hd.includes('amazonaws'))         s.hosting.push('AWS');
  if (hd.includes('fly.io'))                                   s.hosting.push('Fly.io');
  if (hd.includes('render'))                                   s.hosting.push('Render.com');
  if (hd.includes('heroku'))                                   s.hosting.push('Heroku');

  if (h.includes('googletagmanager')||h.includes('gtag'))     s.analytics.push('Google Analytics');
  if (h.includes('fbevents'))                                  s.analytics.push('Facebook Pixel');
  if (h.includes('hotjar'))                                    s.analytics.push('Hotjar');
  if (h.includes('mixpanel'))                                  s.analytics.push('Mixpanel');
  if (h.includes('plausible'))                                 s.analytics.push('Plausible');

  if (hd.includes('content-security-policy'))                  s.security.push('CSP Header');
  if (hd.includes('strict-transport-security'))                s.security.push('HSTS');
  if (h.includes('recaptcha'))                                 s.security.push('reCAPTCHA');
  if (h.includes('turnstile'))                                 s.security.push('Cloudflare Turnstile');

  if (h.includes('fonts.googleapis'))                          s.fonts.push('Google Fonts');
  if (h.includes('typekit'))                                   s.fonts.push('Adobe Fonts');
  if (h.includes('bunny.net/fonts'))                           s.fonts.push('Bunny Fonts');

  if (h.includes('__webpack')||js.includes('webpack'))         s.buildTool.push('Webpack');
  if (h.includes('/@vite/')||js.includes('vite'))             s.buildTool.push('Vite');
  if (js.includes('parcel'))                                   s.buildTool.push('Parcel');

  if (h.includes('firebase')||h.includes('firebaseapp'))       s.database.push('Firebase');
  if (h.includes('supabase'))                                   s.database.push('Supabase');
  if (h.includes('mongodb')||h.includes('mongoose'))           s.database.push('MongoDB');
  if (h.includes('prisma'))                                     s.database.push('Prisma');

  for (const k of Object.keys(s)) s[k] = [...new Set(s[k])];
  return s;
}

function formatTechStack(s) {
  const labels = {
    frontend:'⚛️ Frontend', ui:'🎨 UI/CSS', backend:'🛠️ Backend', language:'🐘 Language',
    cms:'📝 CMS', database:'🗄️ Database', hosting:'☁️ Hosting', buildTool:'⚙️ Build Tool',
    analytics:'📊 Analytics', fonts:'🔤 Fonts', security:'🔒 Security',
  };
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
function crc32(buf) { let c=0xFFFFFFFF; for(let i=0;i<buf.length;i++) c=CRC_TABLE[(c^buf[i])&0xFF]^(c>>>8); return(c^0xFFFFFFFF)>>>0; }

function buildZip(files) {
  const entries=[]; let offset=0;
  for (const f of files) {
    const nb=Buffer.from(f.name,'utf8');
    const raw=Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data||'');
    const compressed=zlib.deflateRawSync(raw,{level:6});
    const crc=crc32(raw);
    const local=Buffer.concat([Buffer.from([0x50,0x4B,0x03,0x04]),u16(20),u16(0),u16(8),u16(0),u16(0),u32(crc),u32(compressed.length),u32(raw.length),u16(nb.length),u16(0),nb,compressed]);
    entries.push({nb,crc,compressed,raw,offset,local});
    offset+=local.length;
  }
  const cd=entries.map(e=>Buffer.concat([Buffer.from([0x50,0x4B,0x01,0x02]),u16(20),u16(20),u16(0),u16(8),u16(0),u16(0),u32(e.crc),u32(e.compressed.length),u32(e.raw.length),u16(e.nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(e.offset),e.nb]));
  const cb=Buffer.concat(cd);
  const eocd=Buffer.concat([Buffer.from([0x50,0x4B,0x05,0x06]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cb.length),u32(offset),u16(0)]);
  return Buffer.concat([...entries.map(e=>e.local),cb,eocd]);
}

function dedupeFiles(files) {
  const seen=new Map();
  return files.map(f=>{
    if(!seen.has(f.name)){seen.set(f.name,0);return f;}
    const n=seen.get(f.name)+1; seen.set(f.name,n);
    const ext=path.extname(f.name),base=f.name.slice(0,-ext.length||undefined);
    return{name:`${base}_${n}${ext}`,data:f.data};
  });
}

// ─── BUILD FRONTEND ZIP ───────────────────────────────────────────────────────
async function buildFrontendZip(crawlResult, includeInline = false) {
  const { htmlPages, allCss, allJs, allImages, allFonts, allOther, urlToPathMap, origin } = crawlResult;
  const zipFiles = [];
  let zipBytes = 0;
  const hostname = origin.replace(/^https?:\/\//, '');

  // ── 1. HTML Pages ──
  for (const { url, html, localPath } of htmlPages) {
    const rewritten = rewriteHtml(html, origin, urlToPathMap);
    const buf = Buffer.from(rewritten, 'utf-8');
    zipFiles.push({ name: localPath, data: buf });
    zipBytes += buf.length;

    if (includeInline) {
      const { scripts, styles } = extractInline(html);
      const base = localPath.replace(/\/index\.html$/, '').replace(/\.html$/, '');
      scripts.forEach((s, i) => { zipFiles.push({ name: `${base}/_inline/script_${i}.js`,   data: Buffer.from(s,'utf-8') }); zipBytes+=s.length; });
      styles.forEach((s, i)  => { zipFiles.push({ name: `${base}/_inline/style_${i}.css`,   data: Buffer.from(s,'utf-8') }); zipBytes+=s.length; });
    }
  }

  // ── 2. Assets ──
  let assetCount = 0;
  const groups = [
    { set: allCss,    binary: false, label: 'css'   },
    { set: allJs,     binary: false, label: 'js'    },
    { set: allImages, binary: true,  label: 'image' },
    { set: allFonts,  binary: true,  label: 'font'  },
    { set: allOther,  binary: true,  label: 'other' },
  ];

  for (const { set, binary, label } of groups) {
    for (const assetUrl of set) {
      if (assetCount >= MAX_ASSETS || zipBytes > MAX_ZIP_MB * 1024 * 1024) break;
      const lp = urlToPathMap.get(assetUrl) || urlToFilePath(assetUrl);
      try {
        await new Promise(r => setTimeout(r, 80));
        const { data } = await fetchWithFallback(assetUrl, { binary });
        let buf;
        if (binary) {
          buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        } else {
          let text = typeof data === 'string' ? data : (data||'').toString('utf-8');
          if (label === 'css') text = rewriteCss(text, origin);
          buf = Buffer.from(text, 'utf-8');
        }
        zipFiles.push({ name: lp, data: buf });
        zipBytes += buf.length;
        assetCount++;
      } catch {}
    }
  }

  // ── 3. README ──
  const readme = [
    `# ${hostname} — Cloned Website`,
    `Scraped: ${new Date().toUTCString()}`,
    `Source: ${origin}`,
    `Pages: ${htmlPages.length} | CSS: ${[...allCss].length} | JS: ${[...allJs].length} | Images: ${[...allImages].length}`,
    ``,
    `## How to view locally`,
    `**VS Code Live Server**: Right-click index.html → Open with Live Server`,
    `**Python**: cd into folder → python3 -m http.server 8080 → open http://localhost:8080`,
    `**Node.js**: npx serve .`,
    ``,
    `## Page map`,
    ...htmlPages.map(p => `  ${p.url} → ${p.localPath}`),
  ].join('\n');
  zipFiles.push({ name: 'README.md', data: Buffer.from(readme, 'utf-8') });

  // ── 4. Page map JSON (machine-readable) ──
  const pageMap = { origin, scrapedAt: new Date().toISOString(), pages: htmlPages.map(p => ({ url: p.url, localPath: p.localPath })) };
  zipFiles.push({ name: '_sitemap.json', data: Buffer.from(JSON.stringify(pageMap, null, 2), 'utf-8') });

  return dedupeFiles(zipFiles);
}

// ─── BACKEND / DB PROBES ──────────────────────────────────────────────────────
async function probeBackend(startUrl) {
  const origin = getOrigin(startUrl); const results = [];
  await Promise.allSettled(BACKEND_PROBE_PATHS.map(async p => {
    const r = await quickFetch(origin + p);
    if (r.ok && r.status !== 404 && r.data?.length > 0) results.push({ url: origin+p, ...r });
  }));
  return results;
}

async function probeDatabase(startUrl) {
  const origin = getOrigin(startUrl); const results = [];
  await Promise.allSettled(DB_PROBE_PATHS.map(async p => {
    const r = await quickFetch(origin + p);
    if (r.ok && r.status !== 404 && r.data?.length > 0) results.push({ url: origin+p, path:p, ...r });
  }));
  return results;
}

function buildReportZip(hostname, backendResults, dbResults) {
  const zipFiles = [];
  let report = `# Backend Probe — ${hostname}\nDate: ${new Date().toISOString()}\n\n`;
  for (const r of backendResults) {
    const ct = r.headers?.['content-type'] || '';
    const isJson = ct.includes('json') || r.data?.trimStart().startsWith('{');
    report += `## [${r.status}] ${r.url}\nType: ${isJson?'JSON':'HTML/Other'} | Size: ${r.data?.length||0}b\n`;
    const ih = ['server','x-powered-by','content-type','x-frame-options'];
    if(r.headers) for(const h of ih) if(r.headers[h]) report+=`${h}: ${r.headers[h]}\n`;
    if(r.data) report+=`\n\`\`\`\n${r.data.slice(0,1500)}\n\`\`\`\n`;
    report += '\n---\n\n';
  }
  zipFiles.push({name:'reports/backend_api_report.md',data:Buffer.from(report,'utf-8')});

  let dbr = `# DB/Config Probe — ${hostname}\nDate: ${new Date().toISOString()}\n\n`;
  if(!dbResults.length){dbr+='✅ No exposed files found.\n';}
  else {
    dbr+=`⚠️ ${dbResults.length} exposed file(s):\n\n`;
    for(const r of dbResults){
      dbr+=`## ${r.path} [HTTP ${r.status}]\n${r.url}\nSize: ${r.data?.length||0}b\n`;
      if(r.data) dbr+=`\n\`\`\`\n${r.data.slice(0,2000)}\n\`\`\`\n`;
      dbr+='\n---\n\n';
      if(r.data) zipFiles.push({name:'exposed/'+r.path.replace(/[^a-z0-9._-]/gi,'_'),data:Buffer.from(r.data,'utf-8')});
    }
  }
  zipFiles.push({name:'reports/db_config_report.md',data:Buffer.from(dbr,'utf-8')});
  return dedupeFiles(zipFiles);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
async function handleScrape(sock, msg, args, extra, mode) {
  const rawUrl = args.join('').trim();
  if (!rawUrl) {
    return extra.reply(
      '🕷️ *Viper Deep Scraper*\n\n```\n' +
      '.scrape   <url>  — Deep clone (discovery + full structure)\n' +
      '.scrapefd <url>  — Frontend only (alias)\n' +
      '.scrapebd <url>  — Backend API probe → report ZIP\n' +
      '.scrapedb <url>  — DB/config exposure probe → report ZIP\n' +
      '.scrapeall <url> — EVERYTHING: frontend + backend + DB + stack\n' +
      '```\n\n' +
      '📡 _Phase 1: Discovery (sitemap + robots + WP API + JS routes)_\n' +
      '📦 _Phase 2: Deep crawl + exact structure ZIP_'
    );
  }

  const startUrl = normaliseUrl(rawUrl);
  if (!startUrl) return extra.reply('❌ Invalid URL. Example: `.scrape https://yoursite.com`');

  const origin   = getOrigin(startUrl);
  const hostname = new URL(startUrl).hostname.replace('www.','');
  const hasProxy = !!process.env.SCRAPERAPI_KEY;

  await extra.reply(
    `🕷️ *Deep Scraping* \`${hostname}\`\n\n\`\`\`\n` +
    `Mode   : ${mode.toUpperCase()}\n` +
    `Proxy  : ${hasProxy?'ScraperAPI ✅ + fallbacks':'allorigins / corsproxy / thingproxy / Direct'}\n` +
    `Limits : ${MAX_PAGES} pages · ${MAX_ASSETS} assets\n` +
    `\`\`\`\n` +
    `⏳ *Phase 1* — Discovering all pages (sitemap, robots, JS routes)...\n` +
    `_This may take 60–180s for large sites_`
  );

  try {
    let zipBuf, zipName, caption;

    if (mode === 'fd' || mode === 'fd0') {
      // Phase 1: Discover
      const { discovered } = await discoverAllPages(startUrl);
      await extra.reply(`✅ *Discovery complete!* Found ${discovered.size} URLs\n⏳ *Phase 2* — Deep crawling all pages...`);

      // Phase 2: Deep crawl
      const crawl = await deepCrawl(startUrl, discovered);
      if (!crawl.htmlPages.length) return extra.reply('❌ Could not fetch any pages.\n```\nSite may block bots. Try .scrapeall.\n```');

      const files = await buildFrontendZip(crawl, false);
      zipBuf  = buildZip(files);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_clone.zip`;
      const cssCnt = files.filter(f=>f.name.endsWith('.css')).length;
      const jsCnt  = files.filter(f=>f.name.endsWith('.js')).length;
      const imgCnt = files.filter(f=>/\.(png|jpe?g|gif|svg|webp|ico|avif)$/i.test(f.name)).length;
      caption =
        `🕷️ *${hostname} — Deep Clone*\n\n\`\`\`\n` +
        `Pages discovered : ${[...crawl.allCss,...crawl.allJs].length > 0 ? crawl.htmlPages.length : crawl.htmlPages.length}\n` +
        `HTML pages       : ${crawl.htmlPages.length}\n` +
        `CSS files        : ${cssCnt}\n` +
        `JS files         : ${jsCnt}\n` +
        `Images           : ${imgCnt}\n` +
        `Fonts            : ${files.filter(f=>/\.(woff2?|ttf|eot)$/i.test(f.name)).length}\n` +
        `Total in ZIP     : ${files.length} files\n` +
        `ZIP size         : ${(zipBuf.length/1024).toFixed(1)} KB\n` +
        `Proxy used       : ${crawl.usedProxy}\n` +
        `\`\`\`\n📁 _Exact structure. Open index.html with Live Server._\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    else if (mode === 'bd') {
      const backendResults = await probeBackend(startUrl);
      if (!backendResults.length) return extra.reply(`🔍 *${hostname}*\n\`\`\`\nNo accessible endpoints found.\n\`\`\``);
      const files = buildReportZip(hostname, backendResults, []);
      zipBuf = buildZip(files); zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_backend.zip`;
      caption = `🔍 *${hostname} — Backend*\n\`\`\`\nEndpoints: ${backendResults.length}\nJSON: ${backendResults.filter(r=>{ const ct=r.headers?.['content-type']||''; return ct.includes('json')||r.data?.trimStart().startsWith('{'); }).length}\nSize: ${(zipBuf.length/1024).toFixed(1)} KB\n\`\`\`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    else if (mode === 'db') {
      const dbResults = await probeDatabase(startUrl);
      const files = buildReportZip(hostname, [], dbResults);
      zipBuf = buildZip(files); zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_db_probe.zip`;
      caption = `🗄️ *${hostname} — DB/Config*\n\`\`\`\nPaths tested: ${DB_PROBE_PATHS.length}\nExposed: ${dbResults.length}\nSize: ${(zipBuf.length/1024).toFixed(1)} KB\n\`\`\`\n${dbResults.length?'⚠️ *Exposed files found!*':'✅ Nothing exposed.'}\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    else if (mode === 'all') {
      // Phase 1: Discover pages
      const { discovered } = await discoverAllPages(startUrl);
      await extra.reply(`✅ *Discovery:* ${discovered.size} URLs found\n⏳ *Phase 2* — Deep crawl + backend + DB probes running in parallel...`);

      // Phase 2: All probes in parallel
      const [crawl, backendResults, dbResults] = await Promise.all([
        deepCrawl(startUrl, discovered),
        probeBackend(startUrl),
        probeDatabase(startUrl),
      ]);

      const allFiles = [];

      // Frontend files at root (exact structure)
      if (crawl.htmlPages.length > 0) {
        const fdFiles = await buildFrontendZip(crawl, true);
        fdFiles.forEach(f => allFiles.push(f));
      }

      // Backend + DB reports
      const bdFiles = buildReportZip(hostname, backendResults, dbResults);
      bdFiles.forEach(f => allFiles.push({ name: '_reports/' + f.name, data: f.data }));

      // Tech stack
      const mainHtml = crawl.htmlPages[0]?.html || '';
      const mainHeaders = crawl.htmlPages[0]?.headers || {};
      const stack    = detectTechStack(mainHtml, mainHeaders, crawl.allJs, crawl.allCss);
      const stackTxt = formatTechStack(stack);

      const stackReport =
        `# Tech Stack Report — ${hostname}\nDate: ${new Date().toISOString()}\n\n` +
        `## Detected Technologies\n\n${stackTxt}\n\n` +
        `## Discovery Stats\n` +
        `- Pages crawled: ${crawl.htmlPages.length}\n` +
        `- CSS files: ${[...crawl.allCss].length}\n` +
        `- JS files: ${[...crawl.allJs].length}\n` +
        `- Images: ${[...crawl.allImages].length}\n` +
        `- Cross-origin assets: ${[...crawl.crossOriginAssets].length}\n` +
        `- Backend endpoints: ${backendResults.length}\n` +
        `- Exposed configs: ${dbResults.length}\n\n` +
        `## All Page URLs\n${crawl.htmlPages.map(p=>`- ${p.url}`).join('\n')||'none'}\n\n` +
        `## All CSS URLs\n${[...crawl.allCss].map(u=>`- ${u}`).join('\n')||'none'}\n\n` +
        `## All JS URLs\n${[...crawl.allJs].map(u=>`- ${u}`).join('\n')||'none'}\n\n` +
        `## API Endpoints\n${backendResults.map(r=>`- [${r.status}] ${r.url}`).join('\n')||'none'}\n`;

      allFiles.push({ name: '_reports/TECH_STACK.md', data: Buffer.from(stackReport,'utf-8') });

      const deduped = dedupeFiles(allFiles);
      zipBuf = buildZip(deduped); zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_full.zip`;
      caption =
        `🌐 *${hostname} — Full Deep Scrape*\n\n\`\`\`\n` +
        `Pages crawled  : ${crawl.htmlPages.length}\n` +
        `CSS files      : ${[...crawl.allCss].length}\n` +
        `JS files       : ${[...crawl.allJs].length}\n` +
        `Images         : ${[...crawl.allImages].length}\n` +
        `Cross-origin   : ${[...crawl.crossOriginAssets].length} assets\n` +
        `API endpoints  : ${backendResults.length}\n` +
        `Exposed configs: ${dbResults.length}\n` +
        `Total files    : ${deduped.length}\n` +
        `ZIP size       : ${(zipBuf.length/1024).toFixed(1)} KB\n` +
        `\`\`\`\n🔬 *Tech Stack:*\n\`\`\`\n${stackTxt}\n\`\`\`\n\n` +
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
  { name:'scrape',    aliases:['scrapeweb','clonesite','webscrape','dlsite'],       category:'developer', description:'Deep clone website (discovery + exact structure) → ZIP', usage:'.scrape <url>',    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'fd0'); } },
  { name:'scrapefd',  aliases:['scrapefrontend','scrapefront'],                     category:'developer', description:'Frontend deep clone → ZIP', usage:'.scrapefd <url>',                               async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'fd'); } },
  { name:'scrapebd',  aliases:['scrapebackend','scrapeback','apiprobe'],            category:'developer', description:'Backend probe — APIs, JSON, headers → ZIP report', usage:'.scrapebd <url>',        async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'bd'); } },
  { name:'scrapedb',  aliases:['scrapeconfig','dbprobe','envprobe'],                category:'developer', description:'Probe exposed .env, DB dumps, configs, phpinfo → ZIP', usage:'.scrapedb <url>',   async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'db'); } },
  { name:'scrapeall', aliases:['fullscrape','clonesiteful','scrapefull','deepscrape'],category:'developer', description:'FULL: frontend + backend + DB probe + tech stack → ZIP', usage:'.scrapeall <url>', async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'all'); } },
];
