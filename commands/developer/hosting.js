/**
 * .hosting — hosting provider / ASN lookup  (VIPER BOT MD)
 * Resolves domain → IP via DNS, then queries ip-api.com
 */
const axios  = require('axios');
const dns    = require('dns').promises;
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'hosting',
  aliases: ['host', 'hostinfo', 'hostlookup'],
  category: 'developer',
  description: 'Find hosting provider / server info for a domain or IP',
  usage: '.hosting <domain or ip>',

  async execute(sock, msg, args, extra) {
    const target = args[0];
    if (!target) return extra.reply(
      `🤦 Give me a domain or IP na! 😂\nUsage: *.hosting <domain>*\nExample: .hosting google.com`
    );

    try {
      await extra.reply(`🕵️ Digging up *${target}*'s hosting secrets... 👀`);

      let ip = target;
      // If it looks like a domain, resolve it first
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) {
        try {
          const addrs = await dns.resolve4(target.replace(/^https?:\/\//, '').split('/')[0]);
          ip = addrs[0];
        } catch (_) {
          return extra.reply(`😬 Can't resolve *${target}* to an IP. Is the domain even real? 💀`);
        }
      }

      const { data } = await axios.get(
        `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,org,as,hosting,query`,
        { timeout: 8000 }
      );

      if (data.status !== 'success') {
        return extra.reply(`😭 Lookup failed for *${target}* → *${ip}*\nip-api said: ${data.message} 🤷`);
      }

      const hosted = data.hosting ? '✅ Yes (datacenter/hosting IP)' : '❌ No (likely residential)';

      let t = `┏❐ 《 *🏠 ${sc('hosting info')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *Target*: ${target}\n`;
      t += `┣◆ 🔌 *Resolved IP*: ${data.query}\n`;
      t += `┣◆ 🏢 *ISP*: ${data.isp || 'N/A'}\n`;
      t += `┣◆ 🏗️ *Organisation*: ${data.org || 'N/A'}\n`;
      t += `┣◆ 🔢 *ASN*: ${data.as || 'N/A'}\n`;
      t += `┣◆ 🖥️ *Hosting IP?*: ${hosted}\n`;
      t += `┣◆ 🌍 *Country*: ${data.country || 'N/A'}\n`;
      t += `┣◆ 🏙️ *Region*: ${data.regionName || 'N/A'}\n`;
      t += `┣◆ 🏘️ *City*: ${data.city || 'N/A'}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Hosting lookup crashed harder than a free VPS: *${e.message}* 😭`);
    }
  },
};
