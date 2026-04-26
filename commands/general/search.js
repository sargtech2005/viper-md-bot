const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'radar',
  aliases: ['radar', 'searchmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show search commands',
  usage: '.radar',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'search', '🔍', 'radar');
  },
};
