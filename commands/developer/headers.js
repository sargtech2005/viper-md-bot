/**
 * .headers <url>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'headers',
  aliases: ['httpheaders', 'resheaders'],
  category: 'developer',
  description: 'Show HTTP response headers of a URL',
  usage: '.headers <url>',

  async execute(sock, msg, args, extra) {
    let url = args[0];
    if (!url) return extra.reply(
      `🤦 Give me a URL!\nUsage: *.headers <url>*\nExample: *.headers google.com*`
    );
    if (!url.startsWith('http')) url = 'https://' + url;

    await extra.reply(`📋 Fetching headers for \`${url}\`...`);

    try {
      const start = Date.now();
      const res   = await axios.head(url, {
        timeout: 10000,
        validateStatus: () => true,
        maxRedirects: 5,
        headers: { 'User-Agent': 'ViperBotMD/2.7' },
      });
      const ms = Date.now() - start;

      const INTERESTING = [
        'server','x-powered-by','content-type','cache-control','content-encoding',
        'strict-transport-security','x-frame-options','x-content-type-options',
        'access-control-allow-origin','x-ratelimit-limit','cf-ray','via',
        'age','etag','last-modified','expires','location',
      ];

      const heads = res.headers;
      const statusEmoji = res.status < 300 ? '🟢' : res.status < 400 ? '🟡' : '🔴';

      let t = `┏❐ 《 *📋 ${sc('http headers')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *URL*: \`${url}\`\n`;
      t += `┣◆ ${statusEmoji} *Status*: \`${res.status} ${res.statusText}\`\n`;
      t += `┣◆ ⚡ *Time*: \`${ms}ms\`\n`;
      t += `┃\n`;
      t += `┣◆ 🔑 *Key Headers*:\n`;

      let found = 0;
      for (const key of INTERESTING) {
        if (heads[key]) {
          t += `┃    \`${key}\`: ${heads[key]}\n`;
          found++;
        }
      }

      // Any remaining headers not in interesting list
      t += `┃\n`;
      t += `┣◆ 📦 *All Headers (${Object.keys(heads).length})*:\n`;
      const allStr = Object.entries(heads)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      t += `\`\`\`\n${allStr.slice(0, 1800)}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Headers fetch failed: \`${e.message}\``);
    }
  },
};
