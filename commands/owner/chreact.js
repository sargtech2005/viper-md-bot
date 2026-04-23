/**
 * .chreact — React to a specific channel post with emoji(s)
 *
 * Usage: .chreact <post_link> <amount> <emojis>
 * Example: .chreact https://whatsapp.com/channel/0029VbCbMBtAe5VuprvXah23/137 100 🥰😍
 *
 * - Post link must include the message ID (e.g. /137 at the end)
 * - amount: 1–100
 * - Emojis cycle round-robin across the reactions
 * - 500ms delay between reacts to avoid rate-limit
 */

module.exports = {
  name: 'chreact',
  aliases: ['channelreact', 'creact'],
  category: 'owner',
  description: 'React to a specific channel post with emoji(s)',
  usage: '.chreact <post_link> <amount> <emojis>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (args.length < 3) {
        return extra.reply(
          `⚡ *Channel React*\n\n` +
          `*Usage:* \`.chreact <post_link> <amount> <emojis>\`\n\n` +
          `*Example:*\n\`.chreact https://whatsapp.com/channel/0029VbCbMBtAe5VuprvXah23/137 100 🥰😍\`\n\n` +
          `• Post link: full WhatsApp channel post URL (must include post ID)\n` +
          `• Amount: 1–100 reactions to send\n` +
          `• Emojis: any sequence (cycles round-robin)`
        );
      }

      // ── 1. Parse post link ────────────────────────────────────────────────
      const rawLink = args[0];
      const parsed = extractChannelAndPost(rawLink);
      if (!parsed) {
        return extra.reply(
          `❌ Could not parse post link.\n\n` +
          `Make sure it includes the post ID:\n` +
          `\`https://whatsapp.com/channel/0029Va.../137\``
        );
      }

      const { inviteCode, messageId } = parsed;

      // ── 2. Parse amount ───────────────────────────────────────────────────
      const amount = Math.min(100, Math.max(1, parseInt(args[1], 10) || 1));

      // ── 3. Parse emojis ───────────────────────────────────────────────────
      const emojiStr = args.slice(2).join('');
      const emojis = splitEmojis(emojiStr);
      if (!emojis.length) return extra.reply('❌ No valid emojis provided.');

      await extra.reply(`🔗 Resolving channel...`);

      // ── 4. Fetch channel metadata to get JID ─────────────────────────────
      let meta;
      try {
        meta = await sock.newsletterMetadata('invite', inviteCode);
      } catch (e) {
        return extra.reply(`❌ Could not find channel: ${e.message}\n\nCheck the link is valid and public.`);
      }

      const channelJid  = meta.id;
      const channelName = meta.name || channelJid;

      // ── 5. Auto-follow the channel ────────────────────────────────────────
      try {
        await sock.newsletterFollow(channelJid);
      } catch (e) {
        // Not fatal — bot might already follow it
        console.warn('[chreact] Follow warning:', e.message);
      }

      await extra.reply(`✅ Joined *${channelName}*\n⏳ Sending ${amount} reaction(s) to post #${messageId}...`);

      // ── 6. Build the message key for the target post ──────────────────────
      const targetKey = {
        remoteJid: channelJid,
        id: String(messageId),
        fromMe: false,
      };

      // ── 7. Send reactions ─────────────────────────────────────────────────
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < amount; i++) {
        const emoji = emojis[i % emojis.length];

        try {
          await sock.sendMessage(channelJid, {
            react: { text: emoji, key: targetKey },
          });
          sent++;
        } catch (e) {
          console.error(`[chreact] React #${i + 1} failed:`, e.message);
          failed++;
        }

        // 500ms gap to avoid rate-limit
        if (i < amount - 1) {
          await delay(500);
        }
      }

      const emojiPreview = emojis.slice(0, 6).join('') + (emojis.length > 6 ? '...' : '');
      return extra.reply(
        `✅ *Done!*\n\n` +
        `📢 Channel: *${channelName}*\n` +
        `🔢 Post: *#${messageId}*\n` +
        `${emojiPreview} *${sent}* reaction(s) sent to channel` +
        (failed > 0 ? `\n❌ Failed: *${failed}*` : '')
      );

    } catch (error) {
      console.error('[chreact] Error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the channel invite code and message ID from a channel post URL.
 * Supports: https://whatsapp.com/channel/CODE/MSG_ID
 * Returns { inviteCode, messageId } or null.
 */
function extractChannelAndPost(link) {
  try {
    link = link.trim().split('?')[0].split('#')[0];

    // Full channel post URL: /channel/CODE/MSG_ID
    const postPattern = /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/i;
    const m = link.match(postPattern);
    if (m?.[1] && m?.[2]) {
      return { inviteCode: m[1], messageId: m[2] };
    }

    return null;
  } catch (_) {
    return null;
  }
}

function splitEmojis(str) {
  try {
    const seg = new Intl.Segmenter();
    return [...seg.segment(str)].map(s => s.segment).filter(s => s.trim());
  } catch (_) {
    return [...str].filter(s => s.trim());
  }
}

const delay = ms => new Promise(r => setTimeout(r, ms));
