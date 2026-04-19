/**
 * .owner — list all owner-only commands  (VIPER BOT MD)
 */
const { sendCategoryMenu } = require('../../utils/categoryMenu');

module.exports = {
  name: 'owner',
  aliases: ['ownermenu'],
  category: 'general',
  description: 'Show owner commands',
  usage: '.owner',

  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'owner', '👑', 'owner');
  },
};
