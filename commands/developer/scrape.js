/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  VIPER BOT MD — Website Scraper Suite                                       ║
 * ║                                                                              ║
 * ║  .scrape   <url>  → Frontend scrape (HTML + CSS + JS + images + fonts)      ║
 * ║  .scrapefd <url>  → Frontend only   (same as .scrape, explicit alias)       ║
 * ║  .scrapebd <url>  → Backend scrape  (APIs, JSON, headers, configs, robots)  ║
 * ║  .scrapedb <url>  → DB/Config probe (exposed files, dumps, env probes)      ║
 * ║  .scrapeall <url> → Full scrape     (everything + full tech stack report)   ║
 * ║                                                                              ║
 * ║  Free proxy fallback chain (no API keys required):                          ║
 * ║    1. ScraperAPI (if SCRAPERAPI_KEY in .env)                                ║
 * ║    2. allorigins.win                                                         ║
 * ║    3. corsproxy.io                                                           ║
 * ║    4. thingproxy.freeboard.io                                                ║
 * ║    5. Direct HTTP fetch                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios  = require('axios');
const zlib   = require('zlib');
const path   = require('path');
const config = require('../../config');

// ─── GLOBAL LIMITS ────────────────────────────────────────────────────────────
const MAX_PAGES      = 80;
const MAX_ASSETS     = 250;
const MAX_ZIP_MB     = 24;
const FETCH_TIMEOUT  = 30000;
const CRAWL_DELAY_MS = 300;
const USER_AGENT     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const BACKEND_PROBE_PATHS = [
  '/api','/api/v1','/api/v2','/api/health','/api/status','/api/config',
  '/api/users','/api/products','/api/data','/api/info',
  '/graphql','/graphiql','/swagger','/swagger-ui','/swagger.json',
  '/openapi.json','/api-docs','/api-docs.json',
  '/health','/status','/ping','/version',
  '/server-info','/info','/debug',
  '/.well-known/openid-configuration','/.well-known/security.txt',
  '/security.txt',
];

const DB_PROBE_PATHS = [
  '/.env','/.env.bak','/.env.local','/.env.production','/.env.example',
  '/config.php','/config.js','/config.json','/configuration.php',
  '/settings.php','/settings.json','/wp-config.php','/wp-config.bak',
  '/database.php','/db.php','/db.json','/connection.php',
  '/backup.sql','/dump.sql','/database.sql','/db.sql','/backup.zip',
  '/.git/config','/.git/HEAD','/.gitignore','/.htaccess',
  '/phpinfo.php','/info.php','/test.php','/debug.php',
  '/admin','/admin/config','/admin/env','/admin/debug',
  '/server-status','/server-info',
  '/robots.txt','/sitemap.xml','/sitemap_index.xml',
  '/crossdomain.xml','/clientaccesspolicy.xml',
  '/package.json','/composer.json','/Gemfile','/requirements.txt',
  '/web.config','/nginx.conf','/apache2.conf','/httpd.conf',
];

// ─── FREE PROXY FALLBACK CHAIN ────────────────────────────────────────────────
async function fetchWithFallback(url, { binary = false } = {}) {
  const responseType = binary ? 'arraybuffer' : 'text';
  const headers = { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' };

  if (process.env.SCRAPERAPI_KEY) {
    try {
      const res = await axios.get('https://api.scraperapi.com/', {
        params: { api_key: process.env.SCRAPERAPI_KEY, url, render: 'true' },
        timeout: FETCH_TIMEOUT, responseType, headers, maxRedirects: 8,
        validateStatus: s => s < 400,
      });
      return { data: res.data, contentType: res.headers['content-type'] || '', proxy: 'ScraperAPI', statusCode: res.status, resHeaders: res.headers };
    } catch (_) {}
  }

  try {
    const encoded = encodeURIComponent(url);
    const res = await axios.get(`https://api.allorigins.win/raw?url=${encoded}`, {
      timeout: FETCH_TIMEOUT, responseType, headers, maxRedirects: 8,
      validateStatus: s => s < 500,
    });
    if (res.data && (typeof res.data === 'string' ? res.data.length > 20 : res.data.byteLength > 20)) {
      return { data: res.data, contentType: res.headers['content-type'] || '', proxy: 'allorigins.win', statusCode: 200, resHeaders: res.headers };
    }
  } catch (_) {}

  try {
    const res = await axios.get(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
      timeout: FETCH_TIMEOUT, responseType, headers, maxRedirects: 8,
      validateStatus: s => s < 500,
    });
    if (res.data && (typeof res.data === 'string' ? res.data.length > 20 : res.data.byteLength > 20)) {
      return { data: res.data, contentType: res.headers['content-type'] || '', proxy: 'corsproxy.io', statusCode: 200, resHeaders: res.headers };
    }
  } catch (_) {}

  try {
    const res = await axios.get(`https://thingproxy.freeboard.io/fetch/${url}`, {
      timeout: FETCH_TIMEOUT, responseType, headers, maxRedirects: 8,
      validateStatus: s => s < 500,
    });
    if (res.data && (typeof res.data === 'string' ? res.data.length > 20 : res.data.byteLength > 20)) {
      return { data: res.data, contentType: res.headers['content-type'] || '', proxy: 'thingproxy', statusCode: 200, resHeaders: res.headers };
    }
  } catch (_) {}

  const res = await axios.get(url, {
    timeout: FETCH_TIMEOUT, responseType, headers, maxRedirects: 8,
    validateStatus: s => s < 400,
  });
  return { data: res.data, contentType: res.headers['content-type'] || '', proxy: 'Direct', statusCode: res.status, resHeaders: res.headers };
}

async function probeUrl(targetUrl) {
  try {
    const res = await axios.get(targetUrl, {
      timeout: 12000,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 5,
      validateStatus: () => true,
    });
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const ct   = res.headers['content-type'] || '';
    return {
      url: targetUrl, status: res.status,
      body: body.slice(0, 8000), headers: res.headers,
      isJson: ct.includes('json') || body.trimStart().startsWith('{') || body.trimStart().startsWith('['),
      isHtml: ct.includes('html'), size: body.length,
    };
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
function urlToPath(origin, url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p.endsWith('/') || p === '') p += 'index.html';
    if (!/\.[a-zA-Z0-9]{1,6}$/.test(p)) p += '.html';
    return p.replace(/^\//, '').replace(/\.\./g, '_');
  } catch { return 'unknown/' + Date.now(); }
}

// ─── TECH STACK DETECTOR ──────────────────────────────────────────────────────
function detectTechStack(html, headers, allJs, allCss) {
  const stack = { frontend: [], backend: [], cms: [], analytics: [], ui: [], hosting: [], security: [], fonts: [], buildTool: [], database: [], language: [] };
  const h = html.toLowerCase();
  const hd = JSON.stringify(headers).toLowerCase();
  const jsUrls = [...allJs].join(' ').toLowerCase();
  const cssUrls = [...allCss].join(' ').toLowerCase();

  if (h.includes('react') || jsUrls.includes('react')) stack.frontend.push('React');
  if (h.includes('vue') || jsUrls.includes('vue')) stack.frontend.push('Vue.js');
  if (h.includes('angular') || jsUrls.includes('angular')) stack.frontend.push('Angular');
  if (h.includes('svelte') || jsUrls.includes('svelte')) stack.frontend.push('Svelte');
  if (jsUrls.includes('_next') || h.includes('__next')) stack.frontend.push('Next.js');
  if (jsUrls.includes('nuxt') || h.includes('__nuxt')) stack.frontend.push('Nuxt.js');
  if (jsUrls.includes('jquery') || h.includes('jquery')) stack.frontend.push('jQuery');

  if (cssUrls.includes('bootstrap') || h.includes('bootstrap')) stack.ui.push('Bootstrap');
  if (h.includes('tailwind') || cssUrls.includes('tailwind')) stack.ui.push('Tailwind CSS');
  if (h.includes('material') || h.includes('mui')) stack.ui.push('Material UI');
  if (h.includes('bulma')) stack.ui.push('Bulma');
  if (h.includes('ant-design') || h.includes('antd')) stack.ui.push('Ant Design');
  if (h.includes('chakra')) stack.ui.push('Chakra UI');
  if (h.includes('fontawesome') || h.includes('font-awesome')) stack.ui.push('Font Awesome Icons');

  if (h.includes('wp-content') || h.includes('wp-includes')) stack.cms.push('WordPress');
  if (h.includes('drupal')) stack.cms.push('Drupal');
  if (h.includes('joomla')) stack.cms.push('Joomla');
  if (h.includes('cdn.shopify') || h.includes('shopify')) stack.cms.push('Shopify');
  if (h.includes('wixsite') || h.includes('wix.com')) stack.cms.push('Wix');
  if (h.includes('squarespace')) stack.cms.push('Squarespace');
  if (h.includes('ghost')) stack.cms.push('Ghost');

  if (hd.includes('x-powered-by: php') || hd.includes('php')) stack.language.push('PHP');
  if (hd.includes('x-powered-by: express') || hd.includes('express')) stack.backend.push('Express.js');
  if (hd.includes('laravel')) stack.backend.push('Laravel');
  if (h.includes('csrfmiddlewaretoken') || hd.includes('django')) stack.backend.push('Django');
  if (hd.includes('flask')) stack.backend.push('Flask');
  if (hd.includes('ruby') || hd.includes('rails')) stack.backend.push('Ruby on Rails');
  if (hd.includes('asp.net') || hd.includes('x-aspnet')) stack.backend.push('ASP.NET');
  if (hd.includes('node')) stack.backend.push('Node.js');

  if (hd.includes('nginx')) stack.hosting.push('Nginx');
  if (hd.includes('apache')) stack.hosting.push('Apache');
  if (hd.includes('cloudflare')) stack.hosting.push('Cloudflare');
  if (hd.includes('vercel')) stack.hosting.push('Vercel');
  if (hd.includes('netlify')) stack.hosting.push('Netlify');
  if (hd.includes('heroku')) stack.hosting.push('Heroku');
  if (hd.includes('x-amz') || hd.includes('amazonaws')) stack.hosting.push('AWS');
  if (hd.includes('fly.io')) stack.hosting.push('Fly.io');
  if (hd.includes('render')) stack.hosting.push('Render.com');

  if (h.includes('googletagmanager') || h.includes('gtag')) stack.analytics.push('Google Analytics / GTM');
  if (h.includes('fbevents') || h.includes('facebook pixel')) stack.analytics.push('Facebook Pixel');
  if (h.includes('hotjar')) stack.analytics.push('Hotjar');
  if (h.includes('mixpanel')) stack.analytics.push('Mixpanel');
  if (h.includes('plausible')) stack.analytics.push('Plausible');

  if (hd.includes('content-security-policy')) stack.security.push('CSP Header');
  if (hd.includes('strict-transport-security')) stack.security.push('HSTS');
  if (hd.includes('x-frame-options')) stack.security.push('X-Frame-Options');
  if (h.includes('recaptcha')) stack.security.push('reCAPTCHA');
  if (h.includes('turnstile')) stack.security.push('Cloudflare Turnstile');

  if (h.includes('fonts.googleapis')) stack.fonts.push('Google Fonts');
  if (h.includes('typekit')) stack.fonts.push('Adobe Fonts');
  if (h.includes('bunny.net/fonts')) stack.fonts.push('Bunny Fonts');

  if (h.includes('__webpack') || jsUrls.includes('webpack')) stack.buildTool.push('Webpack');
  if (h.includes('/@vite/') || jsUrls.includes('vite')) stack.buildTool.push('Vite');

  if (h.includes('firebase') || h.includes('firebaseapp')) stack.database.push('Firebase');
  if (h.includes('supabase')) stack.database.push('Supabase');
  if (h.includes('mongodb') || h.includes('mongoose')) stack.database.push('MongoDB');

  for (const k of Object.keys(stack)) stack[k] = [...new Set(stack[k])];
  return stack;
}

function formatTechStack(stack) {
  const labels = { frontend:'⚛️ Frontend', ui:'🎨 UI/CSS', backend:'🛠️ Backend', language:'🐘 Language', cms:'📝 CMS', database:'🗄️ Database', hosting:'☁️ Hosting', buildTool:'⚙️ Build Tool', analytics:'📊 Analytics', fonts:'🔤 Fonts', security:'🔒 Security' };
  return Object.entries(labels)
    .filter(([k]) => stack[k] && stack[k].length > 0)
    .map(([k, label]) => `${label}: ${stack[k].join(', ')}`)
    .join('\n') || '❔ No stack detected';
}

// ─── HTML LINK EXTRACTOR ──────────────────────────────────────────────────────
function* pullMatches(pattern, html, group = 1) {
  let m; const re = new RegExp(pattern.source, pattern.flags);
  while ((m = re.exec(html)) !== null) { const val = m[group]?.trim(); if (val) yield val; }
}

function extractLinks(html, baseUrl) {
  const links = { pages: [], css: [], js: [], images: [], fonts: [] };
  const origin = getOrigin(baseUrl);
  const add = (arr, url) => { if (url && !arr.includes(url)) arr.push(url); };

  for (const href of pullMatches(/<a[^>]+href=["']([^"'#?][^"']*?)["']/gi, html)) {
    const abs = resolveUrl(baseUrl, href);
    if (abs && isSameOrigin(origin, abs)) add(links.pages, abs);
  }
  for (const href of pullMatches(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi, html)) add(links.css, resolveUrl(baseUrl, href));
  for (const href of pullMatches(/@import\s+["']([^"']+\.css[^"']*)["']/gi, html)) add(links.css, resolveUrl(baseUrl, href));
  for (const href of pullMatches(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi, html)) add(links.js, resolveUrl(baseUrl, href));
  for (const href of pullMatches(/<img[^>]+src=["']([^"']+)["']/gi, html)) {
    if (/\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(href)) add(links.images, resolveUrl(baseUrl, href));
  }
  const srcsets = html.match(/srcset=["']([^"']+)["']/gi) || [];
  for (const ss of srcsets) {
    ss.split(',').forEach(part => { const u = resolveUrl(baseUrl, part.trim().split(/\s+/)[0]); if (u) add(links.images, u); });
  }
  for (const href of pullMatches(/url\(["']?([^"')]+\.(?:woff2?|ttf|eot|otf)[^"')']*)["']?\)/gi, html)) {
    add(links.fonts, resolveUrl(baseUrl, href));
  }
  return links;
}

function extractInlineCode(html) {
  const scripts = []; const styles = []; let m;
  const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(html)) !== null) { if (m[1].trim().length > 10) scripts.push(m[1].trim()); }
  const styleRe = /<style(?:[^>]*)>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(html)) !== null) { if (m[1].trim().length > 5) styles.push(m[1].trim()); }
  return { scripts, styles };
}

// ─── MINI ZIP BUILDER ─────────────────────────────────────────────────────────
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n,0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n,0); return b; }
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let v = i; for (let j = 0; j < 8; j++) v = (v&1)?(0xEDB88320^(v>>>1)):(v>>>1); t[i]=v; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i=0;i<buf.length;i++) c=CRC_TABLE[(c^buf[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }

function buildZip(files) {
  const entries = []; let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const local = Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]), u16(20),u16(0),u16(8),u16(0),u16(0),
      u32(crc),u32(compressed.length),u32(raw.length),
      u16(nameBuf.length),u16(0),nameBuf,compressed,
    ]);
    entries.push({ nameBuf,crc,compressed,raw,offset,local });
    offset += local.length;
  }
  const centralDirs = entries.map(e => Buffer.concat([
    Buffer.from([0x50,0x4B,0x01,0x02]),
    u16(20),u16(20),u16(0),u16(8),u16(0),u16(0),
    u32(e.crc),u32(e.compressed.length),u32(e.raw.length),
    u16(e.nameBuf.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(e.offset),
    e.nameBuf,
  ]));
  const centralBuf = Buffer.concat(centralDirs);
  const eocd = Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),u16(0),u16(0),
    u16(entries.length),u16(entries.length),
    u32(centralBuf.length),u32(offset),u16(0),
  ]);
  return Buffer.concat([...entries.map(e=>e.local),centralBuf,eocd]);
}

function dedupeZipFiles(zipFiles) {
  const seen = new Map();
  return zipFiles.map(f => {
    if (!seen.has(f.name)) { seen.set(f.name,0); return f; }
    seen.set(f.name, seen.get(f.name)+1);
    const ext = path.extname(f.name);
    const base = f.name.slice(0,-ext.length||undefined);
    return { name:`${base}_${seen.get(f.name)}${ext}`, data:f.data };
  });
}

// ─── CRAWL ENGINES ────────────────────────────────────────────────────────────
async function crawlFrontend(startUrl) {
  const origin=getOrigin(startUrl), visited=new Set(), queue=[startUrl];
  const allCss=new Set(), allJs=new Set(), allImages=new Set(), allFonts=new Set();
  const htmlFiles=[]; let usedProxy='Direct';
  while (queue.length>0 && htmlFiles.length<MAX_PAGES) {
    const url=queue.shift();
    if (visited.has(url)) continue; visited.add(url);
    try {
      await new Promise(r=>setTimeout(r,CRAWL_DELAY_MS));
      const result=await fetchWithFallback(url);
      usedProxy=result.proxy;
      const html=result.data;
      if (typeof html!=='string'||html.length<10) continue;
      htmlFiles.push({url,html});
      const links=extractLinks(html,url);
      for (const p of links.pages) if (!visited.has(p)&&!queue.includes(p)) queue.push(p);
      links.css.forEach(u=>u&&allCss.add(u));
      links.js.forEach(u=>u&&allJs.add(u));
      links.images.forEach(u=>u&&allImages.add(u));
      links.fonts.forEach(u=>u&&allFonts.add(u));
    } catch(e){ console.log(`[Scrape FD] ${url} — ${e.message}`); }
  }
  return { htmlFiles, allCss, allJs, allImages, allFonts, usedProxy };
}

async function buildFrontendZip(origin, htmlFiles, allCss, allJs, allImages, allFonts, includeInline=false) {
  const zipFiles=[]; let zipBytes=0;
  for (const {url,html} of htmlFiles) {
    const buf=Buffer.from(html,'utf-8');
    zipFiles.push({name:urlToPath(origin,url),data:buf});
    zipBytes+=buf.length;
    if (includeInline) {
      const {scripts,styles}=extractInlineCode(html);
      scripts.forEach((s,i)=>{ const nm=urlToPath(origin,url).replace(/\.html$/,`_inline_${i}.js`); zipFiles.push({name:nm,data:Buffer.from(s,'utf-8')}); zipBytes+=s.length; });
      styles.forEach((s,i)=>{ const nm=urlToPath(origin,url).replace(/\.html$/,`_style_${i}.css`); zipFiles.push({name:nm,data:Buffer.from(s,'utf-8')}); zipBytes+=s.length; });
    }
  }
  let assetCount=0;
  for (const {set,binary} of [{set:allCss,binary:false},{set:allJs,binary:false},{set:allImages,binary:true},{set:allFonts,binary:true}]) {
    for (const assetUrl of set) {
      if (assetCount>=MAX_ASSETS||zipBytes>MAX_ZIP_MB*1024*1024) break;
      try {
        await new Promise(r=>setTimeout(r,180));
        const {data}=await fetchWithFallback(assetUrl,{binary});
        const buf=Buffer.isBuffer(data)?data:Buffer.from(data,binary?'binary':'utf-8');
        zipFiles.push({name:urlToPath(origin,assetUrl),data:buf});
        zipBytes+=buf.length; assetCount++;
      } catch {}
    }
  }
  return dedupeZipFiles(zipFiles);
}

async function probeBackend(startUrl) {
  const origin=getOrigin(startUrl); const results=[];
  await Promise.allSettled(BACKEND_PROBE_PATHS.map(async p=>{
    const r=await probeUrl(origin+p);
    if (r.status>0&&r.status!==404&&r.size>0) results.push(r);
  }));
  try { const base=await probeUrl(startUrl); if(base.status>0) results.unshift({...base,url:startUrl+' (root)'}); } catch {}
  return results;
}

async function probeDatabase(startUrl) {
  const origin=getOrigin(startUrl); const results=[];
  await Promise.allSettled(DB_PROBE_PATHS.map(async p=>{
    const r=await probeUrl(origin+p);
    if (r.status>0&&r.status!==404&&r.size>0) results.push({...r,path:p});
  }));
  return results;
}

function buildReportZip(hostname, backendResults, dbResults) {
  const zipFiles=[];
  let report=`# Backend Probe Report — ${hostname}\nGenerated: ${new Date().toISOString()}\n\n## API & Status Endpoints\n\n`;
  for (const r of backendResults) {
    report+=`### ${r.url}\nStatus: ${r.status} | Size: ${r.size} bytes | Type: ${r.isJson?'JSON':r.isHtml?'HTML':'Other'}\n`;
    const ih=['server','x-powered-by','content-type','x-frame-options','content-security-policy'];
    if(r.headers) for(const h of ih) if(r.headers[h]) report+=`${h}: ${r.headers[h]}\n`;
    if(r.body&&r.body.length>0) report+=`\nPreview:\n\`\`\`\n${r.body.slice(0,1500)}\n\`\`\`\n`;
    report+='\n---\n\n';
  }
  zipFiles.push({name:'backend_api_report.md',data:Buffer.from(report,'utf-8')});

  let dbReport=`# DB & Config Probe Report — ${hostname}\nGenerated: ${new Date().toISOString()}\n\n`;
  if(dbResults.length===0) { dbReport+='No exposed DB/config files found.\n'; }
  else {
    dbReport+=`⚠️ ${dbResults.length} potentially exposed file(s) found:\n\n`;
    for(const r of dbResults){
      dbReport+=`### ${r.path} (HTTP ${r.status})\nURL: ${r.url}\nSize: ${r.size} bytes\n`;
      if(r.body) dbReport+=`\nPreview:\n\`\`\`\n${r.body.slice(0,2000)}\n\`\`\`\n`;
      dbReport+='\n---\n\n';
      if(r.body&&r.body.length>0) zipFiles.push({name:'exposed'+r.path.replace(/[^a-z0-9._-]/gi,'_'),data:Buffer.from(r.body,'utf-8')});
    }
  }
  zipFiles.push({name:'db_config_probe_report.md',data:Buffer.from(dbReport,'utf-8')});
  return dedupeZipFiles(zipFiles);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
async function handleScrape(sock, msg, args, extra, mode) {
  const rawUrl = args.join('').trim();
  if (!rawUrl) {
    return extra.reply(
      '🕷️ *Viper Web Scraper Suite*\n\n```\n' +
      '.scrape <url>    — Frontend: HTML+CSS+JS+images+fonts\n' +
      '.scrapefd <url>  — Frontend only (explicit)\n' +
      '.scrapebd <url>  — Backend: APIs, JSON, headers, server info\n' +
      '.scrapedb <url>  — DB/Config: .env, sql dumps, phpinfo, .git\n' +
      '.scrapeall <url> — Full: frontend+backend+DB+tech stack\n' +
      '```\n\n' +
      '_Free proxy fallback — no API key needed_\n' +
      '_(allorigins.win → corsproxy.io → thingproxy → direct)_'
    );
  }

  const startUrl = normaliseUrl(rawUrl);
  if (!startUrl) return extra.reply('❌ Invalid URL.\nExample: `.scrapeall https://example.com`');

  const origin   = getOrigin(startUrl);
  const hostname = new URL(startUrl).hostname.replace('www.','');
  const hasProxy = !!process.env.SCRAPERAPI_KEY;
  const modeLabel = {fd0:'🕷️ Frontend',fd:'🕷️ Frontend',bd:'🔍 Backend Probe',db:'🗄️ DB/Config Probe',all:'🌐 Full Scrape'}[mode]||'🕷️ Scrape';

  await extra.reply(
    `${modeLabel}: \`${hostname}\`\n\n\`\`\`\n` +
    `Proxy  : ${hasProxy?'ScraperAPI ✅ + free fallbacks':'allorigins / corsproxy / thingproxy / Direct'}\n` +
    `Target : ${startUrl}\n` +
    `Mode   : ${mode.toUpperCase()}\n` +
    `Limits : ${MAX_PAGES} pages · ${MAX_ASSETS} assets · ${FETCH_TIMEOUT/1000}s timeout\n` +
    `\`\`\`\n_Please wait, this can take 30–120s..._`
  );

  try {
    let zipBuf, zipName, caption;

    if (mode==='fd'||mode==='fd0') {
      const { htmlFiles, allCss, allJs, allImages, allFonts, usedProxy } = await crawlFrontend(startUrl);
      if (htmlFiles.length===0) return extra.reply('❌ *Could not fetch any pages.*\n```\nSite may block bots. Try .scrapeall.\n```');
      const deduped = await buildFrontendZip(origin, htmlFiles, allCss, allJs, allImages, allFonts, false);
      zipBuf = buildZip(deduped);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_frontend.zip`;
      caption = `🕷️ *${hostname} — Frontend*\n\n\`\`\`\nPages  : ${htmlFiles.length}\nCSS    : ${deduped.filter(f=>f.name.endsWith('.css')).length}\nJS     : ${deduped.filter(f=>f.name.endsWith('.js')).length}\nImages : ${deduped.filter(f=>/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(f.name)).length}\nFonts  : ${deduped.filter(f=>/\.(woff2?|ttf|eot)$/i.test(f.name)).length}\nTotal  : ${deduped.length} files\nSize   : ${(zipBuf.length/1024).toFixed(1)} KB\nProxy  : ${usedProxy}\n\`\`\`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    else if (mode==='bd') {
      const backendResults = await probeBackend(startUrl);
      if (backendResults.length===0) return extra.reply(`🔍 *${hostname}*\n\`\`\`\nNo accessible API endpoints found.\n\`\`\``);
      const zipFiles = buildReportZip(hostname, backendResults, []);
      zipBuf = buildZip(zipFiles);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_backend.zip`;
      caption = `🔍 *${hostname} — Backend Probe*\n\n\`\`\`\nEndpoints found : ${backendResults.length}\nJSON endpoints  : ${backendResults.filter(r=>r.isJson).length}\nZIP size        : ${(zipBuf.length/1024).toFixed(1)} KB\n\`\`\`\n_Full API report inside ZIP_\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    else if (mode==='db') {
      const dbResults = await probeDatabase(startUrl);
      const zipFiles  = buildReportZip(hostname, [], dbResults);
      zipBuf = buildZip(zipFiles);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_db_probe.zip`;
      caption = `🗄️ *${hostname} — DB/Config Probe*\n\n\`\`\`\nPaths probed  : ${DB_PROBE_PATHS.length}\nExposed files : ${dbResults.length}\nZIP size      : ${(zipBuf.length/1024).toFixed(1)} KB\n\`\`\`\n${dbResults.length>0?'⚠️ *Exposed files found! Check ZIP.*':'✅ No exposed files detected.'}\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    else if (mode==='all') {
      const [frontendResult, backendResults, dbResults] = await Promise.all([
        crawlFrontend(startUrl), probeBackend(startUrl), probeDatabase(startUrl),
      ]);
      const { htmlFiles, allCss, allJs, allImages, allFonts, usedProxy } = frontendResult;
      const allZipFiles = [];

      if (htmlFiles.length>0) {
        const fdFiles = await buildFrontendZip(origin, htmlFiles, allCss, allJs, allImages, allFonts, true);
        fdFiles.forEach(f=>allZipFiles.push({name:'frontend/'+f.name,data:f.data}));
      }

      const bdFiles = buildReportZip(hostname, backendResults, dbResults);
      bdFiles.forEach(f=>allZipFiles.push({name:'backend/'+f.name,data:f.data}));

      const mainHtml = htmlFiles[0]?.html||'';
      const stack = detectTechStack(mainHtml, {}, allJs, allCss);
      const stackText = formatTechStack(stack);

      const stackReport =
        `# Tech Stack Report — ${hostname}\nGenerated: ${new Date().toISOString()}\n\n## Detected Technologies\n\n${stackText}\n\n` +
        `## Summary\n- Pages crawled: ${htmlFiles.length}\n- CSS files: ${[...allCss].length}\n- JS files: ${[...allJs].length}\n` +
        `- Images: ${[...allImages].length}\n- Fonts: ${[...allFonts].length}\n- Backend endpoints: ${backendResults.length}\n- Exposed configs: ${dbResults.length}\n\n` +
        `## CSS URLs\n${[...allCss].map(u=>`- ${u}`).join('\n')||'none'}\n\n## JS URLs\n${[...allJs].map(u=>`- ${u}`).join('\n')||'none'}\n\n` +
        `## API Endpoints\n${backendResults.map(r=>`- [${r.status}] ${r.url}`).join('\n')||'none'}\n`;

      allZipFiles.push({name:'TECH_STACK_REPORT.md',data:Buffer.from(stackReport,'utf-8')});
      const deduped = dedupeZipFiles(allZipFiles);
      zipBuf = buildZip(deduped);
      zipName = `${hostname.replace(/[^a-z0-9]/gi,'_')}_full_scrape.zip`;
      caption =
        `🌐 *${hostname} — Full Scrape*\n\n\`\`\`\n` +
        `Frontend pages : ${htmlFiles.length}\nCSS files      : ${[...allCss].length}\nJS files       : ${[...allJs].length}\n` +
        `Images         : ${[...allImages].length}\nAPI endpoints  : ${backendResults.length}\nExposed configs: ${dbResults.length}\n` +
        `Total files    : ${deduped.length}\nZIP size       : ${(zipBuf.length/1024).toFixed(1)} KB\nProxy used     : ${usedProxy}\n\`\`\`\n` +
        `🔬 *Tech Stack:*\n\`\`\`\n${stackText}\n\`\`\`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
    }

    await sock.sendMessage(extra.from, {
      document: zipBuf, fileName: zipName, mimetype: 'application/zip', caption,
    }, { quoted: msg });

  } catch(e) {
    console.error('[Scrape Error]', e);
    await extra.reply(`❌ Scrape failed: \`${e.message}\`\n\nTry a different mode or check the URL.`);
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = [
  {
    name:'scrape', aliases:['scrapeweb','clonesite','webscrape','dlsite'],
    category:'developer', description:'Scrape all frontend files (HTML/CSS/JS/images/fonts) → ZIP', usage:'.scrape <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'fd0'); },
  },
  {
    name:'scrapefd', aliases:['scrapefrontend','scrapefront'],
    category:'developer', description:'Frontend scrape only (HTML/CSS/JS/images/fonts) → ZIP', usage:'.scrapefd <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'fd'); },
  },
  {
    name:'scrapebd', aliases:['scrapebackend','scrapeback','apiprobe'],
    category:'developer', description:'Backend probe — APIs, JSON, headers, robots, sitemap → ZIP report', usage:'.scrapebd <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'bd'); },
  },
  {
    name:'scrapedb', aliases:['scrapeconfig','dbprobe','envprobe'],
    category:'developer', description:'Probe for exposed .env, DB dumps, configs, phpinfo → ZIP report', usage:'.scrapedb <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'db'); },
  },
  {
    name:'scrapeall', aliases:['fullscrape','clonesiteful','scrapefull'],
    category:'developer', description:'Full scrape: frontend + backend APIs + DB probe + full tech stack → ZIP', usage:'.scrapeall <url>',
    async execute(sock,msg,args,extra){ return handleScrape(sock,msg,args,extra,'all'); },
  },
];
