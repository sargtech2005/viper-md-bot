/**
 * Anti-Delete — Forward deleted messages to owner DM (global toggle)
 * Works in groups AND private DMs
 */

const database = require('../../database');

module.exports = {
  name: 'antidelete',
  aliases: ['antidel'],
  category: 'owner',
  description: 'Forward deleted messages to your DM',
  usage: '.antidelete on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const current = !!database.getSetting('antidelete');

      // No args → show status
      if (!args[0]) {
        return extra.reply(
          `🗑️ *Anti-Delete*\n\n` +
          `Status: *${current ? '✅ ON' : '❌ OFF'}*\n\n` +
          `When ON, any deleted message (group or DM) is forwarded to your private DM.\n\n` +
          `Usage:\n  .antidelete on\n  .antidelete off`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (current) return extra.reply('🗑️ Anti-Delete is already *ON*.');
        database.updateSettings({ antidelete: true });
        return extra.reply(
          '✅ *Anti-Delete enabled!*\n\nAll deleted messages (groups + DMs) will be forwarded to your DM.'
        );
      }

      if (opt === 'off') {
        if (!current) return extra.reply('🗑️ Anti-Delete is already *OFF*.');
        database.updateSettings({ antidelete: false });
        return extra.reply('❌ *Anti-Delete disabled.*');
      }

      return extra.reply('❌ Invalid option.\nUsage: `.antidelete on` or `.antidelete off`');
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};
