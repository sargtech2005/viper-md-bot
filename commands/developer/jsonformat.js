/**
 * .jsonformat <json>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'jsonformat',
  aliases: ['json', 'prettyjson', 'jformat'],
  category: 'developer',
  description: 'Validate and pretty-print JSON',
  usage: '.jsonformat <json>',

  async execute(sock, msg, args, extra) {
    const raw = args.join(' ').trim();
    if (!raw) return extra.reply(
      `🤦 Give me some JSON to format!\nUsage: *.jsonformat <json>*\nExample: *.jsonformat {"name":"Viper","version":2}*`
    );

    try {
      const parsed  = JSON.parse(raw);
      const pretty  = JSON.stringify(parsed, null, 2);
      const keys    = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0;
      const typeStr = Array.isArray(parsed) ? `array (${parsed.length} items)` :
                      typeof parsed === 'object' && parsed ? `object (${keys} keys)` :
                      typeof parsed;

      let t = `┏❐ 《 *📄 ${sc('json format')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ ✅ *Valid JSON!*\n`;
      t += `┣◆ 📦 *Type*: \`${typeStr}\`\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *Formatted*:\n`;
      const display = pretty.length > 2000 ? pretty.slice(0, 2000) + '\n… (truncated)' : pretty;
      t += `\`\`\`\n${display}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      // Try to give a helpful error location
      const match = e.message.match(/position (\d+)/);
      const hint  = match
        ? `\n💡 Problem near position *${match[1]}*: \`${raw.slice(Math.max(0, parseInt(match[1]) - 10), parseInt(match[1]) + 10)}\``
        : '';
      await extra.reply(`❌ *Invalid JSON!*\n\n\`${e.message}\`${hint}`);
    }
  },
};
