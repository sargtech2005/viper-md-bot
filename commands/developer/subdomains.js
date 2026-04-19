/**
 * .subdomains <domain>  (VIPER BOT MD)
 * Finds subdomains from crt.sh certificate transparency logs.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'subdomains',
  aliases: ['subdomain', 'subenum', 'crtsh'],
  category: 'developer',
  description: 'Find subdomains via crt.sh certificate transparency logs',
  usage: '.subdomains <domain>',

  async execute(sock, msg, args, extra) {
    const domain = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!domain) return extra.reply(`🌲 Give me a domain!\nUsage: *.subdomains <domain>*`);

    await extra.reply(`🌲 Searching cert logs for *${domain}* subdomains... (may take a moment)`);

    try {
      const res = await axios.get(`https://crt.sh/?q=%.${domain}&output=json`, {
        timeout: 20000,
        headers: { 'User-Agent': 'ViperBotMD/2.7' },
      });

      const entries = res.data;
      if (!Array.isArray(entries) || entries.length === 0) {
        return extra.reply(`😅 No subdomains found for *${domain}* in cert logs 🤷`);
      }

      // Collect unique subdomains
      const subs = new Set();
      for (const e of entries) {
        const names = (e.name_value || '').split('\n');
        for (const n of names) {
          const clean = n.trim().toLowerCase().replace(/^\*\./, '');
          if (clean.endsWith(domain) && clean !== domain) subs.add(clean);
        }
      }

      const sorted  = [...subs].sort();
      const display = sorted.slice(0, 40).join('\n');
      const more    = sorted.length > 40 ? `\n…and ${sorted.length - 40} more` : '';

      let t = `┏❐ 《 *🌲 ${sc('subdomains')} — ${domain}* 》 ❐\n`;
      t += `┃  Found *${sorted.length}* unique subdomain(s)\n┃\n`;
      t += `\`\`\`\n${display}${more}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> ⚠️ _These come from public cert logs — not a live scan_\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 Subdomain search failed: \`${e.message}\`\n_crt.sh might be rate-limiting or down 🤷_`);
    }
  },
};
