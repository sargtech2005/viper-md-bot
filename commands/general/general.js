const { sendCategoryMenu } = require('../../utils/categoryMenu');
module.exports = {
  name: 'viper',
  aliases: ['viper', 'general', 'generalmenu', 'main'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show core Viper commands',
  usage: '.viper',
  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'general', '🐍', 'viper');
  },
};
