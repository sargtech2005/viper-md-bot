const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');
const startTime = Date.now();
module.exports = {
  name: 'uptime', aliases: ['up'],
  category: 'general', description: 'Check bot uptime', usage: '.uptime',
  async execute(sock, msg, args, extra) {
    try {
      const ms    = Date.now() - startTime;
      const secs  = Math.floor(ms/1000);
      const mins  = Math.floor(secs/60);
      const hrs   = Math.floor(mins/60);
      const days  = Math.floor(hrs/24);
      let t = `⏱️ *${sc('bot uptime')}*\n\n`;
      t += `📅 ${sc('days')}: ${days}\n`;
      t += `🕐 ${sc('hours')}: ${hrs%24}\n`;
      t += `⏱️ ${sc('minutes')}: ${mins%60}\n`;
      t += `⚡ ${sc('seconds')}: ${secs%60}\n\n`;
      t += `💪 ${config.botName} has been grinding non-stop 😤`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
