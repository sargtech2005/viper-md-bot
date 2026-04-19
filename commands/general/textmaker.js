const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'textmaker',
  aliases: ['textmakermenu'],
  category: 'general',
  description: 'Show textmaker commands',
  usage: '.textmaker',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'textmaker', '🖋️', 'textmaker');
  },
};
