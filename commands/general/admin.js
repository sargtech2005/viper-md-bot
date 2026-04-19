const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'admin',
  aliases: ['adminmenu'],
  category: 'general',
  description: 'Show admin commands',
  usage: '.admin',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'admin', '⚙️', 'admin');
  },
};
