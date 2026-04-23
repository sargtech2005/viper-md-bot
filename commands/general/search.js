const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'searchmenu', aliases: ['searchcat', 'searches'],
  category: 'general', isNavShortcut: true,
  description: 'Show search commands', usage: '.searchmenu',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'search', '🔍', 'search');
  },
};
