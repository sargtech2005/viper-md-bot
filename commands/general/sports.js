const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'arena',
  aliases: ['arena', 'sports', 'sportsmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show sports commands',
  usage: '.arena',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'sports', '⚽', 'arena');
  },
};
