const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'media',
  aliases: ['mediamenu'],
  category: 'general',
  description: 'Show media commands',
  usage: '.media',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'media', '🎬', 'media');
  },
};
