const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'tagall', aliases: ['everyone', 'all'],
  category: 'admin', description: 'Tag all group members', usage: '.tagall <message>',
  groupOnly: true, adminOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      const participants = extra.groupMetadata?.participants || [];
      const mentions = participants.map(p => p.id);
      const customMsg = args.join(' ') || '📢 Oi everyone, admin needs your attention!';
      let t = `📢 *${sc('attention all')}!*\n\n`;
      t += `${customMsg}\n\n`;
      participants.forEach(p => { t += `@${p.id.split('@')[0]} `; });
      await sock.sendMessage(extra.from, { text: t, mentions }, { quoted: msg });
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
