/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  .autoreply — Auto-reply to DMs & mentions           ║
 * ║              using Gemini AI  (VIPER BOT MD)         ║
 * ║                                                      ║
 * ║  .autoreply on/off/status                            ║
 * ║  When ON:                                            ║
 * ║  • Anyone who DMs the bot gets a Gemini AI reply     ║
 * ║  • Anyone who @mentions the bot in a group gets      ║
 * ║    a Gemini AI reply                                 ║
 * ╚══════════════════════════════════════════════════════╝
 */

const database = require('../../database');

module.exports = {
  name: 'autoreply',
  aliases: ['autoai', 'autorepl'],
  category: 'owner',
  ownerOnly: true,
  description: 'Auto-reply to DMs and mentions with Gemini AI',
  usage: '.autoreply on | off | status',

  async execute(sock, msg, args, extra) {
    const sub = (args[0] || '').toLowerCase();

    const current = database.getSetting('autoReply', false);

    if (!sub || sub === 'status') {
      return extra.reply(
        `🤖 *Auto-Reply Status*\n\n` +
        `Status: ${current ? '✅ *ON*' : '❌ *OFF*'}\n\n` +
        `When enabled, the bot replies automatically to:\n` +
        `• 💬 Direct messages (DMs)\n` +
        `• 📢 @mentions in groups\n\n` +
        `Commands:\n` +
        `\`\`\`\n` +
        `.autoreply on\n` +
        `.autoreply off\n` +
        `.autoreply status\n` +
        `\`\`\``
      );
    }

    if (sub === 'on') {
      database.updateSettings({ autoReply: true });
      return extra.reply(
        '✅ *Auto-Reply enabled!*\n\n' +
        '🤖 The bot will now reply automatically to:\n' +
        '• 💬 All direct messages (DMs)\n' +
        '• 📢 @mentions in groups\n\n' +
        '```\n' +
        'Mode    : AUTO-REPLY ON\n' +
        'Engine  : Gemini AI 🤖\n' +
        'Trigger : DMs + @mentions\n' +
        '```'
      );
    }

    if (sub === 'off') {
      database.updateSettings({ autoReply: false });
      return extra.reply(
        '❌ *Auto-Reply disabled.*\n\n' +
        '```\n' +
        'Mode    : AUTO-REPLY OFF\n' +
        'Status  : Bot will no longer auto-reply\n' +
        '```'
      );
    }

    return extra.reply(
      '⚠️ *Invalid subcommand*\n\n' +
      '```\nUsage: .autoreply on | off | status\n```'
    );
  },
};
