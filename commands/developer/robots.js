/**
 * .robots <domain>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'robots',
  aliases: ['robotstxt'],
  category: 'developer',
  description: "Fetch a domain's robots.txt",
  usage: '.robots <domain>',

  async execute(sock, msg, args, extra) {
    let host = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!host) return extra.reply(`🤖 Give me a domain!\nUsage: *.robots <domain>*`);

    const url = `https://${host}/robots.txt`;
    await extra.reply(`🤖 Fetching \`${url}\`...`);

    try {
      const res  = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'ViperBotMD/2.7' },
        validateStatus: () => true,
      });

      if (res.status === 404) {
        return extra.reply(`😅 No \`robots.txt\` found for *${host}* (404) 🤷`);
      }

      const text    = String(res.data).slice(0, 3000);
      const lines   = text.split('\n').length;
      const display = text.length > 2000 ? text.slice(0, 2000) + '\n…(truncated)' : text;

      let t = `┏❐ 《 *🤖 robots.txt — ${host}* 》 ❐\n`;
      t += `┃  ${lines} lines\n┃\n`;
      t += `\`\`\`\n${display}\n\`\`\`\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 robots.txt fetch failed: \`${e.message}\``);
    }
  },
};
