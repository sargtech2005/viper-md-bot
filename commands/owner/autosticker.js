/**
 * .autosticker — toggle auto sticker conversion (per-session)
 *
 * When ON, every image or video sent in the chat is automatically
 * converted into a WhatsApp sticker and sent back — no command needed.
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'autosticker',
  aliases: ['stickertoggle'],
  category: 'owner',
  description: 'Auto-convert all received images/videos into stickers',
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
