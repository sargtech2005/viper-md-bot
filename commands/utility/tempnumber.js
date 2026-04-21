/**
 * .tempnumber — Disposable temporary phone numbers for SMS verification  (VIPER BOT MD)
 * Uses SMS-Man free API (no key needed for basic use)
 * Provides temp numbers to receive OTP/verification SMS online
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

// Free public temp SMS services (no key required)
const SERVICES = [
  { name: 'SMS-Man',       url: 'https://sms-man.com/api',         docs: 'sms-man.com'       },
  { name: 'Receive SMS',   url: 'https://receive-smss.com',         docs: 'receive-smss.com'  },
  { name: 'SMS Receive',   url: 'https://smsreceivefree.com',       docs: 'smsreceivefree.com'},
];

// Public free number list endpoint (no key, scrape-based)
const FREE_NUMBERS_API = 'https://smsreceivefree.com/api/freenumber/';

// Fallback: well-known public temp number sites
const PUBLIC_SITES = [
  { country: '🇺🇸 USA',     number: '+19163607823', site: 'https://receive-smss.com/sms/19163607823/' },
  { country: '🇬🇧 UK',      number: '+447441443872', site: 'https://receive-smss.com/sms/447441443872/' },
  { country: '🇸🇪 Sweden',  number: '+46726400001', site: 'https://receive-smss.com/sms/46726400001/' },
  { country: '🇫🇷 France',  number: '+33757005265', site: 'https://receive-smss.com/sms/33757005265/' },
  { country: '🇩🇪 Germany', number: '+4915735982406', site: 'https://receive-smss.com/sms/4915735982406/' },
  { country: '🇳🇱 Netherlands', number: '+3197010520906', site: 'https://receive-smss.com/sms/3197010520906/' },
];

module.exports = {
  name: 'tempnumber',
  aliases: ['tmpnum', 'tempnum', 'tempsms', 'smsonline', 'receivesms'],
  category: 'utility',
  description: 'Get a free disposable phone number to receive SMS/OTP online',
  usage: '.tempnumber | .tempnumber list | .tempnumber sms <number>',

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || 'list').toLowerCase();

      // ── LIST — show available public numbers ──────────────────────────────
      if (sub === 'list' || sub === 'numbers') {
        let t = `┏❐ 《 *📱 ${sc('temp numbers')}* 》 ❐\n`;
        t += `┃\n`;
        t += `┣◆ 🌍 *${sc('free public numbers')}*\n`;
        t += `┃   _(Shared — anyone can read these SMS)_\n`;
        t += `┃\n`;

        PUBLIC_SITES.forEach((n, i) => {
          t += `┣◆ ${n.country}\n`;
          t += `┃  📞 \`${n.number}\`\n`;
          t += `┃  🔗 ${n.site}\n`;
          if (i < PUBLIC_SITES.length - 1) t += `┃\n`;
        });

        t += `┃\n`;
        t += `┣◆ 💡 *${sc('how to use')}:*\n`;
        t += `┃  1. Copy a number above\n`;
        t += `┃  2. Enter it in the app you want to verify\n`;
        t += `┃  3. Open the site link to read your SMS\n`;
        t += `┃  4. Or type: *.tempnumber sms <number>*\n`;
        t += `┃     _to check SMS right here in chat_\n`;
        t += `┃\n`;
        t += `┣◆ ⚠️ *${sc('note')}:* These are shared public numbers.\n`;
        t += `┃   Do NOT use for sensitive accounts!\n`;
        t += `┗❐\n\n`;
        t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      // ── SMS — fetch messages for a number ────────────────────────────────
      if (sub === 'sms' || sub === 'inbox' || sub === 'read') {
        const rawNum = (args[1] || '').replace(/[^0-9]/g, '');
        if (!rawNum || rawNum.length < 7) {
          return await extra.reply(
            `📱 *${sc('check sms for a number')}*\n\n` +
            `Usage: *.tempnumber sms <number>*\n` +
            `Example: *.tempnumber sms 19163607823*\n\n` +
            `_Digits only — no + or spaces_\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
          );
        }

        await extra.reply(`🔄 Fetching SMS for *+${rawNum}*...`);

        // Try receive-smss.com API (public JSON endpoint)
        const apiUrl = `https://receive-smss.com/api/sms/${rawNum}/`;
        let messages = [];
        let fetched  = false;

        try {
          const { data } = await axios.get(apiUrl, {
            timeout: 12000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ViperBotMD/2.7)',
              'Accept': 'application/json',
            },
          });

          // Normalise various response shapes
          const raw = Array.isArray(data) ? data
                    : Array.isArray(data?.messages) ? data.messages
                    : Array.isArray(data?.data) ? data.data
                    : [];

          messages = raw.slice(0, 10).map(m => ({
            from:    m.originator || m.from || m.sender   || 'Unknown',
            text:    m.text       || m.body || m.message  || '(no content)',
            time:    m.time_ago   || m.date || m.received || '',
          }));
          fetched = true;
        } catch (_) {}

        if (!fetched || !messages.length) {
          // Fallback: check if this is one of our known numbers and give the link
          const known = PUBLIC_SITES.find(n => n.number.replace(/[^0-9]/g, '') === rawNum);
          let t = `┏❐ 《 *📭 SMS — +${rawNum}* 》 ❐\n┃\n`;
          t += `┣◆ ⚠️ No messages found or API unavailable.\n`;
          if (known) {
            t += `┃\n`;
            t += `┣◆ 🔗 Check directly:\n┃   ${known.site}\n`;
          }
          t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
          return await extra.reply(t);
        }

        let t = `┏❐ 《 *📬 SMS — +${rawNum}* 》 ❐\n`;
        t += `┃  Found *${messages.length}* message(s)\n┃\n`;

        messages.forEach((m, i) => {
          t += `┣◆ ${i + 1}. 👤 *From:* ${m.from}\n`;
          if (m.time) t += `┃   🕐 *Time:* ${m.time}\n`;
          t += `┃   💬 *Message:* ${m.text.slice(0, 300)}\n`;
          if (i < messages.length - 1) t += `┃\n`;
        });

        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      // ── DEFAULT / HELP ────────────────────────────────────────────────────
      let t = `┏❐ 《 *📱 ${sc('temp number')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *.tempnumber list*\n`;
      t += `┃   Show free public numbers with countries\n`;
      t += `┃\n`;
      t += `┣◆ 📩 *.tempnumber sms <number>*\n`;
      t += `┃   Check SMS messages for a number\n`;
      t += `┃   _Example: .tempnumber sms 19163607823_\n`;
      t += `┃\n`;
      t += `┣◆ ⚠️ *Public numbers only!* — Do not use\n`;
      t += `┃   for sensitive/private accounts.\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
