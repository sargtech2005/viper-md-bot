/**
 * .whois — WHOIS via RDAP  (VIPER BOT MD)
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'whois',
  aliases: ['rdap', 'domaininfo'],
  category: 'developer',
  description: 'WHOIS / RDAP registration info for a domain',
  usage: '.whois <domain>',

  async execute(sock, msg, args, extra) {
    const domain = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!domain) return extra.reply(
      `🤦 Bro, what domain should I check? 😂\nUsage: *.whois <domain>*\nExample: .whois google.com`
    );

    try {
      await extra.reply(`🔍 Checking WHOIS for *${domain}*... stalking legally 😅`);
      const { data } = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 10000 });

      const getName  = ent => ent?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'N/A';
      const getEmail = ent => ent?.vcardArray?.[1]?.find(v => v[0] === 'email')?.[3] || 'N/A';

      const registrar  = data.entities?.find(e => e.roles?.includes('registrar'));
      const registrant = data.entities?.find(e => e.roles?.includes('registrant'));

      const created  = data.events?.find(e => e.eventAction === 'registration')?.eventDate || 'N/A';
      const expires  = data.events?.find(e => e.eventAction === 'expiration')?.eventDate || 'N/A';
      const updated  = data.events?.find(e => e.eventAction === 'last changed')?.eventDate || 'N/A';

      const status   = (data.status || []).join(', ') || 'N/A';
      const ns       = (data.nameservers || []).map(n => n.ldhName).slice(0, 4).join('\n┃             ') || 'N/A';

      let t = `┏❐ 《 *🔍 ${sc('whois')} — ${domain}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *Domain*: ${data.ldhName || domain}\n`;
      t += `┣◆ 📋 *Status*: ${status}\n`;
      t += `┣◆ 🏢 *Registrar*: ${getName(registrar)}\n`;
      t += `┣◆ 👤 *Registrant*: ${getName(registrant)}\n`;
      t += `┣◆ 📧 *Email*: ${getEmail(registrant)}\n`;
      t += `┣◆ 📅 *Created*: ${created !== 'N/A' ? new Date(created).toDateString() : 'N/A'}\n`;
      t += `┣◆ ⏰ *Expires*: ${expires !== 'N/A' ? new Date(expires).toDateString() : 'N/A'}\n`;
      t += `┣◆ 🔄 *Updated*: ${updated !== 'N/A' ? new Date(updated).toDateString() : 'N/A'}\n`;
      t += `┣◆ 🖥️ *Nameservers*:\n┃    ${ns}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      if (e.response?.status === 404) {
        return extra.reply(`😅 *${domain}* not found in RDAP. It might be unregistered or the TLD doesn't support RDAP 🤷`);
      }
      await extra.reply(`💀 WHOIS lookup died: *${e.message}* 😭 Try again in a sec?`);
    }
  },
};
