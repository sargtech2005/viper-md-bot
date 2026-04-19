/**
 * .autosticker — toggle auto sticker mode  (VIPER BOT MD)
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
  name: 'autosticker',
  aliases: ['stickertoggle'],
  category: 'owner',
  description: 'Toggle auto sticker mode on/off',
  usage: '.autosticker on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const state = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 *on* or *off* — make up your mind!\nUsage: *.autosticker on/off*\nCurrently: ${config.autoSticker ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (config.autoSticker === val)
      return extra.reply(`😹 Auto Sticker is *already ${state.toUpperCase()}* 💀 Nothing to change here!`);

    config.autoSticker = val;
    saveConfig('autoSticker', val);
    await extra.reply(`✅ *Auto Sticker* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
