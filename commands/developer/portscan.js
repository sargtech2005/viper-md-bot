/**
 * .portscan <host>  (VIPER BOT MD)
 * TCP connect scan on common ports — no root needed.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const net    = require('net');

const COMMON_PORTS = [
  { port: 21,   name: 'FTP'       },
  { port: 22,   name: 'SSH'       },
  { port: 23,   name: 'Telnet'    },
  { port: 25,   name: 'SMTP'      },
  { port: 53,   name: 'DNS'       },
  { port: 80,   name: 'HTTP'      },
  { port: 110,  name: 'POP3'      },
  { port: 143,  name: 'IMAP'      },
  { port: 443,  name: 'HTTPS'     },
  { port: 465,  name: 'SMTPS'     },
  { port: 587,  name: 'SMTP/TLS'  },
  { port: 993,  name: 'IMAPS'     },
  { port: 995,  name: 'POP3S'     },
  { port: 1433, name: 'MSSQL'     },
  { port: 3000, name: 'Node/Dev'  },
  { port: 3306, name: 'MySQL'     },
  { port: 5432, name: 'PostgreSQL'},
  { port: 6379, name: 'Redis'     },
  { port: 8080, name: 'HTTP-Alt'  },
  { port: 8443, name: 'HTTPS-Alt' },
  { port: 27017,name: 'MongoDB'   },
];

function probePort(host, port, timeout = 2500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeout);
    s.on('connect', () => { s.destroy(); resolve(true);  });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error',   () => { s.destroy(); resolve(false); });
    s.connect(port, host);
  });
}

module.exports = {
  name: 'portscan',
  aliases: ['scan', 'ports', 'openports'],
  category: 'developer',
  description: 'Scan common ports on a host (TCP connect scan)',
  usage: '.portscan <host>',

  async execute(sock, msg, args, extra) {
    let host = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!host) return extra.reply(
      `🔌 Give me a host!\nUsage: *.portscan <host>*\nExample: *.portscan google.com*\n\n⚠️ _Only scan hosts you own or have permission to scan._`
    );

    await extra.reply(
      `🔌 Scanning *${host}* (${COMMON_PORTS.length} ports)...\n_This may take ~10 seconds_`
    );

    try {
      // Run probes with max 6 concurrent to avoid overwhelming shared hosting
      const CONCURRENCY = 6;
      const results = new Array(COMMON_PORTS.length).fill(null);

      for (let i = 0; i < COMMON_PORTS.length; i += CONCURRENCY) {
        const batch = COMMON_PORTS.slice(i, i + CONCURRENCY).map((p, j) =>
          probePort(host, p.port).then(open => { results[i + j] = open; })
        );
        await Promise.all(batch);
      }

      const open   = COMMON_PORTS.filter((p, i) => results[i]);
      const closed = COMMON_PORTS.filter((p, i) => !results[i]);

      let t = `┏❐ 《 *🔌 ${sc('port scan')} — ${host}* 》 ❐\n`;
      t += `┃  Scanned ${COMMON_PORTS.length} common ports\n┃\n`;

      if (open.length === 0) {
        t += `┣◆ 🔒 All scanned ports are *closed / filtered*\n`;
        t += `┃   _(Host may have a firewall or be offline)_\n`;
      } else {
        t += `┣◆ 🟢 *Open ports (${open.length}):*\n`;
        open.forEach(p => {
          t += `┃    ✦ \`${String(p.port).padEnd(5)}\` ${p.name}\n`;
        });
        t += `┃\n`;
        t += `┣◆ 🔴 *Closed / filtered (${closed.length})*: `;
        t += closed.map(p => p.port).join(', ') + '\n';
      }

      t += `┗❐\n\n`;
      t += `> ⚠️ _TCP connect scan only — not a full security audit_\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Port scan failed: \`${e.message}\``);
    }
  },
};
