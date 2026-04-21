/**
 * .general — list all general commands  (VIPER BOT MD)
 */
const { sendCategoryMenu } = require('../../utils/categoryMenu');

module.exports = {
  name: 'general',
  aliases: ['generalmenu'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show general commands',
  usage: '.general',

  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'general', '🌐', 'general');
  },
};
