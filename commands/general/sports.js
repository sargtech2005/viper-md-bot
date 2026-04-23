const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'sports', aliases: ['football', 'sportsmenu', 'footballmenu'],
  category: 'general', isNavShortcut: true,
  description: 'Show sports & football commands', usage: '.sports',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'sports', '⚽', 'sports');
  },
};
