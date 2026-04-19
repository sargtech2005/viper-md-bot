/**
 * .netping <host> [port]  (VIPER BOT MD)
 * TCP connect-time ping. No root / ICMP needed.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const net    = require('net');

function tcpPing(host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sock  = new net.Socket();
    sock.setTimeout(timeout);
    sock.on('connect', () => {
      const ms = Date.now() - start;
      sock.destroy();
      resolve(ms);
    });
    sock.on('timeout', () => { sock.destroy(); reject(new Error('Timed out')); });
    sock.on('error',   (e) => { sock.destroy(); reject(e); });
    sock.connect(port, host);
  });
}

function pingBar(ms) {
  if (ms < 50)  return '🟢 Excellent';
  if (ms < 150) return '🟢 Good';
  if (ms < 300) return '🟡 Decent';
  if (ms < 600) return '🟡 Slow';
  return '🔴 Very slow';
}

module.exports = {
  name: 'netping',
  aliases: ['tcpping', 'pingh', 'hostping'],
  category: 'developer',
  description: 'TCP ping latency to a host (port 80 by default)',
  usage: '.netping <host> [port]',

  async execute(sock, msg, args, extra) {
    let host = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0];
    const port = parseInt(args[1] || '80');

    if (!host) return extra.reply(
      `🤦 Give me a host!\nUsage: *.netping <host> [port]*\nExample: *.netping google.com 443*`
    );

    await extra.reply(`🏓 Pinging *${host}:${port}*...`);

    try {
      // 3 rounds
      const rounds = [];
      for (let i = 0; i < 3; i++) {
        try {
          rounds.push(await tcpPing(host, port));
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          rounds.push(null);
        }
      }

      const valid = rounds.filter(v => v !== null);
      if (valid.length === 0) {
        return extra.reply(`🔴 *${host}:${port}* is unreachable or the port is closed.`);
      }

      const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
      const min = Math.min(...valid);
      const max = Math.max(...valid);

      let t = `┏❐ 《 *🏓 ${sc('net ping')} — ${host}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *Host*: \`${host}\`\n`;
      t += `┣◆ 🔌 *Port*: \`${port}\`\n`;
      t += `┃\n`;
      rounds.forEach((ms, i) => {
        t += `┣◆ Round ${i + 1}: ${ms === null ? '❌ timeout' : `\`${ms}ms\``}\n`;
      });
      t += `┃\n`;
      t += `┣◆ ⚡ *Min*: \`${min}ms\`\n`;
      t += `┣◆ ⚡ *Avg*: \`${avg}ms\`\n`;
      t += `┣◆ ⚡ *Max*: \`${max}ms\`\n`;
      t += `┣◆ 📶 *Quality*: ${pingBar(avg)}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Ping failed: ${e.message}`);
    }
  },
};
