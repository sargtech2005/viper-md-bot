/**
 * .global — view all bot-wide toggle settings  (VIPER BOT MD)
 * Individual toggles are their own commands (no sub-args needed)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'global',
  aliases: ['globalsettings', 'botsettings'],
  category: 'owner',
  description: 'View global bot settings status',
  usage: '.global',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const b = v => v ? '🟢 *ON*' : '🔴 *OFF*';

      let t = `┏❐ 《 *👑 ${sc('global settings')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ ⌨️  ${sc('auto typing')}   → ${b(config.autoTyping)}   *.autotyping*\n`;
      t += `┣◆ 👁️  ${sc('auto read')}     → ${b(config.autoRead)}    *.autoread*\n`;
      t += `┣◆ 🎭 ${sc('auto sticker')}  → ${b(config.autoSticker)} *.autosticker*\n`;
      t += `┣◆ ⚡ ${sc('auto react')}    → ${b(config.autoReact)}   *.autoreact*\n`;
      t += `┣◆ 📥 ${sc('auto download')} → ${b(config.autoDownload)}*.autodownload*\n`;
      t += `┣◆ 🔒 ${sc('self mode')}     → ${b(config.selfMode)}    *.mode*\n`;
      t += `┃\n`;
      t += `┣◆ 💡 ${sc('prefix')}: *${config.prefix}*\n`;
      t += `┣◆ 🐍 ${sc('mode')}: *${config.selfMode ? 'ᴘʀɪᴠᴀᴛᴇ' : 'ᴘᴜʙʟɪᴄ'}*\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 Couldn't load settings: ${e.message} 😭`);
    }
  },
};
