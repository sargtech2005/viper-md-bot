const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'arcade',
  aliases: ['arcade', 'fun', 'funmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show fun & games commands',
  usage: '.arcade',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'fun', '🎮', 'arcade');
  },
};
