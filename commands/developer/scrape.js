/**
 * .scrape <url>  (VIPER BOT MD)
 * Scrapes visible text from a webpage.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ').trim();
}

module.exports = {
  name: 'scrape',
  aliases: ['scrapeweb', 'webtext'],
  category: 'developer',
  description: 'Scrape visible text content from any webpage',
  usage: '.scrape <url>',

  async execute(sock, msg, args, extra) {
    let url = args.join('').trim();
    if (!url) return extra.reply(`🕷️ Give me a URL!\nUsage: *.scrape <url>*`);
    if (!url.startsWith('http')) url = 'https://' + url;

    await extra.reply(`🕷️ Scraping *${url}*...`);
    try {
      const res  = await axios.get(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'ViperBotMD/2.7 scraper' },
        maxRedirects: 5,
      });
      const text = stripHtml(res.data);
      const display = text.slice(0, 2500) + (text.length > 2500 ? '\n…(truncated)' : '');

      let t = `┏❐ 《 *🕷️ ${sc('scrape')} — ${url.slice(0, 40)}* 》 ❐\n`;
      t += `┃  📦 ${text.length} chars extracted\n┃\n`;
      t += `┣◆ 📄 *Text content:*\n`;
      t += `\`\`\`\n${display}\n\`\`\`\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 Scrape failed: \`${e.message}\``);
    }
  },
};
