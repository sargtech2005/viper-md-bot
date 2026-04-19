/**
 * .freebot — tells users how to get a free bot session  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'freebot',
  aliases: ['getbot', 'pairbot', 'deploy'],
  category: 'general',
  description: 'Get your own free VIPER BOT MD session',
  usage: '.freebot',

  async execute(sock, msg, args, extra) {
    try {
      let t = `┏❐ 《 *🐍 ${sc('get a free bot')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🤖 *${sc('viper bot md')}* — your own WhatsApp bot!\n`;
      t += `┃\n`;
      t += `┣◆ 📲 *${sc('step')} 1:*  Open our Telegram Bot:\n`;
      t += `┃    👉 *https://t.me/vipermdpairbot*\n`;
      t += `┃\n`;
      t += `┣◆ 📱 *${sc('step')} 2:*  Send */pair <your number>*\n`;
      t += `┃    _Example: /pair 2348083086811_\n`;
      t += `┃\n`;
      t += `┣◆ 🔑 *${sc('step')} 3:*  Enter the pair code in\n`;
      t += `┃    WhatsApp → Settings → Linked Devices\n`;
      t += `┃    → Link with phone number instead\n`;
      t += `┃\n`;
      t += `┣◆ ✅ *${sc('done')}!*  Your bot will be live in seconds 🚀\n`;
      t += `┃\n`;
      t += `┣◆ 💡 *${sc('tip')}:* You can also pair directly here by\n`;
      t += `┃   typing *.pair <your number>*\n`;
      t += `┃   _Only works if you are the bot owner._\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
    }
  },
};
