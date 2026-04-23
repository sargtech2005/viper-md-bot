/**
 * Block / Unblock — robust target resolution
 * Supports: mention, quoted reply, plain number, or current DM chat
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
          'Usage:\n' +
          '• `.block @mention`\n' +
          '• Reply to a message + `.block`\n' +
          '• `.block 2348012345678`'
        );
      }

      await sock.updateBlockStatus(target, 'block');

      await sock.sendMessage(extra.from, {
        text: `✅ @${target.split('@')[0]} has been blocked!`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`❌ Block failed: ${error.message}`);
    }
  }
};

function resolveTarget(msg, args) {
  // 1. Mention
  const ctx = msg.message?.extendedTextMessage?.contextInfo
           || msg.message?.imageMessage?.contextInfo
           || msg.message?.videoMessage?.contextInfo
           || msg.message?.documentMessage?.contextInfo
           || msg.message?.audioMessage?.contextInfo;

  const mentioned = ctx?.mentionedJid;
  if (mentioned?.length) return mentioned[0];

  // 2. Quoted reply
  if (ctx?.participant && ctx?.stanzaId) return ctx.participant;

  // 3. Plain number in args
  if (args[0]) {
    const num = args[0].replace(/[^0-9]/g, '');
    if (num.length >= 7) return `${num}@s.whatsapp.net`;
  }

  // 4. Current DM chat
  const from = msg.key.remoteJid;
  if (from && !from.endsWith('@g.us') && !from.includes('broadcast')) return from;

  return null;
}
