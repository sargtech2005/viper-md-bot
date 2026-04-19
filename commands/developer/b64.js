/**
 * .b64 encode|decode <text>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'b64',
  aliases: ['base64'],
  category: 'developer',
  description: 'Base64 encode or decode text',
  usage: '.b64 encode|decode <text>',

  async execute(sock, msg, args, extra) {
    const mode = (args[0] || '').toLowerCase();
    const text = args.slice(1).join(' ');

    if (!['encode', 'decode'].includes(mode) || !text) {
      return extra.reply(
        `🤦 Give me a mode and text!\n` +
        `Usage: *.b64 encode|decode <text>*\n` +
        `Examples:\n` +
        `  *.b64 encode hello world*\n` +
        `  *.b64 decode aGVsbG8gd29ybGQ=*`
      );
    }

    try {
      let result;
      if (mode === 'encode') {
        result = Buffer.from(text, 'utf8').toString('base64');
      } else {
        const decoded = Buffer.from(text, 'base64').toString('utf8');
        // Sanity: re-encode and check if original matches
        if (Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '') !== text.replace(/=+$/, ''))
          return extra.reply(`😅 That doesn't look like valid Base64 to me 🤷`);
        result = decoded;
      }

      let t = `┏❐ 《 *🔤 ${sc('base64')} ${mode.toUpperCase()}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📥 *Input*:\n┃    \`${text.length > 200 ? text.slice(0, 200) + '…' : text}\`\n`;
      t += `┃\n`;
      t += `┣◆ 📤 *Output*:\n┃    \`${result.length > 600 ? result.slice(0, 600) + '…' : result}\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 ${mode === 'decode' ? 'Invalid Base64 string' : e.message} 😭`);
    }
  },
};
