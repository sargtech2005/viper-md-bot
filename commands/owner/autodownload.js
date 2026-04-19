/**
 * .autodownload — toggle auto media download  (VIPER BOT MD)
 */
const config = require('../../config');
const fs     = require('fs');
const path   = require('path');

function saveConfig(key, value) {
  try {
    const p = path.join(__dirname, '../../config.js');
    let s = fs.readFileSync(p, 'utf8');
    s = s.replace(new RegExp(`(${key}:\\s*)(true|false)`), `$1${value}`);
    fs.writeFileSync(p, s, 'utf8');
    delete require.cache[require.resolve('../../config')];
  } catch (_) {}
}

module.exports = {
  name: 'autodownload',
  aliases: ['autodl', 'autosave'],
  category: 'owner',
  description: 'Toggle auto download media on/off',
  usage: '.autodownload on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const state = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 *on* or *off* — don't leave me guessing!\nUsage: *.autodownload on/off*\nCurrently: ${config.autoDownload ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (config.autoDownload === val)
      return extra.reply(`😹 Auto Download is *already ${state.toUpperCase()}* 💀 Try something different na!`);

    config.autoDownload = val;
    saveConfig('autoDownload', val);
    await extra.reply(`✅ *Auto Download* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
