/**
 * .chfl — Send followers to a WhatsApp Channel (newsletter)
 *
 * Usage: .chfl <channel_link>
 * Example: .chfl https://whatsapp.com/channel/0029VaXXX
 *
 * What it does:
 *   - Resolves channel link → newsletter JID
 *   - Bot follows/subscribes to the channel
 *   - Shows channel name, subscriber count, and JID
 */

module.exports = {
  name: 'chfl',
  aliases: ['chanfollow', 'chfollow', 'channelfollow'],
  category: 'owner',
  description: 'Send followers to a WhatsApp channel',
  usage: '.chfl <channel_link>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        return extra.reply(
          `📢 *Channel Followers*\n\n` +
          `*Usage:*\n\`.chfl https://whatsapp.com/channel/0029Va...\`\n\n` +
          `Sends followers to the specified WhatsApp channel.`
        );
      }

      // ── Extract invite code ───────────────────────────────────────────────
      const inviteCode = extractInviteCode(args[0]);
      if (!inviteCode) {
        return extra.reply(
          `❌ Could not parse channel link.\n\n` +
          `Expected: \`https://whatsapp.com/channel/0029Va...\``
        );
      }

      await extra.reply(`🔍 Looking up channel...`);

      // ── Fetch metadata ────────────────────────────────────────────────────
      let meta;
      try {
        meta = await sock.newsletterMetadata('invite', inviteCode);
      } catch (e) {
        return extra.reply(
          `❌ Channel not found: ${e.message}\n\nCheck the link is valid and the channel is public.`
        );
      }

      const channelJid  = meta.id;
      const channelName = meta.name || 'Unknown';
      const subCount    = meta.subscriberCount !== undefined
        ? Number(meta.subscriberCount).toLocaleString()
        : 'N/A';
      const description = meta.description ? `\n📝 ${meta.description}` : '';

      // ── Follow the channel ────────────────────────────────────────────────
      try {
        await sock.newsletterFollow(channelJid);
      } catch (e) {
        if (!e.message?.includes('already')) {
          console.warn('[chfl] Follow warning:', e.message);
        }
      }

      // ── Reply ─────────────────────────────────────────────────────────────
      let picMsg = null;
      if (meta.picture || meta.image) {
        picMsg = {
          image: { url: meta.picture || meta.image },
          caption:
            `✅ *Followers sent to channel!*\n\n` +
            `📛 *Name:* ${channelName}${description}\n` +
            `👥 *Subscribers:* ${subCount}\n` +
            `🆔 *JID:* \`${channelJid}\``,
        };
      }

      if (picMsg) {
        await sock.sendMessage(extra.from, picMsg, { quoted: msg });
      } else {
        await extra.reply(
          `✅ *Followers sent to channel!*\n\n` +
          `📛 *Name:* ${channelName}${description}\n` +
          `👥 *Subscribers:* ${subCount}\n` +
          `🆔 *JID:* \`${channelJid}\``
        );
      }

    } catch (error) {
      console.error('[chfl] Error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractInviteCode(link) {
  try {
    link = link.trim().split('?')[0].split('#')[0];
    const patterns = [
      /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]+)/i,
      /\/channel\/([A-Za-z0-9_-]+)/i,
    ];
    for (const p of patterns) {
      const m = link.match(p);
      if (m?.[1]) return m[1];
    }
    if (/^[A-Za-z0-9_-]{10,}$/.test(link)) return link;
    return null;
  } catch (_) {
    return null;
  }
}
