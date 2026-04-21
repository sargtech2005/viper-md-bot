/**
 * .aimenu — nav shortcut to list AI category commands
 * Name is 'aimenu' (NOT 'ai') to avoid colliding with commands/ai/ai.js
 * which registers 'ai' as an alias for the actual chat command.
 */
const { sendCategoryMenu } = require('../../utils/categoryMenu');

module.exports = {
  name: 'aimenu',
  aliases: ['aicmds', 'ailist'],
  category: 'general',
  isNavShortcut: true,
  description: 'Show AI commands list',
  usage: '.aimenu',

  async execute(sock, msg, args, extra) {
    await sendCategoryMenu(sock, msg, extra, 'ai', '🤖', 'ai');
  },
};
