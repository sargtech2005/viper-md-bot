/**
 * .ownerinfo — show bot owner contact card  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc }  = require('../../utils/categoryMenu');

module.exports = {
  name: 'ownerinfo',
  aliases: ['creator', 'whosmyboss'],
  category: 'owner',
  description: 'Show bot owner info & contact',
  usage: '.ownerinfo',
  ownerOnly: false,   // anyone can see who the boss is 😎

  async execute(sock, msg, args, extra) {
    try {
      let t = `👑 *${sc('bot owner')}*\n\n`;
      t += `┣◆ 🧑 *Sarg-Tech* _(a.k.a Viper)_\n`;
      t += `┣◆ 📱 wa.me/${config.ownerNumber[0]}\n`;
      t += `┣◆ 📱 wa.me/${config.ownerNumber[1]}\n`;
      t += `┣◆ 🐙 github.com/remzytech001\n`;
      t += `┣◆ 🐙 github.com/sargtech1\n`;
      t += `┃\n`;
      t += `┣◆ 🤖 *Bot*: ${config.botName} v${config.botVersion}\n`;
      t += `┣◆ 📡 *Channel*: ${config.social?.channel || 'N/A'}\n`;
      t += `┗❐\n\n`;
      t += `> ${config.botName} 🐍 — *built different* 😎`;
      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 Bruh something crashed: ${e.message} 😭`);
    }
  },
};
