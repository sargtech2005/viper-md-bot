/**
 * .global — view all bot-wide toggle settings  (VIPER BOT MD)
 * Individual toggles are their own commands (no sub-args needed)
 */
const config   = require('../../config');
const database = require('../../database');
const { sc }   = require('../../utils/categoryMenu');

module.exports = {
  name: 'global',
  aliases: ['globalsettings', 'botsettings'],
  category: 'owner',
  description: 'View global bot settings status',
  usage: '.global',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Always read live from session DB so values reflect the last .set* command.
      // db() helper: DB value first, then raw config fallback.
      const db = (key) => database.getSetting(key, config[key]);
      const b  = v => v ? '🟢 *ON*' : '🔴 *OFF*';

      let t = `┏❐ 《 *👑 ${sc('global settings')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ ⌨️  ${sc('auto typing')}   → ${b(db('autoTyping'))}   *.autotyping*\n`;
      t += `┣◆ 👁️  ${sc('auto read')}     → ${b(db('autoRead'))}    *.autoread*\n`;
      t += `┣◆ 🎭 ${sc('auto sticker')}  → ${b(db('autoSticker'))} *.autosticker*\n`;
      t += `┣◆ ⚡ ${sc('auto react')}    → ${b(db('autoReact'))}   *.autoreact*\n`;
      t += `┣◆ 📡 ${sc('auto status')}   → ${b(db('autoStatus'))}  *.autostatus*\n`;
      t += `┣◆ 🔒 ${sc('self mode')}     → ${b(db('selfMode'))}    *.mode*\n`;
      t += `┃\n`;
      t += `┣◆ 💡 ${sc('prefix')}: *${db('prefix')}*\n`;
      t += `┣◆ 🐍 ${sc('mode')}: *${db('selfMode') ? 'ᴘʀɪᴠᴀᴛᴇ' : 'ᴘᴜʙʟɪᴄ'}*\n`;
      t += `┣◆ 🤖 ${sc('bot name')}: *${db('botName')}*\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${db('botName')}* 🐍`;

      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 Couldn't load settings: ${e.message} 😭`);
    }
  },
};
