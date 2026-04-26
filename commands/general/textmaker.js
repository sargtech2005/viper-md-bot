const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'studio',
  aliases: ['studio', 'textmaker', 'textmakermenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show text art commands',
  usage: '.studio',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'textmaker', '🖋️', 'studio');
  },
};
