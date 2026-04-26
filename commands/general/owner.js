const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'venom',
  aliases: ['venom', 'owner', 'ownermenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show owner-only commands',
  usage: '.venom',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'owner', '👑', 'venom');
  },
};
