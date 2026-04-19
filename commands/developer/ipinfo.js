/**
 * .ipinfo — IP geolocation + ASN  (VIPER BOT MD)
 * Uses ip-api.com (free, no key needed)
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'ipinfo',
  aliases: ['iplookup', 'ipcheck', 'lookup'],
  category: 'developer',
  description: 'IP geolocation, ISP & ASN info',
  usage: '.ipinfo <ip or domain>',

  async execute(sock, msg, args, extra) {
    const target = args[0];
    if (!target) return extra.reply(
      `🤦 Bro you forgot the IP address 💀\nUsage: *.ipinfo <ip>*\nExample: .ipinfo 8.8.8.8`
    );

    try {
      await extra.reply(`🔍 Snooping on *${target}*... hang on 👀`);
      const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, { timeout: 8000 });

      if (data.status !== 'success') {
        return extra.reply(`😬 Couldn't find info for *${target}*\nReason: ${data.message || 'unknown'} 🤷`);
      }

      let t = `┏❐ 《 *🗺️ ${sc('ip info')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🔌 *IP*: ${data.query}\n`;
      t += `┣◆ 🌍 *Country*: ${data.country || 'N/A'}\n`;
      t += `┣◆ 🏙️ *Region*: ${data.regionName || 'N/A'}\n`;
      t += `┣◆ 🏘️ *City*: ${data.city || 'N/A'}\n`;
      t += `┣◆ 📮 *ZIP*: ${data.zip || 'N/A'}\n`;
      t += `┣◆ 📍 *Coords*: ${data.lat}, ${data.lon}\n`;
      t += `┣◆ 🕐 *Timezone*: ${data.timezone || 'N/A'}\n`;
      t += `┣◆ 🏢 *ISP*: ${data.isp || 'N/A'}\n`;
      t += `┣◆ 🏗️ *Org*: ${data.org || 'N/A'}\n`;
      t += `┣◆ 🔢 *ASN*: ${data.as || 'N/A'}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`😭 IP lookup just died on me: *${e.message}* 💀\nMaybe the IP is hiding? 👀`);
    }
  },
};
