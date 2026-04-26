/**
 * ᴅᴇᴠᴇʟᴏᴘᴇʀ ᴛᴏᴏʟꜱ ᴍᴇɴᴜ — VIPER BOT MD
 * 35 tools — all live. Type .devhelp <cmd> for usage.
 */

const config   = require('../../config');
const database = require('../../database');
const { sc }  = require('../../utils/categoryMenu');
const path    = require('path');
const fs      = require('fs');

// ── Developer tools master list ────────────────
const DEV_TOOLS = [
  { name:'scrape',      icon:'🕷️',  desc:'Scrape text from any webpage',                  usage:'.scrape <url>'                   },
  { name:'whois',       icon:'🔍',  desc:'WHOIS lookup for a domain',                     usage:'.whois <domain>'                 },
  { name:'dns',         icon:'🌐',  desc:'DNS records (A / MX / TXT / CNAME / NS)',       usage:'.dns <domain> [type]'            },
  { name:'ipinfo',      icon:'🗺️',  desc:'IP geolocation + ASN info',                    usage:'.ipinfo <ip>'                    },
  { name:'headers',     icon:'📋',  desc:'HTTP response headers of a URL',                usage:'.headers <url>'                  },
  { name:'webstatus',   icon:'📡',  desc:'Is a website up or down?',                      usage:'.webstatus <url>'                },
  { name:'ssl',         icon:'🔒',  desc:'SSL cert details + expiry date',                usage:'.ssl <domain>'                   },
  { name:'jwt',         icon:'🪙',  desc:'Decode & inspect a JWT token',                  usage:'.jwt <token>'                    },
  { name:'b64',         icon:'🔤',  desc:'Base64 encode / decode',                        usage:'.b64 encode|decode <text>'       },
  { name:'hash',        icon:'#️⃣', desc:'MD5 / SHA1 / SHA256 / SHA512 hash',             usage:'.hash <algo> <text>'             },
  { name:'jsonformat',  icon:'📄',  desc:'Validate & pretty-print JSON',                  usage:'.jsonformat <json>'              },
  { name:'regex',       icon:'🧩',  desc:'Test a regex pattern vs a string',              usage:'.regex <pattern> | <string>'     },
  { name:'portscan',    icon:'🔌',  desc:'Scan common ports on a host',                   usage:'.portscan <host>'                },
  { name:'netping',     icon:'🏓',  desc:'Ping latency to a host',                        usage:'.netping <host>'                 },
  { name:'curl',        icon:'📨',  desc:'Make a GET/POST HTTP request',                  usage:'.curl <url> [method] [body]'     },
  { name:'hosting',     icon:'🏠',  desc:'Hosting provider lookup',                       usage:'.hosting <domain>'               },
  { name:'pageinfo',    icon:'🗒️', desc:'Extract title, description, OG tags',          usage:'.pageinfo <url>'                 },
  { name:'robots',      icon:'🤖',  desc:'Fetch robots.txt for a domain',                 usage:'.robots <domain>'                },
  { name:'sitemap',     icon:'🗺️',  desc:'List sitemap.xml URLs from a domain',          usage:'.sitemap <domain>'               },
  { name:'techstack',   icon:'🧱',  desc:'Detect CMS / framework / CDN on a site',       usage:'.techstack <url>'                },
  { name:'urlshort',    icon:'🔗',  desc:'Shorten a URL via is.gd',                       usage:'.urlshort <url>'                 },
  { name:'qrgen',       icon:'⬛',  desc:'Generate a QR code image',                      usage:'.qrgen <text>'                   },
  { name:'urlencode',   icon:'🔏',  desc:'URL-encode / URL-decode a string',              usage:'.urlencode encode|decode <text>' },
  { name:'colorconvert',icon:'🎨',  desc:'HEX ↔ RGB ↔ HSL colour converter',             usage:'.colorconvert #hex | rgb()'      },
  { name:'minify',      icon:'📦',  desc:'Minify HTML / CSS / JS code',                   usage:'.minify html|css|js <code>'      },
  { name:'timestamp',   icon:'⏱️',  desc:'Unix timestamp ↔ human date',                  usage:'.timestamp <unix|date>'          },
  { name:'uuid',        icon:'🆔',  desc:'Generate random UUID v4 strings',               usage:'.uuid [count]'                   },
  { name:'passgen',     icon:'🛡️',  desc:'Generate a strong random password',             usage:'.passgen [length]'               },
  { name:'cron',        icon:'🕰️',  desc:'Explain a cron expression in plain English',    usage:'.cron <expression>'              },
  { name:'myip',        icon:'🌍',  desc:"Bot server's public IP address",                usage:'.myip'                           },
  { name:'apitest',     icon:'🧪',  desc:'Test a REST endpoint (method + body)',          usage:'.apitest <url> [method] [body]'  },
  { name:'domainavail', icon:'✅',  desc:'Check if a domain is available',                usage:'.domainavail <name.tld>'         },
  { name:'subdomains',  icon:'🌲',  desc:'Find subdomains via crt.sh cert logs',          usage:'.subdomains <domain>'            },
  { name:'coderun',     icon:'▶️',  desc:'Run Python/JS/Bash in a sandbox',               usage:'.coderun <lang> <code>'          },
  { name:'lorem',       icon:'📝',  desc:'Generate Lorem Ipsum placeholder text',         usage:'.lorem [paragraphs]'             },
];

module.exports = {
  name: 'lab',
  aliases: ['lab', 'developer', 'dev', 'devtools', 'devmenu'],
  category: 'developer',
  description: 'Viper Lab — developer tools menu',
  usage: '.lab',

  async execute(sock, msg, args, extra) {
    try {
      let t = `┏❐ 《 *💻 ${sc('viper lab')} ᴍᴇɴᴜ* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🔢 ${sc('total')}: *${DEV_TOOLS.length} tools*\n`;
      t += `┣◆ ⚡ ${sc('prefix')}: *${config.prefix}*\n`;
      t += `┃\n`;

      DEV_TOOLS.forEach(tool => {
        t += `┣◆ ${tool.icon} *${config.prefix}${tool.name}*\n`;
        t += `┃    ${sc(tool.desc)}\n`;
      });

      t += `┃\n`;
      t += `┣◆ 💡 ${sc('type')} *${config.prefix}devhelp <cmd>* ${sc('for usage info')}\n`;
      t += `┗❐\n`;
      t += `\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      const imgCandidates = [
        path.join(__dirname, '../../utils/bot_image.jpg'),
        path.join(__dirname, '../utils/bot_image.jpg'),
        path.resolve(process.cwd(), 'utils/bot_image.jpg'),
      ];
      const imgPath = imgCandidates.find(p => fs.existsSync(p)) || null;
      const ctx = {
        contextInfo: {
          forwardingScore: 1, isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: database.getSetting('newsletterJid', config.newsletterJid),
            newsletterName: database.getSetting('botName', config.botName),
            serverMessageId: -1,
          },
        },
      };

      if (imgPath) {
        await sock.sendMessage(extra.from,
          { image: fs.readFileSync(imgPath), caption: t, ...ctx },
          { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, { text: t }, { quoted: msg });
      }
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
