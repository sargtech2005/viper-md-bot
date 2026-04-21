const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'utility',
  aliases: ['utilitymenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show utility commands',
  usage: '.utility',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'utility', '🔧', 'utility');
  },
};
