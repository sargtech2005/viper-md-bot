/**
 * .uuid [count]  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const crypto = require('crypto');

module.exports = {
  name: 'uuid',
  aliases: ['uid', 'guidgen'],
  category: 'developer',
  description: 'Generate random UUID v4 strings',
  usage: '.uuid [count]',

  async execute(sock, msg, args, extra) {
    try {
      const count = Math.min(Math.max(parseInt(args[0] || '1') || 1, 1), 20);
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());

      let t = `┏❐ 《 *🆔 ${sc('uuid generator')}* 》 ❐\n`;
      t += `┃  Generated *${count}* UUID(s)\n┃\n`;
      uuids.forEach((u, i) => { t += `┣◆ [${i + 1}] \`${u}\`\n`; });
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
