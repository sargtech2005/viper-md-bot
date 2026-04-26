const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'nexus',
  aliases: ['nexus', 'aimenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show AI commands',
  usage: '.nexus',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'ai', '🤖', 'nexus');
  },
};
