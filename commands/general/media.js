const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'media',
  aliases: ['media', 'download', 'downloadmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show media & download commands',
  usage: '.media',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'download', '📥', 'media');
  },
};
