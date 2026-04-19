/**
 * .apitest <url> [method] [body]  (VIPER BOT MD)
 * Like .curl but focused on JSON REST APIs with cleaner output.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const axios  = require('axios');

module.exports = {
  name: 'apitest',
  aliases: ['resttest', 'endpoint'],
  category: 'developer',
  description: 'Test a REST API endpoint with JSON response formatting',
  usage: '.apitest <url> [GET|POST|PUT|DELETE] [json body]',

  async execute(sock, msg, args, extra) {
    let url    = args[0];
    const method = (args[1] || 'GET').toUpperCase();
    const body   = args.slice(2).join(' ') || null;

    if (!url) return extra.reply(
      `🧪 Give me an API endpoint!\n` +
      `Usage: *.apitest <url> [method] [body]*\n` +
      `Example: *.apitest https://api.github.com/users/octocat*`
    );

    if (!url.startsWith('http')) url = 'https://' + url;

    const VALID = ['GET','POST','PUT','PATCH','DELETE'];
    if (!VALID.includes(method)) {
      return extra.reply(`❌ Invalid method. Use: ${VALID.join(', ')}`);
    }

    await extra.reply(`🧪 Testing *${method}* → \`${url}\`...`);

    try {
      let parsedBody = null;
      if (body) {
        try { parsedBody = JSON.parse(body); }
        catch { return extra.reply(`❌ Body is not valid JSON: \`${body.slice(0, 100)}\``); }
      }

      const start = Date.now();
      const res   = await axios({
        method,
        url,
        data:    parsedBody,
        timeout: 15000,
        validateStatus: () => true,
        headers: {
          'User-Agent':   'ViperBotMD/2.7 api-tester',
          'Accept':       'application/json',
          'Content-Type': 'application/json',
        },
      });
      const ms = Date.now() - start;

      const isJson   = (res.headers['content-type'] || '').includes('json');
      const statusOk = res.status >= 200 && res.status < 300;
      const statusEmoji = statusOk ? '🟢' : res.status < 500 ? '🟡' : '🔴';

      let body_out = '';
      if (typeof res.data === 'object') {
        body_out = JSON.stringify(res.data, null, 2);
      } else {
        body_out = String(res.data || '');
      }
      const trunc   = body_out.length > 1800;
      const display = body_out.slice(0, 1800) + (trunc ? '\n…(truncated)' : '');

      let t = `┏❐ 《 *🧪 ${sc('api test')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🌐 *Endpoint*: \`${url.slice(0, 80)}\`\n`;
      t += `┣◆ 🔀 *Method*: \`${method}\`\n`;
      t += `┣◆ ${statusEmoji} *Status*: \`${res.status} ${res.statusText}\`\n`;
      t += `┣◆ ⚡ *Response time*: \`${ms}ms\`\n`;
      t += `┣◆ 📦 *Content-Type*: \`${res.headers['content-type'] || '–'}\`\n`;
      if (parsedBody) t += `┣◆ 📤 *Request body*: \`${JSON.stringify(parsedBody).slice(0, 80)}\`\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *Response body*:\n`;
      t += `\`\`\`\n${display}\n\`\`\`\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 API test failed: \`${e.message}\``);
    }
  },
};
