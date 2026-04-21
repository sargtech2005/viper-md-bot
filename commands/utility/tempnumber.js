/**
 * .tempnumber — Disposable phone numbers for SMS verification  (VIPER BOT MD)
 * Pool of 30+ numbers across countries — no hard cap.
 * .tempnumber <country>  — filter/show numbers for a specific country
 * .tempnumber list       — show all available numbers
 * .tempnumber sms <num>  — read incoming SMS for a number
 * SMS fetch tries 10 independent APIs in sequence — first success wins.
 */
const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

// ── Number pool — add/remove entries here freely, no limit ───────────────────
const NUMBERS = [
  // ── Americas ──────────────────────────────────────────────────────────────
  { country: 'usa',         flag: '🇺🇸', name: 'USA',         digits: '19163607823',   display: '+1 (916) 360-7823'   },
  { country: 'usa',         flag: '🇺🇸', name: 'USA',         digits: '14159819900',   display: '+1 (415) 981-9900'   },
  { country: 'canada',      flag: '🇨🇦', name: 'Canada',      digits: '14389682965',   display: '+1 (438) 968-2965'   },
  { country: 'canada',      flag: '🇨🇦', name: 'Canada',      digits: '16137008633',   display: '+1 (613) 700-8633'   },
  { country: 'brazil',      flag: '🇧🇷', name: 'Brazil',      digits: '5511942983575', display: '+55 11 9429 83575'   },
  // ── Western Europe ────────────────────────────────────────────────────────
  { country: 'uk',          flag: '🇬🇧', name: 'UK',          digits: '447441443872',  display: '+44 7441 443872'      },
  { country: 'uk',          flag: '🇬🇧', name: 'UK',          digits: '447405182969',  display: '+44 7405 182969'      },
  { country: 'france',      flag: '🇫🇷', name: 'France',      digits: '33757005265',   display: '+33 7 57 00 52 65'    },
  { country: 'france',      flag: '🇫🇷', name: 'France',      digits: '33644623970',   display: '+33 6 44 62 39 70'    },
  { country: 'germany',     flag: '🇩🇪', name: 'Germany',     digits: '4915735982406', display: '+49 157 3598 2406'    },
  { country: 'germany',     flag: '🇩🇪', name: 'Germany',     digits: '4917670698290', display: '+49 176 7069 8290'    },
  { country: 'netherlands', flag: '🇳🇱', name: 'Netherlands', digits: '3197010520906', display: '+31 97010520906'      },
  { country: 'belgium',     flag: '🇧🇪', name: 'Belgium',     digits: '3297024017',    display: '+32 97024017'         },
  { country: 'spain',       flag: '🇪🇸', name: 'Spain',       digits: '34623021358',   display: '+34 623 021 358'      },
  { country: 'italy',       flag: '🇮🇹', name: 'Italy',       digits: '393452661533',  display: '+39 345 266 1533'     },
  { country: 'portugal',    flag: '🇵🇹', name: 'Portugal',    digits: '351912345678',  display: '+351 912 345 678'     },
  // ── Northern Europe ───────────────────────────────────────────────────────
  { country: 'sweden',      flag: '🇸🇪', name: 'Sweden',      digits: '46726400001',   display: '+46 72 640 0001'      },
  { country: 'norway',      flag: '🇳🇴', name: 'Norway',      digits: '4791504803',    display: '+47 915 04 803'       },
  { country: 'finland',     flag: '🇫🇮', name: 'Finland',     digits: '358454901027',  display: '+358 45 4901027'      },
  { country: 'denmark',     flag: '🇩🇰', name: 'Denmark',     digits: '4571971090',    display: '+45 71 97 10 90'      },
  // ── Eastern Europe ────────────────────────────────────────────────────────
  { country: 'poland',      flag: '🇵🇱', name: 'Poland',      digits: '48732190364',   display: '+48 732 190 364'      },
  { country: 'czechia',     flag: '🇨🇿', name: 'Czechia',     digits: '420774043706',  display: '+420 774 043 706'     },
  { country: 'romania',     flag: '🇷🇴', name: 'Romania',     digits: '40770060302',   display: '+40 770 060 302'      },
  { country: 'hungary',     flag: '🇭🇺', name: 'Hungary',     digits: '36704578080',   display: '+36 70 457 8080'      },
  { country: 'lithuania',   flag: '🇱🇹', name: 'Lithuania',   digits: '37060248155',   display: '+370 602 48155'       },
  { country: 'ukraine',     flag: '🇺🇦', name: 'Ukraine',     digits: '380931234567',  display: '+380 93 123 4567'     },
  // ── Asia-Pacific ─────────────────────────────────────────────────────────
  { country: 'australia',   flag: '🇦🇺', name: 'Australia',   digits: '61480020029',   display: '+61 480 020 029'      },
  { country: 'indonesia',   flag: '🇮🇩', name: 'Indonesia',   digits: '6281212349876', display: '+62 812 1234 9876'    },
  { country: 'philippines', flag: '🇵🇭', name: 'Philippines', digits: '639171234567',  display: '+63 917 123 4567'     },
  { country: 'india',       flag: '🇮🇳', name: 'India',       digits: '917488908888',  display: '+91 748 890 8888'     },
  // ── Africa / Middle East ──────────────────────────────────────────────────
  { country: 'nigeria',     flag: '🇳🇬', name: 'Nigeria',     digits: '2348012345678', display: '+234 801 234 5678'    },
  { country: 'ghana',       flag: '🇬🇭', name: 'Ghana',       digits: '233244123456',  display: '+233 244 123 456'     },
];

// ── Country alias table (shorthand → canonical key) ──────────────────────────
const ALIASES = {
  us: 'usa', 'united states': 'usa', america: 'usa',
  gb: 'uk', 'great britain': 'uk', england: 'uk', britain: 'uk',
  de: 'germany', nl: 'netherlands', be: 'belgium',
  fr: 'france', es: 'spain', it: 'italy', pt: 'portugal',
  se: 'sweden', no: 'norway', fi: 'finland', dk: 'denmark',
  pl: 'poland', cz: 'czechia', 'czech republic': 'czechia',
  ro: 'romania', hu: 'hungary', lt: 'lithuania', ua: 'ukraine',
  ca: 'canada', br: 'brazil',
  au: 'australia', id: 'indonesia', ph: 'philippines', in: 'india',
  ng: 'nigeria', gh: 'ghana',
};

// ── Resolve country key from raw input ────────────────────────────────────────
function resolveCountry(raw) {
  const lower = raw.toLowerCase().trim();
  return ALIASES[lower] || lower;
}

// ── Normalise a raw API message into { from, text, time } ─────────────────────
function norm(m, fromKeys, textKeys, timeKeys) {
  const pick = (obj, keys) => { for (const k of keys) if (obj[k]) return String(obj[k]); return ''; };
  return {
    from: pick(m, fromKeys) || 'Unknown',
    text: pick(m, textKeys) || '(no content)',
    time: pick(m, timeKeys),
  };
}

// ── 10 independent SMS APIs — tried in order, first non-empty wins ────────────
const SMS_APIS = [
  {
    name: 'A1',
    async fetch(d) {
      const { data } = await axios.get('https://receive-smss.com/api/sms/' + d + '/',
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.messages) ? data.messages : Array.isArray(data && data.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['originator','from','sender'], ['text','body','message'], ['time_ago','date','received']));
    },
  },
  {
    name: 'A2',
    async fetch(d) {
      const { data } = await axios.get('https://quackr.io/api/messages/' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['sender','from'], ['message','text','body'], ['created_at','time','date']));
    },
  },
  {
    name: 'A3',
    async fetch(d) {
      const { data } = await axios.get('https://hs3x.com/api/sms.php?num=' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.list) ? data.list : Array.isArray(data && data.messages) ? data.messages : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender','number'], ['content','text','body'], ['time','date','received_at']));
    },
  },
  {
    name: 'A4',
    async fetch(d) {
      const { data } = await axios.get('https://smsreceivefree.com/api/sms/' + d + '/',
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : Array.isArray(data && data.sms) ? data.sms : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender','number'], ['content','text','message'], ['time','date']));
    },
  },
  {
    name: 'A5',
    async fetch(d) {
      const { data } = await axios.get('https://www.receivesmsonline.net/api/sms/' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.messages) ? data.messages : Array.isArray(data && data.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','originator','sender'], ['text','body','message'], ['time_ago','date','received']));
    },
  },
  {
    name: 'A6',
    async fetch(d) {
      const { data } = await axios.get('https://smstome.com/api/phone/' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['sender','from'], ['message','text','body'], ['date','time']));
    },
  },
  {
    name: 'A7',
    async fetch(d) {
      const { data } = await axios.get('https://onlinesim.io/api/getFreeList.php',
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const list  = Array.isArray(data && data.response) ? data.response : [];
      const match = list.find(n => ((n.number || n.phone || '')).replace(/\D/g,'').endsWith(d.slice(-9)));
      if (!match) return [];
      const msgs = Array.isArray(match.messages) ? match.messages : [];
      return msgs.slice(0, 10).map(m => norm(m, ['sender','from'], ['text','message'], ['time']));
    },
  },
  {
    name: 'A8',
    async fetch(d) {
      const { data } = await axios.get('https://temp-phone-number.com/api/sms/' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : Array.isArray(data && data.messages) ? data.messages : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','sender'], ['text','message'], ['date','time']));
    },
  },
  {
    name: 'A9',
    async fetch(d) {
      const { data } = await axios.get('https://proovl.com/api/messages?phone=' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : [];
      return raw.slice(0, 10).map(m => norm(m, ['from','originator'], ['text','body'], ['time','created']));
    },
  },
  {
    name: 'A10',
    async fetch(d) {
      const { data } = await axios.get('https://freereceivesms.com/api/phone-sms/?phone=' + d,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const raw = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : [];
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
  usage: '.tempnumber | .tempnumber list | .tempnumber <country> | .tempnumber sms <number>',

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || 'list').toLowerCase();
      const knownSubs = ['list', 'numbers', 'sms', 'inbox', 'read', 'check'];

      // ── COUNTRY FILTER — .tempnumber <country> ───────────────────────────
      if (!knownSubs.includes(sub)) {
        const key     = resolveCountry(sub);
        const matches = NUMBERS.filter(n => n.country === key);

        if (!matches.length) {
          // Show available countries list
          const unique = [...new Set(NUMBERS.map(n => n.flag + ' ' + n.name))];
          let t = '┏❐ 《 *📱 ' + sc('country not found') + '* 》 ❐\n┃\n';
          t += '┣◆ ❌ Country *' + sub + '* not in pool.\n┃\n';
          t += '┣◆ 🌍 *' + sc('available countries') + ':*\n┃\n';
          unique.forEach(c => { t += '┃  ' + c + '\n'; });
          t += '┃\n┣◆ 💡 Try: *.tempnumber usa* or *.tempnumber uk*\n';
          t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
          return extra.reply(t);
        }

        let t = '┏❐ 《 *' + matches[0].flag + ' ' + sc(matches[0].name) + ' ' + sc('numbers') + '* 》 ❐\n┃\n';
        matches.forEach((n, i) => {
          t += '┣◆ 📞 `' + n.display + '`\n';
          t += '┃   *.tempnumber sms ' + n.digits + '*\n';
          if (i < matches.length - 1) t += '┃\n';
        });
        t += '┃\n┣◆ ⚠️ ' + sc('shared public numbers — do not use for sensitive accounts') + '\n';
        t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
        return extra.reply(t);
      }

      // ── LIST — .tempnumber list ───────────────────────────────────────────
      if (sub === 'list' || sub === 'numbers') {
        // Group by country key for clean display
        const grouped = {};
        NUMBERS.forEach(n => {
          if (!grouped[n.country]) grouped[n.country] = [];
          grouped[n.country].push(n);
        });

        let t = '┏❐ 《 *📱 ' + sc('temp numbers') + '* 》 ❐\n┃\n';
        t += '┣◆ 🌍 *' + sc('free public numbers') + '* — ' + NUMBERS.length + ' numbers, ' + Object.keys(grouped).length + ' countries\n';
        t += '┃   _(Shared — anyone can receive SMS on these)_\n┃\n';

        let first = true;
        for (const [, nums] of Object.entries(grouped)) {
          if (!first) t += '┃\n';
          first = false;
          t += '┣◆ ' + nums[0].flag + ' *' + sc(nums[0].name) + '*\n';
          nums.forEach(n => { t += '┃  📞 `' + n.display + '`\n'; });
        }

        t += '┃\n';
        t += '┣◆ 💡 *' + sc('how to use') + ':*\n';
        t += '┃  1. Pick a number above\n';
        t += '┃  2. Enter it in the app you want to verify\n';
        t += '┃  3. Type *.tempnumber sms <digits>* to read SMS\n';
        t += '┃  Or use *.tempnumber <country>* to filter\n';
        t += '┃\n';
        t += '┣◆ ⚠️ *' + sc('note') + ':* Public shared numbers.\n';
        t += '┃   Do NOT use for sensitive or private accounts!\n';
        t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
        return extra.reply(t);
      }

      // ── SMS CHECK — .tempnumber sms <number> ─────────────────────────────
      if (['sms', 'inbox', 'read', 'check'].includes(sub)) {
        const rawNum = (args[1] || '').replace(/[^0-9]/g, '');
        if (!rawNum || rawNum.length < 7) {
          return extra.reply(
            '📱 *' + sc('check sms') + '*\n\n' +
            'Usage: *.tempnumber sms <number>*\n' +
            'Example: *.tempnumber sms 19163607823*\n\n' +
            '_Digits only — no + or spaces_\n\n' +
            '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍'
          );
        }

        await extra.reply('🔄 Checking *+' + rawNum + '* across ' + SMS_APIS.length + ' sources...');

        const messages = await fetchSMS(rawNum);

        if (!messages.length) {
          let t = '┏❐ 《 *📭 SMS — +' + rawNum + '* 》 ❐\n┃\n';
          t += '┣◆ ⚠️ No messages found yet.\n';
          t += '┃   _SMS may not have arrived, or the number_\n';
          t += '┃   _isn\'t in the public pool. Try again shortly._\n';
          t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
          return extra.reply(t);
        }

        let t = '┏❐ 《 *📬 SMS — +' + rawNum + '* 》 ❐\n';
        t += '┃  Found *' + messages.length + '* message(s)\n┃\n';

        messages.forEach(function(m, i) {
          t += '┣◆ ' + (i + 1) + '. 👤 *From:* ' + m.from + '\n';
          if (m.time) t += '┃   🕐 *Time:* ' + m.time + '\n';
          t += '┃   💬 *Message:*\n';
          t += '```\n' + m.text.slice(0, 300) + '\n```\n';
          if (i < messages.length - 1) t += '┃\n';
        });

        t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
        return extra.reply(t);
      }

    } catch (e) {
      await extra.reply('❌ Error: ' + e.message);
    }
  },
};
