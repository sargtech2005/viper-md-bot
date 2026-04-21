/**
 * .tempnumber — Disposable phone numbers for SMS verification  (VIPER BOT MD)
 * 16 public numbers across 16 countries.
 * SMS fetch tries 10 independent APIs in sequence — first success wins.
 * No site URLs are ever shown to users.
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

// ── Number pool ───────────────────────────────────────────────────────────────
// digits = E.164 without '+', used for API calls only — never shown as a URL
const NUMBERS = [
  { country: '🇺🇸 USA',         digits: '19163607823',   display: '+1 (916) 360-7823'   },
  { country: '🇬🇧 UK',          digits: '447441443872',  display: '+44 7441 443872'      },
  { country: '🇸🇪 Sweden',      digits: '46726400001',   display: '+46 72 640 0001'      },
  { country: '🇫🇷 France',      digits: '33757005265',   display: '+33 7 57 00 52 65'    },
  { country: '🇩🇪 Germany',     digits: '4915735982406', display: '+49 157 3598 2406'    },
  { country: '🇳🇱 Netherlands', digits: '3197010520906', display: '+31 97010520906'      },
  { country: '🇨🇦 Canada',      digits: '14389682965',   display: '+1 (438) 968-2965'   },
  { country: '🇦🇺 Australia',   digits: '61480020029',   display: '+61 480 020 029'      },
  { country: '🇧🇪 Belgium',     digits: '3297024017',    display: '+32 97024017'         },
  { country: '🇫🇮 Finland',     digits: '358454901027',  display: '+358 45 4901027'      },
  { country: '🇩🇰 Denmark',     digits: '4571971090',    display: '+45 71 97 10 90'      },
  { country: '🇵🇱 Poland',      digits: '48732190364',   display: '+48 732 190 364'      },
  { country: '🇨🇿 Czechia',     digits: '420774043706',  display: '+420 774 043 706'     },
  { country: '🇷🇴 Romania',     digits: '40770060302',   display: '+40 770 060 302'      },
  { country: '🇭🇺 Hungary',     digits: '36704578080',   display: '+36 70 457 8080'      },
  { country: '🇱🇹 Lithuania',   digits: '37060248155',   display: '+370 602 48155'       },
];

// ── Normalise a raw API message into { from, text, time } ─────────────────────
function norm(m, fromKeys, textKeys, timeKeys) {
  const pick = (obj, keys) => { for (const k of keys) if (obj[k]) return String(obj[k]); return ''; };
  return {
    from: pick(m, fromKeys) || 'Unknown',
    text: pick(m, textKeys) || '(no content)',
    time: pick(m, timeKeys),
  };
}

// ── 10 independent SMS APIs — tried in order, first non-empty result wins ─────
const SMS_APIS = [
  {
    name: 'A1',
    async fetch(d) {
      const { data } = await axios.get(`https://receive-smss.com/api/sms/${d}/`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : Array.isArray(data?.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['originator','from','sender'], ['text','body','message'], ['time_ago','date','received']));
    },
  },
  {
    name: 'A2',
    async fetch(d) {
      const { data } = await axios.get(`https://quackr.io/api/messages/${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['sender','from'], ['message','text','body'], ['created_at','time','date']));
    },
  },
  {
    name: 'A3',
    async fetch(d) {
      const { data } = await axios.get(`https://hs3x.com/api/sms.php?num=${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : Array.isArray(data?.messages) ? data.messages : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender','number'], ['content','text','body'], ['time','date','received_at']));
    },
  },
  {
    name: 'A4',
    async fetch(d) {
      const { data } = await axios.get(`https://smsreceivefree.com/api/sms/${d}/`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.sms) ? data.sms : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender','number'], ['content','text','message'], ['time','date']));
    },
  },
  {
    name: 'A5',
    async fetch(d) {
      const { data } = await axios.get(`https://www.receivesmsonline.net/api/sms/${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : Array.isArray(data?.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','originator','sender'], ['text','body','message'], ['time_ago','date','received']));
    },
  },
  {
    name: 'A6',
    async fetch(d) {
      const { data } = await axios.get(`https://smstome.com/api/phone/${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['sender','from'], ['message','text','body'], ['date','time']));
    },
  },
  {
    name: 'A7',
    async fetch(d) {
      const { data } = await axios.get(`https://onlinesim.io/api/getFreeList.php`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const list  = Array.isArray(data?.response) ? data.response : [];
      const match = list.find(n => (n.number||n.phone||'').replace(/\D/g,'').endsWith(d.slice(-9)));
      if (!match) return [];
      const msgs = Array.isArray(match.messages) ? match.messages : [];
      return msgs.slice(0, 10).map(m => norm(m, ['sender','from'], ['text','message'], ['time']));
    },
  },
  {
    name: 'A8',
    async fetch(d) {
      const { data } = await axios.get(`https://temp-phone-number.com/api/sms/${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.messages) ? data.messages : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender'], ['text','message'], ['date','time']));
    },
  },
  {
    name: 'A9',
    async fetch(d) {
      const { data } = await axios.get(`https://proovl.com/api/messages?phone=${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','originator'], ['text','body'], ['time','created']));
    },
  },
  {
    name: 'A10',
    async fetch(d) {
      const { data } = await axios.get(`https://freereceivesms.com/api/phone-sms/?phone=${d}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender'], ['text','message'], ['time','date']));
    },
  },
];

async function fetchSMS(digits) {
  for (const api of SMS_APIS) {
    try {
      const msgs = await api.fetch(digits);
      if (Array.isArray(msgs) && msgs.length > 0) return msgs;
    } catch (_) { /* try next */ }
  }
  return [];
}

// ── Command ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'tempnumber',
  aliases: ['tmpnum', 'tempnum', 'tempsms', 'smsonline', 'receivesms'],
  category: 'utility',
  description: 'Free disposable phone numbers to receive SMS/OTP online',
  usage: '.tempnumber | .tempnumber list | .tempnumber sms <number>',

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || 'list').toLowerCase();

      // ── LIST ───────────────────────────────────────────────────────────────
      if (sub === 'list' || sub === 'numbers') {
        let t = `┏❐ 《 *📱 ${sc('temp numbers')}* 》 ❐\n`;
        t += `┃\n`;
        t += `┣◆ 🌍 *${sc('free public numbers')}* — ${NUMBERS.length} countries\n`;
        t += `┃   _(Shared — anyone can receive SMS on these)_\n`;
        t += `┃\n`;

        NUMBERS.forEach((n, i) => {
          t += `┣◆ ${n.country}\n`;
          t += `┃  📞 \`${n.display}\`\n`;
          if (i < NUMBERS.length - 1) t += `┃\n`;
        });

        t += `┃\n`;
        t += `┣◆ 💡 *${sc('how to use')}:*\n`;
        t += `┃  1. Copy a number above\n`;
        t += `┃  2. Enter it in the app you want to verify\n`;
        t += `┃  3. Type *.tempnumber sms <digits>* to read\n`;
        t += `┃     the incoming SMS right here in chat\n`;
        t += `┃\n`;
        t += `┣◆ ⚠️ *${sc('note')}:* These are shared public numbers.\n`;
        t += `┃   Do NOT use for sensitive or private accounts!\n`;
        t += `┗❐\n\n`;
        t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      // ── SMS CHECK ──────────────────────────────────────────────────────────
      if (['sms', 'inbox', 'read', 'check'].includes(sub)) {
        const rawNum = (args[1] || '').replace(/[^0-9]/g, '');
        if (!rawNum || rawNum.length < 7) {
          return await extra.reply(
            `📱 *${sc('check sms')}*\n\n` +
            `Usage: *.tempnumber sms <number>*\n` +
            `Example: *.tempnumber sms 19163607823*\n\n` +
            `_Digits only — no + or spaces_\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
          );
        }

        await extra.reply(`🔄 Checking *+${rawNum}* across ${SMS_APIS.length} sources...`);

        const messages = await fetchSMS(rawNum);

        if (!messages.length) {
          let t = `┏❐ 《 *📭 SMS — +${rawNum}* 》 ❐\n┃\n`;
          t += `┣◆ ⚠️ No messages found yet.\n`;
          t += `┃   _SMS may not have arrived, or the number_\n`;
          t += `┃   _isn't in the public pool. Try again shortly._\n`;
          t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
          return await extra.reply(t);
        }

        let t = `┏❐ 《 *📬 SMS — +${rawNum}* 》 ❐\n`;
        t += `┃  Found *${messages.length}* message(s)\n┃\n`;

        messages.forEach((m, i) => {
          t += `┣◆ ${i + 1}. 👤 *From:* ${m.from}\n`;
          if (m.time) t += `┃   🕐 *Time:* ${m.time}\n`;
          t += `┃   💬 *Message:*\n`;
          t += `\`\`\`\n${m.text.slice(0, 300)}\n\`\`\`\n`;
          if (i < messages.length - 1) t += `┃\n`;
        });

        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      // ── HELP ───────────────────────────────────────────────────────────────
      let t = `┏❐ 《 *📱 ${sc('temp number')}* 》 ❐\n┃\n`;
      t += `┣◆ 📋 *.tempnumber list*\n`;
      t += `┃   Show all ${NUMBERS.length} free public numbers by country\n`;
      t += `┃\n`;
      t += `┣◆ 📩 *.tempnumber sms <number>*\n`;
      t += `┃   Check received SMS for that number\n`;
      t += `┃   _Tries ${SMS_APIS.length} providers automatically_\n`;
      t += `┃\n`;
      t += `┣◆ ⚠️ Public shared numbers only —\n`;
      t += `┃   not for sensitive or private accounts.\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
