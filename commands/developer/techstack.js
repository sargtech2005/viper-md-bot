/**
 * .techstack <url>  (VIPER BOT MD)
 * Detects CMS, framework, CDN, server software via headers and HTML.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

const DETECTORS = [
  // CDN / Hosting
  { name:'Cloudflare',   cat:'CDN',       header: 'cf-ray' },
  { name:'Fastly',       cat:'CDN',       header: 'x-served-by' },
  { name:'AWS CloudFront',cat:'CDN',      header: 'x-amz-cf-id' },
  { name:'Vercel',       cat:'Hosting',   header: 'x-vercel-id' },
  { name:'Netlify',      cat:'Hosting',   header: 'x-nf-request-id' },
  { name:'GitHub Pages', cat:'Hosting',   header: 'x-github-request-id' },
  // Server
  { name:'nginx',        cat:'Server',    headerMatch: { server: /nginx/i } },
  { name:'Apache',       cat:'Server',    headerMatch: { server: /apache/i } },
  { name:'LiteSpeed',    cat:'Server',    headerMatch: { server: /litespeed/i } },
  { name:'Microsoft IIS',cat:'Server',    headerMatch: { server: /iis/i } },
  // Frameworks
  { name:'Next.js',      cat:'Framework', header: 'x-nextjs-cache' },
  { name:'Next.js',      cat:'Framework', headerMatch: { 'x-powered-by': /Next\.js/i } },
  { name:'Nuxt.js',      cat:'Framework', htmlPattern: /nuxt/i },
  { name:'Laravel',      cat:'Framework', headerMatch: { 'x-powered-by': /laravel/i } },
  { name:'Express.js',   cat:'Framework', headerMatch: { 'x-powered-by': /express/i } },
  { name:'Django',       cat:'Framework', headerMatch: { server: /django/i } },
  // CMS
  { name:'WordPress',    cat:'CMS',       htmlPattern: /wp-content|wp-json|wordpress/i },
  { name:'Drupal',       cat:'CMS',       htmlPattern: /drupal/i },
  { name:'Joomla',       cat:'CMS',       htmlPattern: /joomla/i },
  { name:'Ghost',        cat:'CMS',       htmlPattern: /ghost\.io|ghost-url/i },
  { name:'Shopify',      cat:'E-Commerce',htmlPattern: /shopify/i },
  { name:'WooCommerce',  cat:'E-Commerce',htmlPattern: /woocommerce/i },
  // Analytics
  { name:'Google Analytics',cat:'Analytics',htmlPattern: /gtag\(|google-analytics\.com|G-[A-Z0-9]{10}/i },
  { name:'Hotjar',       cat:'Analytics', htmlPattern: /hotjar/i },
  { name:'Mixpanel',     cat:'Analytics', htmlPattern: /mixpanel/i },
  // Languages
  { name:'PHP',          cat:'Language',  headerMatch: { 'x-powered-by': /php/i } },
  { name:'ASP.NET',      cat:'Language',  headerMatch: { 'x-powered-by': /asp\.net/i } },
  { name:'Ruby',         cat:'Language',  headerMatch: { 'x-powered-by': /ruby/i } },
];

module.exports = {
  name: 'techstack',
  aliases: ['tech', 'detect', 'wappalyzer', 'stackcheck'],
  category: 'developer',
  description: 'Detect tech stack: CMS, framework, CDN, server, analytics',
  usage: '.techstack <url>',

  async execute(sock, msg, args, extra) {
    let url = (args[0] || '').trim();
    if (!url) return extra.reply(`🧱 Give me a URL!\nUsage: *.techstack <url>*`);
    if (!url.startsWith('http')) url = 'https://' + url;

    await extra.reply(`🧱 Detecting tech stack for \`${url}\`...`);

    try {
      const res = await axios.get(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 ViperBotMD/2.7' },
        validateStatus: () => true,
        maxRedirects: 5,
        maxContentLength: 500000,
      });

      const headers = res.headers;
      const html    = typeof res.data === 'string' ? res.data : '';

      const found = new Map(); // name → cat

      for (const d of DETECTORS) {
        if (found.has(d.name)) continue;
        if (d.header && headers[d.header]) { found.set(d.name, d.cat); continue; }
        if (d.headerMatch) {
          const [hkey, re] = Object.entries(d.headerMatch)[0];
          if (headers[hkey] && re.test(headers[hkey])) { found.set(d.name, d.cat); continue; }
        }
        if (d.htmlPattern && d.htmlPattern.test(html.slice(0, 50000))) { found.set(d.name, d.cat); }
      }

      // Group by category
      const grouped = {};
      for (const [name, cat] of found) {
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(name);
      }

      const catIcons = {
        CDN: '🌐', Hosting: '🏠', Server: '🖥️', Framework: '⚙️',
        CMS: '📝', 'E-Commerce': '🛒', Analytics: '📊', Language: '💻',
      };

      let t = `┏❐ 《 *🧱 ${sc('tech stack')} — ${url.slice(0, 40)}* 》 ❐\n┃\n`;

      if (found.size === 0) {
        t += `┣◆ 😅 Nothing detected — site may use custom tech or block bots.\n`;
      } else {
        t += `┣◆ 🔍 *Detected ${found.size} technologies:*\n┃\n`;
        for (const [cat, names] of Object.entries(grouped)) {
          t += `┣◆ ${catIcons[cat] || '🔧'} *${cat}*\n`;
          names.forEach(n => { t += `┃    • ${n}\n`; });
        }
      }

      t += `┃\n┣◆ 🖥️ *Server*: \`${headers['server'] || '–'}\`\n`;
      t += `┣◆ ⚡ *X-Powered-By*: \`${headers['x-powered-by'] || '–'}\`\n`;
      t += `┗❐\n\n`;
      t += `> ⚠️ _Detection is heuristic — not 100% accurate_\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Tech stack detection failed: \`${e.message}\``);
    }
  },
};
