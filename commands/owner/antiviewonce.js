/**
 * Anti-ViewOnce — Forward view-once media to owner DM (global toggle)
 * Works in groups AND private DMs
 */

const database = require('../../database');

module.exports = {
  name: 'antiviewonce',
  aliases: ['antivo', 'antiview'],
  category: 'owner',
  description: 'Forward view-once media to your DM',
  usage: '.antiviewonce on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const current = !!database.getSetting('antiviewonce');

      // No args → show status
      if (!args[0]) {
        return extra.reply(
          `👁️ *Anti-ViewOnce*\n\n` +
          `Status: *${current ? '✅ ON' : '❌ OFF'}*\n\n` +
          `When ON, any view-once photo/video (group or DM) is forwarded to your private DM before it expires.\n\n` +
          `Usage:\n  .antiviewonce on\n  .antiviewonce off`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (current) return extra.reply('👁️ Anti-ViewOnce is already *ON*.');
        database.updateSettings({ antiviewonce: true });
        return extra.reply(
          '✅ *Anti-ViewOnce enabled!*\n\nAll view-once media (groups + DMs) will be forwarded to your DM.'
        );
      }

      if (opt === 'off') {
        if (!current) return extra.reply('👁️ Anti-ViewOnce is already *OFF*.');
        database.updateSettings({ antiviewonce: false });
        return extra.reply('❌ *Anti-ViewOnce disabled.*');
      }

      return extra.reply('❌ Invalid option.\nUsage: `.antiviewonce on` or `.antiviewonce off`');
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};
