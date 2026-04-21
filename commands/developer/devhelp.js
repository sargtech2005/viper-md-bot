/**
 * .devhelp — show usage for a specific dev tool
 */
const config = require('../../config');
const { sc }  = require('../../utils/categoryMenu');

const TOOLS = {
  scrape:       { icon:'🕷️',  desc:'Scrape visible text from any public webpage',               usage:'.scrape <url>',                     example:'.scrape https://example.com',           status:'✅ Live' },
  whois:        { icon:'🔍',  desc:'WHOIS registration data for a domain',                       usage:'.whois <domain>',                   example:'.whois google.com',                     status:'✅ Live' },
  dns:          { icon:'🌐',  desc:'Query DNS records — A, AAAA, MX, TXT, CNAME, NS',           usage:'.dns <domain> [type]',              example:'.dns cloudflare.com MX',                status:'✅ Live' },
  ipinfo:       { icon:'🗺️', desc:'Geolocation, ISP, org, timezone for an IP address',         usage:'.ipinfo <ip>',                      example:'.ipinfo 8.8.8.8',                       status:'✅ Live' },
  headers:      { icon:'📋',  desc:'Show full HTTP response headers for a URL',                  usage:'.headers <url>',                    example:'.headers https://github.com',           status:'✅ Live' },
  webstatus:    { icon:'📡',  desc:'Check if a site is online and measure response time',        usage:'.webstatus <url>',                  example:'.webstatus https://youtube.com',        status:'✅ Live' },
  ssl:          { icon:'🔒',  desc:'Show SSL/TLS certificate details, issuer, and expiry',       usage:'.ssl <domain>',                     example:'.ssl github.com',                       status:'✅ Live' },
  jwt:          { icon:'🪙',  desc:'Decode a JWT — shows header, payload (no secret needed)',    usage:'.jwt <token>',                      example:'.jwt eyJhbGciOiJIUzI1NiJ9...',          status:'✅ Live' },
  b64:          { icon:'🔤',  desc:'Base64 encode or decode any string',                         usage:'.b64 encode|decode <text>',         example:'.b64 encode Hello World',               status:'✅ Live' },
  hash:         { icon:'#️⃣', desc:'Generate cryptographic hash of text',                       usage:'.hash <algo> <text>',               example:'.hash sha256 password123',              status:'✅ Live' },
  jsonformat:   { icon:'📄',  desc:'Validate and pretty-print a JSON string',                    usage:'.jsonformat <json>',                example:'.jsonformat {"a":1,"b":2}',             status:'✅ Live' },
  regex:        { icon:'🧩',  desc:'Test a regex pattern against a string',                      usage:'.regex <pattern> | <test-string>', example:'.regex ^\\d+ | 12345',                  status:'✅ Live' },
  portscan:     { icon:'🔌',  desc:'Scan well-known ports on a host (80, 443, 22, 21…)',         usage:'.portscan <host>',                  example:'.portscan scanme.nmap.org',             status:'✅ Live' },
  netping:      { icon:'🏓',  desc:'ICMP/TCP ping to measure latency to any host',               usage:'.netping <host>',                   example:'.netping 1.1.1.1',                      status:'✅ Live' },
  curl:         { icon:'📨',  desc:'Make a raw HTTP request and see status + body',              usage:'.curl <url> [GET|POST] [body]',     example:'.curl https://api.github.com GET',      status:'✅ Live' },
  hosting:      { icon:'🏠',  desc:'Find hosting provider / server info for a domain',           usage:'.hosting <domain>',                 example:'.hosting netflix.com',                  status:'✅ Live' },
  pageinfo:     { icon:'🗒️', desc:'Extract meta title, description, OG image, keywords',       usage:'.pageinfo <url>',                   example:'.pageinfo https://twitter.com',         status:'✅ Live' },
  robots:       { icon:'🤖',  desc:'Download and display robots.txt from any domain',            usage:'.robots <domain>',                  example:'.robots amazon.com',                    status:'✅ Live' },
  sitemap:      { icon:'🗺️', desc:'List all URLs from sitemap.xml',                            usage:'.sitemap <domain>',                 example:'.sitemap bbc.com',                      status:'✅ Live' },
  techstack:    { icon:'🧱',  desc:'Detect CMS, framework, server, CDN, analytics on a site',   usage:'.techstack <url>',                  example:'.techstack https://wordpress.com',      status:'✅ Live' },
  urlshort:     { icon:'🔗',  desc:'Shorten a URL via is.gd (free, no account needed)',          usage:'.urlshort <url>',                   example:'.urlshort https://very-long-url.com',   status:'✅ Live' },
  qrgen:        { icon:'⬛',  desc:'Generate a QR code image from text or URL',                  usage:'.qrgen <text>',                     example:'.qrgen https://github.com',             status:'✅ Live' },
  urlencode:    { icon:'🔏',  desc:'Percent-encode or decode URL components',                    usage:'.urlencode encode|decode <text>',   example:'.urlencode encode hello world!',        status:'✅ Live' },
  colorconvert: { icon:'🎨',  desc:'Convert colours between HEX, RGB, and HSL',                 usage:'.colorconvert #hex | rgb(r,g,b)',   example:'.colorconvert #7C6AF7',                 status:'✅ Live' },
  minify:       { icon:'📦',  desc:'Minify HTML, CSS, or JS to reduce file size',               usage:'.minify html|css|js <code>',        example:'.minify css .a { color: red; }',        status:'✅ Live' },
  timestamp:    { icon:'⏱️',  desc:'Convert Unix timestamps to dates and back',                  usage:'.timestamp <unix|date>',            example:'.timestamp 1700000000',                 status:'✅ Live' },
  uuid:         { icon:'🆔',  desc:'Generate cryptographically random UUID v4 strings',          usage:'.uuid [count]',                     example:'.uuid 5',                               status:'✅ Live' },
  passgen:      { icon:'🛡️',  desc:'Generate a strong password with custom length',              usage:'.passgen [length] [symbols]',       example:'.passgen 20 true',                      status:'✅ Live' },
  cron:         { icon:'🕰️',  desc:'Human-readable explanation of a cron expression',           usage:'.cron <expression>',                example:'.cron 0 */6 * * *',                     status:'✅ Live' },
  myip:         { icon:'🌍',  desc:"Show bot server's public IP and location",                   usage:'.myip',                             example:'.myip',                                 status:'✅ Live' },
  apitest:      { icon:'🧪',  desc:'Test any REST endpoint with custom method + JSON body',      usage:'.apitest <url> [method] [body]',    example:'.apitest https://api.example.com POST {}',status:'✅ Live' },
  domainavail:  { icon:'✅',  desc:'Check domain registration availability via RDAP',            usage:'.domainavail <name.tld>',           example:'.domainavail mycoolstartup.io',          status:'✅ Live' },
  subdomains:   { icon:'🌲',  desc:'Find known subdomains using crt.sh CT logs',                 usage:'.subdomains <domain>',              example:'.subdomains google.com',                status:'✅ Live' },
  coderun:      { icon:'▶️',  desc:'Execute Python / JS / Bash via a safe sandbox API',         usage:'.coderun <lang> <code>',            example:'.coderun python print("hi")',           status:'🔜 Soon' },
  lorem:        { icon:'📝',  desc:'Generate Lorem Ipsum filler text',                           usage:'.lorem [paragraphs]',               example:'.lorem 3',                              status:'✅ Live' },
};

module.exports = {
  name: 'devhelp',
  aliases: ['devinfo'],
  category: 'developer',
  description: 'Show help for a specific dev tool',
  usage: '.devhelp <toolname>',

  async execute(sock, msg, args, extra) {
    try {
      const query = args[0]?.toLowerCase().replace(/^\./, '');
      if (!query) {
        return extra.reply(
          `❓ *${sc('usage')}: .devhelp <toolname>*\n\nExample: .devhelp jwt\n\nType .developer to see all ${Object.keys(TOOLS).length} tools.`
        );
      }

      const tool = TOOLS[query];
      if (!tool) {
        return extra.reply(`❌ Unknown tool: *${query}*\n\n💡 Type *.developer* to see the full list.`);
      }

      let t = `${tool.icon} *${sc(query)} — ${sc('developer tool')}*\n\n`;
      t += `📝 *${sc('what it does')}:*\n${tool.desc}\n\n`;
      t += `⚡ *${sc('usage')}:*\n\`${tool.usage}\`\n\n`;
      t += `💡 *${sc('example')}:*\n\`${tool.example}\`\n\n`;
      t += `🏗️ *${sc('status')}:* ${tool.status}\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
