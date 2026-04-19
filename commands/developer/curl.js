/**
 * .curl <url> [method] [body]  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'curl',
  aliases: ['http', 'request', 'httpreq'],
  category: 'developer',
  description: 'Make a GET/POST HTTP request and see the response',
  usage: '.curl <url> [GET|POST|PUT|DELETE] [body json]',

  async execute(sock, msg, args, extra) {
    let url    = args[0];
    const method = (args[1] || 'GET').toUpperCase();
    const body   = args.slice(2).join(' ') || null;

    if (!url) return extra.reply(
      `🤦 Give me a URL!\n` +
      `Usage: *.curl <url> [method] [body]*\n` +
      `Examples:\n` +
      `  *.curl https://httpbin.org/get*\n` +
      `  *.curl https://httpbin.org/post POST {"key":"val"}*`
    );

    if (!url.startsWith('http')) url = 'https://' + url;
    const VALID_METHODS = ['GET','POST','PUT','PATCH','DELETE','HEAD'];
    if (!VALID_METHODS.includes(method)) {
      return extra.reply(`❌ Invalid method *${method}*\nValid: ${VALID_METHODS.join(', ')}`);
    }

    await extra.reply(`📨 Sending *${method}* to \`${url}\`...`);

    try {
      let parsedBody = null;
      if (body) {
        try { parsedBody = JSON.parse(body); }
        catch { parsedBody = body; }
      }

      const start = Date.now();
      const res   = await axios({
        method,
        url,
        data:    parsedBody,
        timeout: 12000,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'ViperBotMD/2.7 curl-tool',
          ...(parsedBody ? { 'Content-Type': 'application/json' } : {}),
        },
        maxRedirects: 5,
      });
      const ms = Date.now() - start;

      const statusEmoji = res.status < 300 ? '🟢' : res.status < 400 ? '🟡' : '🔴';
      let responseBody = '';
      if (typeof res.data === 'object') {
        responseBody = JSON.stringify(res.data, null, 2);
      } else {
        responseBody = String(res.data || '');
      }
      const truncated = responseBody.length > 1500;
      const display   = responseBody.slice(0, 1500) + (truncated ? '\n…(truncated)' : '');

      let t = `┏❐ 《 *📨 ${sc('curl')} — ${method}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *URL*: \`${url}\`\n`;
      t += `┣◆ ${statusEmoji} *Status*: \`${res.status} ${res.statusText}\`\n`;
      t += `┣◆ ⚡ *Time*: \`${ms}ms\`\n`;
      t += `┣◆ 📦 *Content-Type*: \`${res.headers['content-type'] || '–'}\`\n`;
      if (body) t += `┣◆ 📤 *Body sent*: \`${body.slice(0, 100)}\`\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *Response*:\n`;
      t += `\`\`\`\n${display}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      const isTimeout = e.code === 'ECONNABORTED' || e.message.includes('timeout');
      await extra.reply(isTimeout
        ? `⏱️ Request timed out! *${url}* took too long 💀`
        : `💀 Request failed: \`${e.message}\``
      );
    }
  },
};
