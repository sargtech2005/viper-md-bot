/**
 * .urlshort <url>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'urlshort',
  aliases: ['shorten', 'short', 'tinyurl', 'isgd'],
  category: 'developer',
  description: 'Shorten a long URL using is.gd',
  usage: '.urlshort <url>',

  async execute(sock, msg, args, extra) {
    let url = args.join('').trim();
    if (!url) return extra.reply(
      `🔗 Give me a URL!\nUsage: *.urlshort <url>*\nExample: *.urlshort https://www.google.com/search?q=viperbot*`
    );
    if (!url.startsWith('http')) url = 'https://' + url;

    await extra.reply(`🔗 Shortening URL...`);

    try {
      const res = await axios.get('https://is.gd/create.php', {
        params: { format: 'simple', url },
        timeout: 8000,
      });
      const short = res.data.trim();
      if (!short.startsWith('http')) {
        return extra.reply(`❌ is.gd returned an error: \`${short}\``);
      }

      let t = `┏❐ 《 *🔗 ${sc('url shortener')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📥 *Original*:\n┃    \`${url.slice(0, 200)}\`\n`;
      t += `┣◆ ✂️ *Shortened*:\n┃    \`${short}\`\n`;
      t += `┣◆ 📏 *Saved*: \`${url.length - short.length} chars\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 URL shortening failed: \`${e.message}\``);
    }
  },
};
