/**
 * .tempmail — Disposable temporary email (VIPER BOT MD)
 * Free API: Guerrilla Mail (no key needed)
 */
const axios = require('axios');
const config = require('../../config');

const BASE = 'https://api.guerrillamail.com/ajax.php';

module.exports = {
  name: 'tempmail',
  aliases: ['tmpmail', 'disposablemail', 'fakemail'],
  category: 'utility',
  description: 'Generate a disposable temp email & read its inbox',
  usage: '.tempmail new | .tempmail inbox <token> | .tempmail read <token> <id>',

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || 'new').toLowerCase();

      // ── NEW ──────────────────────────────────────────────
      if (sub === 'new') {
        const { data } = await axios.get(BASE, {
          params: { f: 'get_email_address', lang: 'en', site: 'guerrillamail.com' },
          timeout: 10000,
        });

        const email = data.email_addr;
        const token = data.sid_token;

        let t = `┏❐ 《 *📧 TEMP MAIL* 》 ❐\n`;
        t += `┃\n`;
        t += `┣◆ 📨 *Email Address:*\n┃\`${email}\`\n`;
        t += `┃\n`;
        t += `┣◆ 🔑 *Your Token (save this!):*\n┃\`${token}\`\n`;
        t += `┃\n`;
        t += `┣◆ ℹ️ *Next Steps:*\n`;
        t += `┃• Check inbox:\n┃  \`.tempmail inbox ${token}\`\n`;
        t += `┃• Read a message:\n┃  \`.tempmail read ${token} <mail_id>\`\n`;
        t += `┗❐\n\n`;
        t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

        return await extra.reply(t);
      }

      // ── INBOX ────────────────────────────────────────────
      if (sub === 'inbox') {
        const token = args[1];
        if (!token) return await extra.reply('❌ Usage: `.tempmail inbox <token>`');

        const { data } = await axios.get(BASE, {
          params: { f: 'get_email_list', offset: 0, sid_token: token },
          timeout: 10000,
        });

        const list = data.list || [];
        if (!list.length) {
          return await extra.reply('📭 *Inbox is empty.*\nEmails usually arrive within seconds. Try again shortly.');
        }

        let t = `┏❐ 《 *📬 INBOX* 》 ❐\n┃\n`;
        list.slice(0, 10).forEach((m, i) => {
          t += `┣◆ ${i + 1}. 👤 *From:* ${m.mail_from}\n`;
          t += `┃   📋 *Subject:* ${m.mail_subject || '(no subject)'}\n`;
          t += `┃   🆔 *ID:* \`${m.mail_id}\`\n┃\n`;
        });
        t += `┣◆ 📖 To read: \`.tempmail read ${token} <id>\`\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

        return await extra.reply(t);
      }

      // ── READ ─────────────────────────────────────────────
      if (sub === 'read') {
        const token = args[1];
        const mailId = args[2];
        if (!token || !mailId) return await extra.reply('❌ Usage: `.tempmail read <token> <mail_id>`');

        const { data } = await axios.get(BASE, {
          params: { f: 'fetch_email', email_id: mailId, sid_token: token },
          timeout: 10000,
        });

        if (!data || !data.mail_body) {
          return await extra.reply('❌ Email not found or token expired.');
        }

        const body = data.mail_body
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1500);

        let t = `┏❐ 《 *📩 EMAIL* 》 ❐\n`;
        t += `┃\n`;
        t += `┣◆ 👤 *From:* ${data.mail_from}\n`;
        t += `┣◆ 📋 *Subject:* ${data.mail_subject || '(no subject)'}\n`;
        t += `┃\n`;
        t += `┣◆ 💬 *Message:*\n┃${body}\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

        return await extra.reply(t);
      }

      await extra.reply(`❌ Unknown option.\n\n*Usage:*\n• \`.tempmail new\`\n• \`.tempmail inbox <token>\`\n• \`.tempmail read <token> <id>\``);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
