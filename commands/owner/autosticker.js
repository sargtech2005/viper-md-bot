/**
 * .autosticker — toggle auto sticker mode (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'autosticker',
  aliases: ['stickertoggle'],
  category: 'owner',
  description: 'Toggle auto sticker mode on/off',
  usage: '.autosticker on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const current = database.getSetting('autoSticker', config.autoSticker);
    const state   = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 *on* or *off* — make up your mind!\nUsage: *.autosticker on/off*\nCurrently: ${current ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (current === val)
      return extra.reply(`😹 Auto Sticker is *already ${state.toUpperCase()}* 💀 Nothing to change here!`);

    database.updateSettings({ autoSticker: val });
    await extra.reply(`✅ *Auto Sticker* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
