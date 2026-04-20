/**
 * .mode — toggle bot between public and private mode (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'mode',
  aliases: ['botmode', 'privatemode', 'publicmode'],
  description: 'Toggle bot between private and public mode',
  usage: '.mode <private/public>',
  category: 'owner',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const selfMode    = database.getSetting('selfMode', config.selfMode);
    const currentMode = selfMode ? 'private' : 'public';

    if (!args[0]) {
      return extra.reply(
        `🤖 *Bot Mode*\n\n` +
        `Current Mode: *${currentMode.toUpperCase()}*\n` +
        `Status: ${selfMode ? 'Only owner can use commands' : 'Everyone can use commands'}\n\n` +
        `Usage:\n` +
        `  .mode private — Only owner can use\n` +
        `  .mode public  — Everyone can use`
      );
    }

    const mode = args[0].toLowerCase();

    if (mode === 'private' || mode === 'priv') {
      if (selfMode) return extra.reply('🔒 Bot is already in *PRIVATE* mode.');
      database.updateSettings({ selfMode: true });
      return extra.reply('🔒 Bot mode changed to *PRIVATE*\n\nOnly owner can use commands now.\n\n> Boss said so 👑');
    }

    if (mode === 'public' || mode === 'pub') {
      if (!selfMode) return extra.reply('🌐 Bot is already in *PUBLIC* mode.');
      database.updateSettings({ selfMode: false });
      return extra.reply('🌐 Bot mode changed to *PUBLIC*\n\nEveryone can use commands now.\n\n> Boss said so 👑');
    }

    return extra.reply('❓ Invalid mode. Use: *.mode private* or *.mode public*');
  },
};
