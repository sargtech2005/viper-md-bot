const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'demote',
  category: 'admin', description: 'Demote an admin', usage: '.demote @user',
  groupOnly: true, adminOnly: true, botAdminNeeded: true,
  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const target = ctx?.mentionedJid?.[0] || (ctx?.participant && ctx.stanzaId ? ctx.participant : null);
      if (!target) return extra.reply('❌ Tag someone to demote!');
      await sock.groupParticipantsUpdate(extra.from, [target], 'demote');
      let t = `📉 *${sc('demotion notice')}!*\n\n`;
      t += `😬 @${target.split('@')[0]} — admin badge revoked!\n`;
      t += `📦 Pack your things, back to member life 😂\n`;
      t += `💀 Ouch.`;
      await sock.sendMessage(extra.from, { text: t, mentions: [target] }, { quoted: msg });
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
