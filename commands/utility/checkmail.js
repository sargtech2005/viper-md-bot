/**
 * .checkmail — Validate an email address (VIPER BOT MD)
 * Free API: disify.com (no key needed)
 */
const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'checkmail',
  aliases: ['mailcheck', 'verifymail', 'emailcheck'],
  category: 'utility',
  description: 'Check if an email is valid, disposable, or real',
  usage: '.checkmail <email>',

  async execute(sock, msg, args, extra) {
    try {
      const email = (args[0] || '').trim().toLowerCase();

      if (!email || !email.includes('@')) {
        return await extra.reply('❌ Please provide a valid email.\nUsage: `.checkmail example@gmail.com`');
      }

      const { data } = await axios.get(
        `https://www.disify.com/api/email/${encodeURIComponent(email)}`,
        { timeout: 10000 }
      );

      const formatOk   = data.format    ? '✅ Valid format'   : '❌ Invalid format';
      const disposable = data.disposable ? '⚠️ Yes (temp/fake)' : '✅ No (looks real)';
      const dnsOk      = data.dns        ? '✅ Domain exists'  : '❌ No DNS record';

      // Overall verdict
      let verdict = '';
      if (!data.format) {
        verdict = '❌ *INVALID* — Bad email format';
      } else if (!data.dns) {
        verdict = '❌ *INVALID* — Domain does not exist';
      } else if (data.disposable) {
        verdict = '⚠️ *DISPOSABLE* — Temporary/fake email';
      } else {
        verdict = '✅ *LOOKS REAL* — Passes all checks';
      }

      const domain = email.split('@')[1];

      let t = `┏❐ 《 *📧 EMAIL CHECKER* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📨 *Email:* ${email}\n`;
      t += `┣◆ 🌐 *Domain:* ${domain}\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *Format:* ${formatOk}\n`;
      t += `┣◆ 🌍 *DNS Record:* ${dnsOk}\n`;
      t += `┣◆ 🗑️ *Disposable:* ${disposable}\n`;
      t += `┃\n`;
      t += `┣◆ 🔎 *Verdict:* ${verdict}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
