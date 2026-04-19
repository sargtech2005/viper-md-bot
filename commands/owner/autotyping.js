/**
 * .autotyping — toggle auto-typing indicator  (VIPER BOT MD)
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
  name: 'autotyping',
  aliases: ['autotyping', 'typing'],
  category: 'owner',
  description: 'Toggle auto typing indicator on/off',
  usage: '.autotyping on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const state = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 Tell me *on* or *off* na!\nUsage: *.autotyping on/off*\nCurrently: ${config.autoTyping ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (config.autoTyping === val)
      return extra.reply(`😹 Auto typing is *already ${state.toUpperCase()}* bruh 💀 Nothing changed!`);

    config.autoTyping = val;
    saveConfig('autoTyping', val);
    await extra.reply(`✅ *Auto Typing* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
