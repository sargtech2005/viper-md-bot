/**
 * .timestamp [unix|date]  (VIPER BOT MD)
 * With no args: shows current timestamp.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'timestamp',
  aliases: ['ts', 'epoch', 'unixtime'],
  category: 'developer',
  description: 'Convert Unix timestamp ↔ human date, or show current time',
  usage: '.timestamp [<unix> | <date string>]',

  async execute(sock, msg, args, extra) {
    try {
      const input = args.join(' ').trim();

      let date, unixSec, note;

      if (!input) {
        // No args → show current time in multiple formats
        date    = new Date();
        unixSec = Math.floor(Date.now() / 1000);
        note    = 'Current time';
      } else if (/^\d{10}$/.test(input)) {
        unixSec = parseInt(input);
        date    = new Date(unixSec * 1000);
        note    = 'Unix (seconds) → Date';
      } else if (/^\d{13}$/.test(input)) {
        unixSec = Math.floor(parseInt(input) / 1000);
        date    = new Date(parseInt(input));
        note    = 'Unix (milliseconds) → Date';
      } else {
        date = new Date(input);
        if (isNaN(date.getTime())) {
          return extra.reply(
            `😬 Couldn't parse *${input}*\n\n` +
            `Valid inputs:\n` +
            `  Unix seconds:  \`1700000000\`\n` +
            `  Unix ms:       \`1700000000000\`\n` +
            `  Date string:   \`2024-01-15\`\n` +
            `  ISO 8601:      \`2024-01-15T10:30:00Z\``
          );
        }
        unixSec = Math.floor(date.getTime() / 1000);
        note    = 'Date → Unix';
      }

      let t = `┏❐ 《 *⏱️ ${sc('timestamp')}* 》 ❐\n`;
      t += `┃  ${note}\n┃\n`;
      t += `┣◆ 🔢 *Unix (sec)*:  \`${unixSec}\`\n`;
      t += `┣◆ 🔢 *Unix (ms)*:   \`${unixSec * 1000}\`\n`;
      t += `┣◆ 📅 *UTC*:         \`${date.toUTCString()}\`\n`;
      t += `┣◆ 📅 *ISO 8601*:    \`${date.toISOString()}\`\n`;
      t += `┣◆ 📅 *Locale*:      \`${date.toLocaleString()}\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
