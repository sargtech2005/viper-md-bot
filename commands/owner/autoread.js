/**
 * .autoread — toggle auto read receipts  (VIPER BOT MD)
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
  name: 'autoread',
  aliases: ['autoreadreceipts', 'readreceipts'],
  category: 'owner',
  description: 'Toggle auto read receipts on/off',
  usage: '.autoread on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const state = args[0]?.toLowerCase();
    if (!state || !['on','off'].includes(state))
      return extra.reply(`😅 *on* or *off* — pick one!\nUsage: *.autoread on/off*\nCurrently: ${config.autoRead ? '🟢 ON' : '🔴 OFF'}`);

    const val = state === 'on';
    if (config.autoRead === val)
      return extra.reply(`😹 Auto Read is *already ${state.toUpperCase()}* 💀 Nothing changed!`);

    config.autoRead = val;
    saveConfig('autoRead', val);
    await extra.reply(`✅ *Auto Read Receipts* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
