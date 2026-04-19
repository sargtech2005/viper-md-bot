/**
 * .myip — bot server's public IP  (VIPER BOT MD)
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'myip',
  aliases: ['botip', 'serverip'],
  category: 'developer',
  description: "Show bot server's public IP and location",
  usage: '.myip',

  async execute(sock, msg, args, extra) {
    try {
      await extra.reply(`🌍 Asking the internet where I live... 👀`);
      const [ipRes, geoRes] = await Promise.all([
        axios.get('https://api.ipify.org?format=json', { timeout: 6000 }),
        axios.get('http://ip-api.com/json/?fields=country,regionName,city,isp,org,as,timezone', { timeout: 6000 }),
      ]);
      const ip  = ipRes.data.ip;
      const geo = geoRes.data;

      let t = `┏❐ 《 *🌍 ${sc('bot server ip')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🔌 *Public IP*: ${ip}\n`;
      t += `┣◆ 🌍 *Country*: ${geo.country || 'N/A'}\n`;
      t += `┣◆ 🏙️ *Region*: ${geo.regionName || 'N/A'}\n`;
      t += `┣◆ 🏘️ *City*: ${geo.city || 'N/A'}\n`;
      t += `┣◆ 🕐 *Timezone*: ${geo.timezone || 'N/A'}\n`;
      t += `┣◆ 🏢 *ISP*: ${geo.isp || 'N/A'}\n`;
      t += `┣◆ 🔢 *ASN*: ${geo.as || 'N/A'}\n`;
      t += `┗❐\n\n`;
      t += `> ${config.botName} 🐍 — *that's where I live rn* 😅`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`😭 Can't even find my own IP rn 💀\nError: ${e.message}\nServer might be acting up 🤷`);
    }
  },
};
