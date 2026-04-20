/**
 * .autoread — toggle auto read receipts (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'autoread',
  aliases: ['autoreadreceipts', 'readreceipts'],
  category: 'owner',
  description: 'Toggle auto read receipts on/off',
  usage: '.autoread on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const current = database.getSetting('autoRead', config.autoRead);
    const state   = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 *on* or *off* — pick one!\nUsage: *.autoread on/off*\nCurrently: ${current ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (current === val)
      return extra.reply(`😹 Auto Read is *already ${state.toUpperCase()}* 💀 Nothing changed!`);

    database.updateSettings({ autoRead: val });
    await extra.reply(`✅ *Auto Read Receipts* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
