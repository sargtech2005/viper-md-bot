const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'ai',
  aliases: ['aimenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show ai commands',
  usage: '.ai',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'ai', '🤖', 'ai');
  },
};
