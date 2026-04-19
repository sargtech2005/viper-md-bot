/**
 * .pageinfo <url>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

function meta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

module.exports = {
  name: 'pageinfo',
  aliases: ['siteinfo', 'oginfo', 'metainfo'],
  category: 'developer',
  description: 'Extract page title, description and OG tags from a URL',
  usage: '.pageinfo <url>',

  async execute(sock, msg, args, extra) {
    let url = args.join('').trim();
    if (!url) return extra.reply(`🗒️ Give me a URL!\nUsage: *.pageinfo <url>*`);
    if (!url.startsWith('http')) url = 'https://' + url;

    await extra.reply(`🗒️ Fetching page info for \`${url}\`...`);

    try {
      const res  = await axios.get(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'ViperBotMD/2.7 pageinfo' },
        maxRedirects: 5,
        maxContentLength: 500000,
      });
      const html = res.data;

      const title    = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '–').trim().slice(0, 120);
      const desc     = (meta(html, 'description') || '–').slice(0, 300);
      const ogTitle  = meta(html, 'og:title') || '–';
      const ogDesc   = (meta(html, 'og:description') || '–').slice(0, 200);
      const ogImage  = meta(html, 'og:image') || '–';
      const ogType   = meta(html, 'og:type')  || '–';
      const ogSite   = meta(html, 'og:site_name') || '–';
      const twCard   = meta(html, 'twitter:card') || '–';
      const canon    = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '–';
      const charset  = html.match(/charset=["']?([^"'>\s]+)/i)?.[1] || '–';

      let t = `┏❐ 《 *🗒️ ${sc('page info')}* 》 ❐\n┃\n`;
      t += `┣◆ 🌐 *URL*: \`${url.slice(0, 80)}\`\n`;
      t += `┣◆ 🏷️ *Title*: ${title}\n`;
      t += `┣◆ 📝 *Description*: ${desc}\n`;
      t += `┣◆ 🔤 *Charset*: \`${charset}\`\n`;
      t += `┣◆ 🔗 *Canonical*: \`${canon.slice(0, 100)}\`\n`;
      t += `┃\n┣◆ 🔵 *OpenGraph*:\n`;
      t += `┃    Title: ${ogTitle.slice(0, 100)}\n`;
      t += `┃    Desc:  ${ogDesc}\n`;
      t += `┃    Type:  \`${ogType}\`\n`;
      t += `┃    Site:  \`${ogSite}\`\n`;
      t += `┃    Image: \`${ogImage.slice(0, 100)}\`\n`;
      t += `┣◆ 🐦 *Twitter card*: \`${twCard}\`\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 pageinfo failed: \`${e.message}\``);
    }
  },
};
