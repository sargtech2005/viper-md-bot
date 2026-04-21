const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'fun',
  aliases: ['funmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show fun commands',
  usage: '.fun',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'fun', '🎭', 'fun');
  },
};
