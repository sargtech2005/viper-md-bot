/**
 * .domainavail <name.tld>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'domainavail',
  aliases: ['domaincheck', 'isavailable', 'checkdomain'],
  category: 'developer',
  description: 'Check if a domain name is available to register',
  usage: '.domainavail <name.tld>',

  async execute(sock, msg, args, extra) {
    const domain = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!domain || !domain.includes('.')) {
      return extra.reply(
        `✅ Give me a full domain!\nUsage: *.domainavail <name.tld>*\nExample: *.domainavail coolsite.com*`
      );
    }

    await extra.reply(`🔍 Checking availability of *${domain}*...`);

    try {
      const res = await axios.get(`https://rdap.org/domain/${domain}`, {
        timeout: 10000,
        validateStatus: () => true,
      });

      if (res.status === 200) {
        // Domain is registered — pull registration info
        const data    = res.data;
        const expires = data.events?.find(e => e.eventAction === 'expiration')?.eventDate;
        const expiryStr = expires ? new Date(expires).toDateString() : '–';

        let t = `┏❐ 《 *✅ ${sc('domain available')} — ${domain}* 》 ❐\n┃\n`;
        t += `┣◆ 🔴 *Status*: REGISTERED\n`;
        t += `┣◆ 📋 *Domain*: \`${domain}\`\n`;
        t += `┣◆ ⏰ *Expires*: \`${expiryStr}\`\n`;
        t += `┣◆ 😢 *Sorry, this domain is taken!*\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      if (res.status === 404) {
        let t = `┏❐ 《 *✅ ${sc('domain available')} — ${domain}* 》 ❐\n┃\n`;
        t += `┣◆ 🟢 *Status*: AVAILABLE!\n`;
        t += `┣◆ 📋 *Domain*: \`${domain}\`\n`;
        t += `┣◆ 🎉 *This domain is free to register!*\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      await extra.reply(`🤷 Got unexpected status ${res.status} from RDAP for *${domain}*`);

    } catch (e) {
      if (e.response?.status === 404) {
        return extra.reply(`🟢 *${domain}* appears to be *AVAILABLE*! Go register it 🎉`);
      }
      await extra.reply(`💀 Check failed: \`${e.message}\``);
    }
  },
};
