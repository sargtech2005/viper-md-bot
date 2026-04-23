const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'download',
  aliases: ['downloadmenu', 'dl', 'media', 'mediamenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show download commands',
  usage: '.download',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'download', '📥', 'download');
  },
};
