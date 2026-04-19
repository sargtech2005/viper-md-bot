const { sc } = require('../../utils/categoryMenu');
const config  = require('../../config');
module.exports = {
  name: 'restart', aliases: ['reboot'],
  category: 'owner', description: 'Restart the bot', usage: '.restart',
  ownerOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      let t = `🔄 *${sc('restarting')}...*\n\n`;
      t += `💤 Going for a quick nap...\n`;
      t += `⚡ Be right back, stronger than ever!\n`;
      t += `> *${config.botName}* 🐍`;
      await extra.reply(t);
      setTimeout(() => process.exit(0), 2000);
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
