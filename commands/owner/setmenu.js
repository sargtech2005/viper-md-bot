/**
 * .setmenu — Toggle menu display style  (VIPER BOT MD)
 * Style 1 : Classic compact header + category shortcuts (default)
 * Style 2 : Full expanded command list grouped by category
 */
const database = require('../../database');
const { sc }   = require('../../utils/categoryMenu');
const config   = require('../../config');

module.exports = {
  name: 'setmenu',
  aliases: ['menustyle', 'menumode'],
  category: 'owner',
  description: 'Set menu display style (1 = compact, 2 = full list)',
  usage: '.setmenu 1 | .setmenu 2',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const style = parseInt(args[0]);

      if (![1, 2].includes(style)) {
        let t = `┏❐ 《 *${sc('set menu')}* 》 ❐\n┃\n`;
        t += `┣◆ 📋 *.setmenu 1* — Classic\n`;
        t += `┃   Header + category shortcut list\n`;
        t += `┃\n`;
        t += `┣◆ 📂 *.setmenu 2* — Full List\n`;
        t += `┃   Header + every command grouped by category\n`;
        t += `┃\n`;
        const current = database.getSetting('menuStyle', 1);
        t += `┣◆ ⚡ ${sc('current style')}: *${current}*\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return extra.reply(t);
      }

      database.updateSettings({ menuStyle: style });
      const label = style === 1 ? 'ᴄʟᴀssɪᴄ' : 'ꜰᴜʟʟ ʟɪsᴛ';
      await extra.reply(
        `✅ Menu style set to *${style}* (${label})\n\nType *.menu* to preview the new look.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
      );
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
    }
  },
};
