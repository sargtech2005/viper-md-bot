/**
 * .urlencode encode|decode <text>  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'urlencode',
  aliases: ['urlenc', 'urldec', 'percentenc'],
  category: 'developer',
  description: 'URL-encode or URL-decode a string',
  usage: '.urlencode encode|decode <text>',

  async execute(sock, msg, args, extra) {
    const mode = (args[0] || '').toLowerCase();
    const text = args.slice(1).join(' ');

    if (!['encode', 'decode'].includes(mode) || !text) {
      return extra.reply(
        `🤦 Mode and text please!\n` +
        `Usage: *.urlencode encode|decode <text>*\n` +
        `Examples:\n` +
        `  *.urlencode encode hello world & more*\n` +
        `  *.urlencode decode hello%20world%20%26%20more*`
      );
    }

    try {
      const result = mode === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text);
      let t = `┏❐ 《 *🔏 ${sc('url')} ${mode.toUpperCase()}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📥 *Input*:\n┃    \`${text.slice(0, 300)}\`\n`;
      t += `┣◆ 📤 *Output*:\n┃    \`${result.slice(0, 600)}\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 ${mode === 'decode' ? 'Invalid URL-encoded string' : e.message} 😭`);
    }
  },
};
