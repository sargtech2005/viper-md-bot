/**
 * .dns — DNS records lookup  (VIPER BOT MD)
 * Uses Node built-in dns module — no API needed
 */
const dns    = require('dns').promises;
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

const TYPES = ['A','AAAA','MX','TXT','CNAME','NS','SOA'];

module.exports = {
  name: 'dns',
  aliases: ['dnscheck', 'dnslookup'],
  category: 'developer',
  description: 'Query DNS records (A/AAAA/MX/TXT/CNAME/NS/SOA)',
  usage: '.dns <domain> [type]',

  async execute(sock, msg, args, extra) {
    let domain = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    const type = (args[1] || 'A').toUpperCase();

    if (!domain) return extra.reply(
      `🤦 Domain? What domain? 😂\nUsage: *.dns <domain> [type]*\nExample: .dns google.com MX\nTypes: ${TYPES.join(', ')}`
    );

    if (!TYPES.includes(type)) return extra.reply(
      `😬 *${type}* is not a DNS record type I know 🤷\nValid types: ${TYPES.join(', ')}`
    );

    try {
      await extra.reply(`📡 Querying *${type}* records for *${domain}*... 🔍`);

      let records;
      switch (type) {
        case 'A':    records = await dns.resolve4(domain);   break;
        case 'AAAA': records = await dns.resolve6(domain);   break;
        case 'MX':   records = await dns.resolveMx(domain);  break;
        case 'TXT':  records = await dns.resolveTxt(domain); break;
        case 'CNAME':records = await dns.resolveCname(domain);break;
        case 'NS':   records = await dns.resolveNs(domain);  break;
        case 'SOA':  records = [await dns.resolveSoa(domain)]; break;
      }

      const format = r => {
        if (typeof r === 'string') return r;
        if (Array.isArray(r))     return r.join(' ');
        if (r.exchange)           return `${r.exchange} (priority ${r.priority})`;
        if (r.nsname)             return `NS: ${r.nsname}, Admin: ${r.hostmaster}, Serial: ${r.serial}`;
        return JSON.stringify(r);
      };

      let t = `┏❐ 《 *🌐 ${sc('dns')} — ${domain}* 》 ❐\n`;
      t += `┃  ${sc('type')}: *${type}*  |  ${sc('records')}: ${records.length}\n`;
      t += `┃\n`;
      const recordLines = records.map((r, i) => `[${i + 1}] ${format(r)}`).join('\n');
      t += `\`\`\`\n${recordLines}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
        return extra.reply(`😅 No *${type}* records found for *${domain}*. Domain might not exist or have no ${type} 🤷`);
      }
      await extra.reply(`💀 DNS query crashed: *${e.message}* 😭 Check the domain and try again`);
    }
  },
};
