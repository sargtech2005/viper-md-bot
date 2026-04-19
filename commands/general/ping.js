const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'ping',
  category: 'general', description: 'Check bot response time', usage: '.ping',
  async execute(sock, msg, args, extra) {
    const start = Date.now();
    try {
      const m = await extra.reply('🏓 Pinging...');
      const ms = Date.now() - start;
      const quality = ms < 300 ? '🟢 Lightning fast!' : ms < 800 ? '🟡 Decent' : '🔴 Lagging';
      let t = `🏓 *${sc('pong')}!*\n\n`;
      t += `⚡ ${sc('speed')}: *${ms}ms*\n`;
      t += `📶 ${sc('status')}: ${quality}\n`;
      t += `🤖 ${sc('bot')}: Online & flexing 💪`;
      await sock.sendMessage(extra.from, { text: t }, { quoted: msg });
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
