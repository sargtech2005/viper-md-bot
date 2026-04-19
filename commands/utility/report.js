/**
 * .report — Report a user or issue to the bot owner (VIPER BOT MD)
 * No external API needed — sends directly via WhatsApp to owner
 */
const config = require('../../config');

module.exports = {
  name: 'report',
  aliases: ['reportuser', 'bugreport'],
  category: 'utility',
  description: 'Report a user or issue to the bot owner',
  usage: '.report <message>',

  async execute(sock, msg, args, extra) {
    try {
      const jid    = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const text   = args.join(' ').trim();

      if (!text) {
        return await extra.reply(
          `❌ *Please include a message with your report.*\n\n` +
          `Usage: \`.report <your message>\`\n\n` +
          `Examples:\n` +
          `• \`.report @user is spamming the group\`\n` +
          `• \`.report Bot is not responding to .sticker\``
        );
      }

      const now      = new Date();
      const timeStr  = now.toUTCString();
      const isGroup  = jid.endsWith('@g.us');
      const chatType = isGroup ? '👥 Group' : '👤 Private';

      // ── Build report message for owner ──────────────────
      let ownerMsg = `┏❐ 《 *🚨 NEW REPORT* 》 ❐\n`;
      ownerMsg += `┃\n`;
      ownerMsg += `┣◆ 👤 *From:* @${sender.split('@')[0]}\n`;
      ownerMsg += `┣◆ 💬 *Chat:* ${chatType}\n`;
      if (isGroup) ownerMsg += `┣◆ 🏠 *Group JID:* ${jid}\n`;
      ownerMsg += `┣◆ 🕐 *Time:* ${timeStr}\n`;
      ownerMsg += `┃\n`;
      ownerMsg += `┣◆ 📋 *Report:*\n┃${text}\n`;
      ownerMsg += `┗❐\n\n`;
      ownerMsg += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      // ── Send to all owners ───────────────────────────────
      const ownerNumbers = Array.isArray(config.ownerNumber)
        ? config.ownerNumber
        : [config.ownerNumber];

      let sent = false;
      for (const num of ownerNumbers) {
        try {
          const ownerJid = num.includes('@s.whatsapp.net') ? num : `${num}@s.whatsapp.net`;
          await sock.sendMessage(ownerJid, {
            text: ownerMsg,
            mentions: [sender],
          });
          sent = true;
        } catch (_) {}
      }

      // ── Confirm to reporter ──────────────────────────────
      let reply = `┏❐ 《 *✅ REPORT SENT* 》 ❐\n`;
      reply += `┃\n`;
      reply += `┣◆ 📨 Your report has been sent to the bot owner.\n`;
      reply += `┣◆ ⏳ Please allow some time for a response.\n`;
      reply += `┃\n`;
      reply += `┣◆ 📋 *Your message:*\n┃${text}\n`;
      reply += `┗❐\n\n`;
      reply += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      if (!sent) {
        reply = `⚠️ Report logged but could not reach owner right now.\n\n📋 *Your message:* ${text}`;
      }

      await extra.reply(reply);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
