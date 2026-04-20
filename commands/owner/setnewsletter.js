/**
 * .setnewsletter — set newsletter JID for menu forwarding (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'setnewsletter',
  aliases: ['setnl', 'setchannel'],
  category: 'owner',
  description: 'Set or change the newsletter JID for menu forwarding (owner only)',
  usage: '.setnewsletter <newsletter JID>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const currentJid = database.getSetting('newsletterJid', config.newsletterJid) || 'Not set';
      let newsletterJid = '';

      // 1. Already inside a newsletter chat
      if (msg.key.remoteJid?.endsWith('@newsletter')) {
        newsletterJid = msg.key.remoteJid;
      }
      // 2. Replying to a newsletter message — walk context for @newsletter JID
      else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const find = (obj, d = 0) => {
          if (d > 5 || !obj || typeof obj !== 'object') return null;
          for (const v of Object.values(obj)) {
            if (typeof v === 'string' && v.endsWith('@newsletter')) return v;
            const r = find(v, d + 1);
            if (r) return r;
          }
          return null;
        };
        newsletterJid = find(msg.message.extendedTextMessage.contextInfo);
        if (!newsletterJid)
          return extra.reply('❌ The replied message is not from a newsletter!\n\nPlease reply to a newsletter message or provide a JID directly.');
      }
      // 3. JID passed as argument
      else if (args[0]) {
        newsletterJid = args[0].trim();
      }
      // 4. No argument — show current
      else {
        return extra.reply(
          `📰 *Newsletter Configuration*\n\n` +
          `Current JID: \`${currentJid}\`\n\n` +
          `Usage:\n  .setnewsletter <newsletter JID>\n  Or reply to a newsletter message\n\n` +
          `Example: .setnewsletter 120363161513685998@newsletter`
        );
      }

      if (!newsletterJid.endsWith('@newsletter'))
        return extra.reply('❌ Invalid JID format — must end with `@newsletter`');

      // Save per-session (does NOT touch config.js)
      database.updateSettings({ newsletterJid });

      await extra.reply(
        `✅ Newsletter JID updated!\n\n` +
        `📰 JID: \`${newsletterJid}\`\n\n` +
        `The menu will now forward from this newsletter.\n\n> Boss said so 👑`
      );
    } catch (err) {
      await extra.reply(`❌ Error: ${err.message}`);
    }
  },
};
