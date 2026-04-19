const database = require('../../database');
const config   = require('../../config');
const { sc }   = require('../../utils/categoryMenu');

module.exports = {
  name: 'warn', aliases: ['warning'],
  category: 'admin', description: 'Warn a user', usage: '.warn @user <reason>',
  groupOnly: true, adminOnly: true, botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      if (mentioned.length > 0) target = mentioned[0];
      else if (ctx?.participant && ctx.stanzaId) target = ctx.participant;
      else return extra.reply(`❌ Tag someone or reply to them!\n_Usage: .warn @user reason_`);

      const reason = args.slice(mentioned.length > 0 ? 1 : 0).join(' ') || 'Just vibing wrong 😂';
      const isAdmin = extra.groupMetadata?.participants?.find(
        p => (p.id === target || p.lid === target) && p.admin
      );
      if (isAdmin) return extra.reply('❌ Can\'t warn an admin bestie 😭');

      const warnings = database.addWarning(extra.from, target, reason);
      const emojis   = ['😤','😡','⚡','🔥','💀'];
      const emoji    = emojis[Math.min(warnings.count - 1, 4)];

      let t = `${emoji} *${sc('warning issued')}!*\n\n`;
      t += `👤 ${sc('target')}: @${target.split('@')[0]}\n`;
      t += `📝 ${sc('reason')}: ${reason}\n`;
      t += `⚠️  ${sc('strikes')}: ${warnings.count}/${config.maxWarnings}\n\n`;

      if (warnings.count >= config.maxWarnings) {
        t += `💀 *You have collected all ${config.maxWarnings} warnings. BYEEEEE!* 👋`;
        await sock.sendMessage(extra.from, { text: t, mentions: [target] }, { quoted: msg });
        if (extra.isBotAdmin) {
          await sock.groupParticipantsUpdate(extra.from, [target], 'remove');
          database.clearWarnings(extra.from, target);
        }
      } else {
        const left = config.maxWarnings - warnings.count;
        t += `😬 ${left} more warning${left > 1 ? 's' : ''} and you're out of here!`;
        await sock.sendMessage(extra.from, { text: t, mentions: [target] }, { quoted: msg });
      }
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
