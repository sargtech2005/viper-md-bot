/**
 * .chfl — Follow a WhatsApp Channel (newsletter)
 *
 * Usage: .chfl <channel_link>
 * Example: .chfl https://whatsapp.com/channel/0029VaXXX
 *
 * What it does:
 *   - Resolves channel link → newsletter JID
 *   - Bot follows/subscribes to the channel
 *   - Shows channel name, subscriber count, and JID
 *
 * Note: WhatsApp does not expose an API to force other users to follow
 * a channel — only the bot itself can follow. This command makes
 * the bot a follower of that channel (needed before .chreact too).
 *
 * .chfl unfollow <channel_link>  →  unfollow the channel
 * .chfl info <channel_link>      →  show channel info without following
 */

module.exports = {
  name: 'chfl',
  aliases: ['chanfollow', 'chfollow', 'channelfollow'],
  category: 'owner',
  description: 'Follow/unfollow a WhatsApp channel',
  usage: '.chfl <channel_link>  |  .chfl unfollow <link>  |  .chfl info <link>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        return extra.reply(
          `📢 *Channel Follow*\n\n` +
          `*Follow a channel:*\n\`.chfl https://whatsapp.com/channel/0029Va...\`\n\n` +
          `*Unfollow a channel:*\n\`.chfl unfollow https://whatsapp.com/channel/0029Va...\`\n\n` +
          `*Channel info only:*\n\`.chfl info https://whatsapp.com/channel/0029Va...\`\n\n` +
          `> Following is required before using .chreact on a channel.`
        );
      }

      // ── Parse sub-command ─────────────────────────────────────────────────
      let action = 'follow';
      let linkArg = args[0];

      if (['unfollow', 'info'].includes(args[0].toLowerCase())) {
        action = args[0].toLowerCase();
        linkArg = args[1];
        if (!linkArg) {
          return extra.reply(`❌ Please provide a channel link after \`.chfl ${action}\``);
        }
      }

      // ── Extract invite code ───────────────────────────────────────────────
      const inviteCode = extractInviteCode(linkArg);
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

      // ── Info only ─────────────────────────────────────────────────────────
      if (action === 'info') {
        return extra.reply(
          `📢 *Channel Info*\n\n` +
          `📛 *Name:* ${channelName}${description}\n` +
          `👥 *Subscribers:* ${subCount}\n` +
          `🆔 *JID:* \`${channelJid}\`\n` +
          `🔗 *Invite Code:* \`${inviteCode}\``
        );
      }

      // ── Unfollow ──────────────────────────────────────────────────────────
      if (action === 'unfollow') {
        try {
          await sock.newsletterUnfollow(channelJid);
          return extra.reply(
            `✅ *Unfollowed channel*\n\n` +
            `📛 *Name:* ${channelName}\n` +
            `🆔 JID: \`${channelJid}\``
          );
        } catch (e) {
          return extra.reply(`❌ Failed to unfollow: ${e.message}`);
        }
      }

      // ── Follow ────────────────────────────────────────────────────────────
      try {
        await sock.newsletterFollow(channelJid);
      } catch (e) {
        // Might already be following — not fatal
        if (!e.message?.includes('already')) {
          console.warn('[chfl] Follow warning:', e.message);
        }
      }

      let picMsg = null;
      if (meta.picture || meta.image) {
        picMsg = {
          image: { url: meta.picture || meta.image },
          caption:
            `✅ *Bot is now following this channel!*\n\n` +
            `📛 *Name:* ${channelName}${description}\n` +
            `👥 *Subscribers:* ${subCount}\n` +
            `🆔 *JID:* \`${channelJid}\`\n\n` +
            `> Use \`.chreact ${linkArg} 10 🔥💯\` to react to posts.\n` +
            `> Use \`.chfl unfollow ${linkArg}\` to unfollow.`,
        };
      }

      if (picMsg) {
        await sock.sendMessage(extra.from, picMsg, { quoted: msg });
      } else {
        await extra.reply(
          `✅ *Bot is now following this channel!*\n\n` +
          `📛 *Name:* ${channelName}${description}\n` +
          `👥 *Subscribers:* ${subCount}\n` +
          `🆔 *JID:* \`${channelJid}\`\n\n` +
          `> Use \`.chreact ${linkArg} 10 🔥💯\` to react to posts.\n` +
          `> Use \`.chfl unfollow ${linkArg}\` to unfollow.`
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
