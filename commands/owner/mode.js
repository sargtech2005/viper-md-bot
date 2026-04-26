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

    const B = database.getSetting('botName', config.botName);

    if (!args[0]) {
      let t  = `┏❐ 《 *🔒 ʙᴏᴛ ᴍᴏᴅᴇ* 》 ❐\n┃\n`;
      t += `┣◆ Current: *${currentMode.toUpperCase()}*\n`;
      t += `┣◆ ${selfMode ? '🔒 Only owner can use commands' : '🌐 Everyone can use commands'}\n┃\n`;
      t += `┣◆ *.mode private* — 🔒 Owner only\n`;
      t += `┣◆ *.mode public*  — 🌐 Everyone\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
      return extra.reply(t);
    }

    const mode = args[0].toLowerCase();

    if (mode === 'private' || mode === 'priv') {
      if (selfMode) return extra.reply(`🔒 Bot is already in *PRIVATE* mode.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      database.updateSettings({ selfMode: true });
      return extra.reply(`🔒 Bot mode changed to *PRIVATE*\n\nOnly owner can use commands now.\n\n> Boss said so 👑`);
    }

    if (mode === 'public' || mode === 'pub') {
      if (!selfMode) return extra.reply(`🌐 Bot is already in *PUBLIC* mode.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      database.updateSettings({ selfMode: false });
      return extra.reply(`🌐 Bot mode changed to *PUBLIC*\n\nEveryone can use commands now.\n\n> Boss said so 👑`);
    }

    return extra.reply(`❓ Invalid mode. Use: *.mode private* or *.mode public*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
  },
};
