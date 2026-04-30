/**
 * .setmenu — Set menu display style  (VIPER BOT MD)
 * Style 2 : Full expanded command list grouped by category (DEFAULT)
 * Style 3 : Interactive WhatsApp list-message popup
 * Style 1 : REMOVED — was the old compact header, no longer available
 */
const database = require('../../database');
const config   = require('../../config');

module.exports = {
  name: 'setmenu',
  aliases: ['menustyle', 'menumode'],
  category: 'owner',
  description: 'Set menu display style (2 = full list, 3 = interactive popup)',
  usage: '.setmenu 2 | .setmenu 3',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const style = parseInt(args[0]);

      if (![2, 3].includes(style)) {
        const current = database.getSetting('menuStyle', 2);
        return extra.reply(
          `*⚙️ Set Menu Style*\n\n` +
          `*.setmenu 2* — Full List (Default)\n` +
          `  Header + every command grouped by category\n\n` +
          `*.setmenu 3* — Interactive\n` +
          `  WhatsApp popup: tap category → see commands\n\n` +
          `⚡ Current: *Style ${current}*\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
        );
      }

      database.updateSettings({ menuStyle: style });
      const labels = { 2: 'Full List', 3: 'Interactive Popup' };
      await extra.reply(
        `✅ Menu style set to *${style}* — ${labels[style]}\n\nType *.menu* to see it.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
      );
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
    }
  },
};
