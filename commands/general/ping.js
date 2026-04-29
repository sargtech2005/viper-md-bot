const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'ping',
  category: 'general',
  description: 'Check bot response time',
  usage: '.ping',
  async execute(sock, msg, args, extra) {
    // t0 recorded the instant this function is called — before any reply
    const t0 = Date.now();

    // Send the first reply — this measures WA round-trip latency
    await sock.sendMessage(extra.from, { text: '🏓 ...' }, { quoted: msg });
    const rtt = Date.now() - t0;

    // Quality tiers
    const quality =
      rtt < 200  ? '🟢 Ultra-fast'   :
      rtt < 500  ? '🟢 Fast'         :
      rtt < 1000 ? '🟡 Normal'       :
                   '🔴 Slow — check connection';

    const uptime  = process.uptime();
    const uptimeStr =
      uptime < 60    ? `${Math.floor(uptime)}s` :
      uptime < 3600  ? `${Math.floor(uptime/60)}m ${Math.floor(uptime%60)}s` :
                       `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m`;

    const mem   = process.memoryUsage();
    const memMB = (mem.heapUsed / 1024 / 1024).toFixed(1);

    const text =
      `🏓 *${sc ? sc('pong') : 'Pong'}!*\n\n` +
      `⚡ *Latency*  : \`${rtt}ms\`\n` +
      `📶 *Status*   : ${quality}\n` +
      `⏱️ *Uptime*   : ${uptimeStr}\n` +
      `🧠 *Memory*   : ${memMB} MB\n` +
      `🤖 *Bot*      : Online 🐍`;

    await sock.sendMessage(extra.from, { text }, { quoted: msg });
  },
};
