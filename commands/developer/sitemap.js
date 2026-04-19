/**
 * .sitemap <domain>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'sitemap',
  aliases: ['sitemapcheck'],
  category: 'developer',
  description: 'Fetch and list URLs from a domain sitemap.xml',
  usage: '.sitemap <domain>',

  async execute(sock, msg, args, extra) {
    let host = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!host) return extra.reply(`🗺️ Give me a domain!\nUsage: *.sitemap <domain>*`);

    await extra.reply(`🗺️ Fetching sitemap for *${host}*...`);

    try {
      // Try robots.txt first to find sitemap location
      let sitemapUrl = `https://${host}/sitemap.xml`;
      try {
        const robotsRes = await axios.get(`https://${host}/robots.txt`, { timeout: 5000 });
        const sm = robotsRes.data.match(/Sitemap:\s*(\S+)/i);
        if (sm) sitemapUrl = sm[1];
      } catch (_) {}

      const res = await axios.get(sitemapUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'ViperBotMD/2.7' },
        validateStatus: () => true,
      });

      if (res.status === 404) {
        return extra.reply(`😅 No sitemap found at \`${sitemapUrl}\` (404)\nTried robots.txt too 🤷`);
      }

      const xml  = String(res.data);
      // Extract <loc> URLs
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
      const display = locs.slice(0, 25).map((l, i) => `[${i+1}] ${l}`).join('\n');
      const more  = locs.length > 25 ? `\n…and ${locs.length - 25} more` : '';

      let t = `┏❐ 《 *🗺️ ${sc('sitemap')} — ${host}* 》 ❐\n`;
      t += `┃  Found *${locs.length}* URL(s)\n┃\n`;
      t += `\`\`\`\n${display}${more}\n\`\`\`\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Sitemap fetch failed: \`${e.message}\``);
    }
  },
};
