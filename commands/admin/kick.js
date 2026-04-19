const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'kick', aliases: ['remove'],
  category: 'admin', description: 'Kick a user', usage: '.kick @user',
  groupOnly: true, adminOnly: true, botAdminNeeded: true,
  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const target = ctx?.mentionedJid?.[0] || (ctx?.participant && ctx.stanzaId ? ctx.participant : null);
      if (!target) return extra.reply('❌ Tag or reply to someone to kick!');

      const isAdmin = extra.groupMetadata?.participants?.find(
        p => (p.id === target || p.lid === target) && p.admin
      );
      if (isAdmin) return extra.reply('🛡️ Can\'t kick an admin bruv 😂');

      let t = `👢 *${sc('kicked out')}!*\n\n`;
      t += `👤 @${target.split('@')[0]} has been BOOTED from the group 😂\n`;
      t += `🚪 Don\'t let the door hit you on the way out!`;
      await sock.sendMessage(extra.from, { text: t, mentions: [target] }, { quoted: msg });
      await sock.groupParticipantsUpdate(extra.from, [target], 'remove');
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
