const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'squad',
  aliases: ['squad', 'admin', 'adminmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show group management commands',
  usage: '.squad',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'admin', '⚔️', 'squad');
  },
};
