/**
 * .hash <algo> <text>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const crypto = require('crypto');

const ALGOS = ['md5', 'sha1', 'sha256', 'sha512'];

module.exports = {
  name: 'hash',
  aliases: ['checksum', 'digest'],
  category: 'developer',
  description: 'Hash text using MD5 / SHA1 / SHA256 / SHA512',
  usage: '.hash <algo> <text>',

  async execute(sock, msg, args, extra) {
    const algo = (args[0] || '').toLowerCase();
    const text = args.slice(1).join(' ');

    if (!algo || !text) {
      return extra.reply(
        `🤦 Need an algorithm and text!\n` +
        `Usage: *.hash <algo> <text>*\n` +
        `Algos: \`${ALGOS.join(' | ')}\`\n` +
        `Example: *.hash sha256 hello world*`
      );
    }

    if (!ALGOS.includes(algo)) {
      return extra.reply(
        `😬 Unknown algo *${algo}*\nValid: \`${ALGOS.join(' | ')}\``
      );
    }

    try {
      const hash = crypto.createHash(algo).update(text, 'utf8').digest('hex');
      let t = `┏❐ 《 *#️⃣ ${sc('hash')} — ${algo.toUpperCase()}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📥 *Input*: \`${text.length > 100 ? text.slice(0, 100) + '…' : text}\`\n`;
      t += `┣◆ 🔢 *Algo*:  \`${algo.toUpperCase()}\`\n`;
      t += `┣◆ 🔐 *Hash*:\n┃\`${hash}\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 Hash failed: ${e.message} 😭`);
    }
  },
};
