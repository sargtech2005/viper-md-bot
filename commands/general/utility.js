const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'vault',
  aliases: ['vault', 'utility', 'utilitymenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show utility commands',
  usage: '.vault',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'utility', '🔐', 'vault');
  },
};
