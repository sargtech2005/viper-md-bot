/**
 * .autodownload — toggle auto media download (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'autodownload',
  aliases: ['autodl', 'autosave'],
  category: 'owner',
  description: 'Toggle auto download media on/off',
  usage: '.autodownload on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const current = database.getSetting('autoDownload', config.autoDownload);
    const state   = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 *on* or *off* — don't leave me guessing!\nUsage: *.autodownload on/off*\nCurrently: ${current ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (current === val)
      return extra.reply(`😹 Auto Download is *already ${state.toUpperCase()}* 💀 Try something different na!`);

    database.updateSettings({ autoDownload: val });
    await extra.reply(`✅ *Auto Download* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
