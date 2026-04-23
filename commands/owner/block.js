/**
 * Block / Unblock — with full JID validation and error handling
 */
module.exports = {
  name: 'block',
  aliases: ['blk'],
  category: 'owner',
  description: 'Block a user',
  usage: '.block @user | reply | number',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const target = resolveTarget(msg, args);
      if (!target) {
        return extra.reply(
          '❌ No target found.\n\n' +
          '*Usage:*\n' +
          '• `.block @mention`\n' +
          '• Reply to any message + `.block`\n' +
          '• `.block 2348012345678`'
        );
      }

      // Guard: can't block a group JID
      if (target.endsWith('@g.us')) {
        return extra.reply('❌ Cannot block a group. Target must be a user.');
      }

      // Guard: can't block yourself
      const botNum = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
      if (botNum && target.startsWith(botNum)) {
        return extra.reply('❌ Cannot block the bot itself.');
      }

      // Verify the number exists on WhatsApp before blocking
      // This prevents the "bad request" from blocking a non-WA number
      try {
        const [result] = await sock.onWhatsApp(target.split('@')[0]);
        if (!result?.exists) {
          return extra.reply(`❌ *+${target.split('@')[0]}* is not on WhatsApp.`);
        }
        // Use the JID returned by onWhatsApp — it's always correct format
        const confirmedJid = result.jid;
        await sock.updateBlockStatus(confirmedJid, 'block');
        return await sock.sendMessage(extra.from, {
          text: `✅ @${confirmedJid.split('@')[0]} has been blocked!`,
          mentions: [confirmedJid],
        }, { quoted: msg });
      } catch (blockErr) {
        // If onWhatsApp fails (network), try direct block anyway
        if (blockErr.message?.includes('not on WhatsApp')) throw blockErr;
        await sock.updateBlockStatus(target, 'block');
        return await sock.sendMessage(extra.from, {
          text: `✅ @${target.split('@')[0]} has been blocked!`,
          mentions: [target],
        }, { quoted: msg });
      }

    } catch (error) {
      const msg2 = error.message || '';
      if (msg2.includes('bad-request') || msg2.includes('Bad Request') || msg2.includes('400')) {
        return extra.reply(
          '❌ Block failed — number not found on WhatsApp or invalid.\n\n' +
          'Make sure the number is correct and active on WhatsApp.'
        );
      }
      await extra.reply(`❌ Block failed: ${error.message}`);
    }
  }
};

function resolveTarget(msg, args) {
  const m = msg.message || {};

  // Check contextInfo from all possible message types
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.buttonsResponseMessage?.contextInfo ||
    m.listResponseMessage?.contextInfo;

  // 1. Quoted reply — participant is the sender of the quoted message
  if (ctx?.participant) return normaliseJid(ctx.participant);

  // 2. Mention
  const mentioned = ctx?.mentionedJid;
  if (Array.isArray(mentioned) && mentioned.length) return normaliseJid(mentioned[0]);

  // 3. Plain number in args
  if (args[0]) {
    const num = args[0].replace(/[^0-9]/g, '');
    if (num.length >= 7) return `${num}@s.whatsapp.net`;
  }

  // 4. Current DM chat (e.g. bot is replying inside someone's DM)
  const from = msg.key.remoteJid;
  if (from && !from.endsWith('@g.us') && !from.includes('broadcast') && !from.includes('newsletter')) {
    return normaliseJid(from);
  }

  return null;
}

function normaliseJid(jid) {
  if (!jid) return null;
  // Strip device suffix e.g. 234801234567:5@s.whatsapp.net → 234801234567@s.whatsapp.net
  const clean = jid.replace(/:.*@/, '@');
  if (!clean.includes('@')) return `${clean.replace(/\D/g, '')}@s.whatsapp.net`;
  return clean;
}
