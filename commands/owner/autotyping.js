/**
 * .autotyping — toggle auto-typing indicator (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'autotyping',
  aliases: ['typing'],
  category: 'owner',
  description: 'Toggle auto typing indicator on/off',
  usage: '.autotyping on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const current = database.getSetting('autoTyping', config.autoTyping);
    const state   = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 Tell me *on* or *off* na!\nUsage: *.autotyping on/off*\nCurrently: ${current ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (current === val)
      return extra.reply(`😹 Auto typing is *already ${state.toUpperCase()}* bruh 💀 Nothing changed!`);

    database.updateSettings({ autoTyping: val });
    await extra.reply(`✅ *Auto Typing* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
