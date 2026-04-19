/**
 * .webstatus — is a website up or down?  (VIPER BOT MD)
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'webstatus',
  aliases: ['updown', 'isup', 'isdown', 'sitecheck'],
  category: 'developer',
  description: 'Check if a website is up or down',
  usage: '.webstatus <url>',

  async execute(sock, msg, args, extra) {
    let url = args[0];
    if (!url) return extra.reply(
      `🤦 Give me a URL to check na! 😂\nUsage: *.webstatus <url>*\nExample: .webstatus google.com`
    );
    if (!url.startsWith('http')) url = 'https://' + url;

    try {
      await extra.reply(`📡 Knocking on *${url}*'s door... 👀`);
      const start = Date.now();
      const res   = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,   // don't throw on 4xx/5xx
        headers: { 'User-Agent': 'ViperBotMD/2.7 status-checker' },
      });
      const ms    = Date.now() - start;
      const code  = res.status;
      const ok    = code >= 200 && code < 400;

      const badge = ok ? '🟢 *UP*' : '🔴 *DOWN/ERROR*';
      const funny = ok
        ? ['😎 Site is alive and flexing!', '✅ Up and running like a champ!', '🎉 Online! No cap!'][Math.floor(Math.random()*3)]
        : ['💀 Site is deader than my WiFi signal!', '😭 Somebody call an ambulance!', '🪦 RIP to that website fr fr'][Math.floor(Math.random()*3)];

      let t = `┏❐ 《 *📡 ${sc('web status')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *URL*: ${url}\n`;
      t += `┣◆ 🚦 *Status*: ${badge}\n`;
      t += `┣◆ 🔢 *HTTP Code*: ${code}\n`;
      t += `┣◆ ⚡ *Response*: ${ms}ms\n`;
      t += `┣◆ 😂 *Vibe*: ${funny}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      const isTimeout = e.code === 'ECONNABORTED' || e.message.includes('timeout');
      const msg2 = isTimeout
        ? `⏱️ *${url}* timed out! Either it's down or too slow to care 💀`
        : `💀 Can't reach *${url}*: ${e.message} 😭\nLooks like it's DOWN to me 🪦`;
      await extra.reply(msg2);
    }
  },
};
