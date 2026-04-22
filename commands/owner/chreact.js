/**
 * .chreact — React to recent channel posts with emoji(s)
 *
 * Usage: .chreact <channel_link> <amount> <emojis>
 * Example: .chreact https://whatsapp.com/channel/0029VaXXX 10 🙃🥳🥵🤤
 *
 * - Bot auto-follows/joins the channel first
 * - amount: 1–100
 * - Emojis cycle round-robin across the messages
 * - 700ms delay between reacts to avoid rate-limit
 */

module.exports = {
  name: 'chreact',
  aliases: ['channelreact', 'creact'],
  category: 'owner',
  description: 'React to channel posts with emoji(s)',
  usage: '.chreact <channel_link> <amount> <emojis>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (args.length < 3) {
        return extra.reply(
          `⚡ *Channel React*\n\n` +
          `*Usage:* \`.chreact <channel_link> <amount> <emojis>\`\n\n` +
          `*Example:*\n\`.chreact https://whatsapp.com/channel/0029VaXXX 10 🙃🥳🥵🤤\`\n\n` +
          `• Channel link: full WhatsApp channel URL\n` +
          `• Amount: 1–100 messages to react on\n` +
          `• Emojis: any sequence (cycles round-robin)`
        );
      }

      // ── 1. Parse invite code ──────────────────────────────────────────────
      const rawLink = args[0];
      const inviteCode = extractInviteCode(rawLink);
      if (!inviteCode) {
        return extra.reply(
          `❌ Could not parse channel link.\n\n` +
          `Make sure it's a valid WhatsApp channel URL:\n` +
          `\`https://whatsapp.com/channel/0029Va...\``
        );
      }

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

      const channelJid = meta.id;
      const channelName = meta.name || channelJid;

      // ── 5. Auto-follow the channel ────────────────────────────────────────
      try {
        await sock.newsletterFollow(channelJid);
      } catch (e) {
        // Not a fatal error — bot might already follow it
        console.warn('[chreact] Follow warning:', e.message);
      }

      await extra.reply(`✅ Joined *${channelName}*\n⏳ Fetching last ${amount} message(s)...`);

      // ── 6. Fetch recent messages ──────────────────────────────────────────
      let messages = [];
      try {
        // Baileys: loadMessages(jid, count, cursor)
        const result = await sock.loadMessages(channelJid, amount, undefined);
        messages = result?.messages || result || [];
      } catch (e) {
        // Fallback: try fetchMessageHistory (some Baileys builds)
        try {
          const result = await sock.fetchMessageHistory(50, { remoteJid: channelJid }, new Date());
          messages = result?.messages || [];
        } catch (_) {
          return extra.reply(
            `❌ Could not fetch channel messages: ${e.message}\n\n` +
            `The bot may need a moment after following — try again in 10 seconds.`
          );
        }
      }

      if (!messages.length) {
        return extra.reply(
          `❌ No messages found in *${channelName}*.\n\n` +
          `The channel may have no posts yet, or try again in a few seconds after the bot just followed it.`
        );
      }

      const targets = messages.slice(0, amount);
      let sent = 0;
      let failed = 0;

      await extra.reply(`💬 Reacting to *${targets.length}* post(s) in *${channelName}*...\n_This may take a moment._`);

      // ── 7. React to each message ──────────────────────────────────────────
      for (let i = 0; i < targets.length; i++) {
        const m = targets[i];
        if (!m?.key) { failed++; continue; }

        const emoji = emojis[i % emojis.length];

        try {
          await sock.sendMessage(channelJid, {
            react: { text: emoji, key: m.key },
          });
          sent++;
        } catch (e) {
          console.error(`[chreact] React #${i} failed:`, e.message);
          failed++;
        }

        // 700ms gap to avoid rate-limit
        if (i < targets.length - 1) {
          await delay(700);
        }
      }

      const emojiPreview = emojis.slice(0, 6).join('') + (emojis.length > 6 ? '...' : '');
      return extra.reply(
        `✅ *Done!*\n\n` +
        `📢 Channel: *${channelName}*\n` +
        `✔️ Reacted: *${sent}* message(s)\n` +
        `❌ Failed: *${failed}*\n` +
        `${emojiPreview} Emojis used: ${emojis.join(' ')}`
      );

    } catch (error) {
      console.error('[chreact] Error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    // Raw code passed directly
    if (/^[A-Za-z0-9_-]{10,}$/.test(link)) return link;
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
