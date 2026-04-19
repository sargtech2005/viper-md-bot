const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'promote',
  category: 'admin', description: 'Promote a user to admin', usage: '.promote @user',
  groupOnly: true, adminOnly: true, botAdminNeeded: true,
  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const target = ctx?.mentionedJid?.[0] || (ctx?.participant && ctx.stanzaId ? ctx.participant : null);
      if (!target) return extra.reply('❌ Tag someone to promote!');
      await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
      let t = `🎖️ *${sc('new admin alert')}!*\n\n`;
      t += `🥳 Congrats @${target.split('@')[0]}!\n`;
      t += `💪 You\'ve been promoted to admin!\n`;
      t += `🙏 Don\'t let the power corrupt you 😂`;
      await sock.sendMessage(extra.from, { text: t, mentions: [target] }, { quoted: msg });
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
