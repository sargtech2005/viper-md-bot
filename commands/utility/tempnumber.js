/**
 * .tempnumber — Disposable phone numbers for SMS verification (VIPER BOT MD)
 *
 * .tempnumber list           — show all countries
 * .tempnumber <country>      — show numbers for that country (static + live APIs)
 * .tempnumber sms <number>   — read incoming SMS
 *
 * When a country is queried, the bot:
 *  1. Shows the static pool numbers instantly
 *  2. Fetches LIVE numbers from multiple free APIs in parallel
 *  3. Merges & deduplicates, sends a combined list
 */
const axios  = require('axios');
const config = require('../../config');

// ── Try to import sc from categoryMenu, fallback to identity ─────────────────
let sc;
try { sc = require('../../utils/categoryMenu').sc; } catch (_) { sc = s => s; }

// ── Static number pool ───────────────────────────────────────────────────────
const STATIC_NUMBERS = [
  // Americas
  { country: 'usa',         flag: '🇺🇸', name: 'USA',         digits: '19163607823',   display: '+1 (916) 360-7823'   },
  { country: 'usa',         flag: '🇺🇸', name: 'USA',         digits: '14159819900',   display: '+1 (415) 981-9900'   },
  { country: 'canada',      flag: '🇨🇦', name: 'Canada',      digits: '14389682965',   display: '+1 (438) 968-2965'   },
  { country: 'canada',      flag: '🇨🇦', name: 'Canada',      digits: '16137008633',   display: '+1 (613) 700-8633'   },
  { country: 'brazil',      flag: '🇧🇷', name: 'Brazil',      digits: '5511942983575', display: '+55 11 9429 83575'   },
  // Western Europe
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
  // Northern Europe
  { country: 'sweden',      flag: '🇸🇪', name: 'Sweden',      digits: '46726400001',   display: '+46 72 640 0001'      },
  { country: 'norway',      flag: '🇳🇴', name: 'Norway',      digits: '4791504803',    display: '+47 915 04 803'       },
  { country: 'finland',     flag: '🇫🇮', name: 'Finland',     digits: '358454901027',  display: '+358 45 4901027'      },
  { country: 'denmark',     flag: '🇩🇰', name: 'Denmark',     digits: '4571971090',    display: '+45 71 97 10 90'      },
  // Eastern Europe
  { country: 'poland',      flag: '🇵🇱', name: 'Poland',      digits: '48732190364',   display: '+48 732 190 364'      },
  { country: 'czechia',     flag: '🇨🇿', name: 'Czechia',     digits: '420774043706',  display: '+420 774 043 706'     },
  { country: 'romania',     flag: '🇷🇴', name: 'Romania',     digits: '40770060302',   display: '+40 770 060 302'      },
  { country: 'hungary',     flag: '🇭🇺', name: 'Hungary',     digits: '36704578080',   display: '+36 70 457 8080'      },
  { country: 'lithuania',   flag: '🇱🇹', name: 'Lithuania',   digits: '37060248155',   display: '+370 602 48155'       },
  { country: 'ukraine',     flag: '🇺🇦', name: 'Ukraine',     digits: '380931234567',  display: '+380 93 123 4567'     },
  // Asia-Pacific
  { country: 'australia',   flag: '🇦🇺', name: 'Australia',   digits: '61480020029',   display: '+61 480 020 029'      },
  { country: 'indonesia',   flag: '🇮🇩', name: 'Indonesia',   digits: '6281212349876', display: '+62 812 1234 9876'    },
  { country: 'philippines', flag: '🇵🇭', name: 'Philippines', digits: '639171234567',  display: '+63 917 123 4567'     },
  { country: 'india',       flag: '🇮🇳', name: 'India',       digits: '917488908888',  display: '+91 748 890 8888'     },
  // Africa / Middle East
  { country: 'nigeria',     flag: '🇳🇬', name: 'Nigeria',     digits: '2348012345678', display: '+234 801 234 5678'    },
  { country: 'ghana',       flag: '🇬🇭', name: 'Ghana',       digits: '233244123456',  display: '+233 244 123 456'     },
  { country: 'kenya',       flag: '🇰🇪', name: 'Kenya',       digits: '254712345678',  display: '+254 712 345 678'     },
  { country: 'southafrica', flag: '🇿🇦', name: 'South Africa',digits: '27831234567',   display: '+27 83 123 4567'      },
];

// ── Country aliases ──────────────────────────────────────────────────────────
const ALIASES = {
  us: 'usa', 'united states': 'usa', america: 'usa',
  gb: 'uk',  'great britain': 'uk',  england: 'uk', britain: 'uk',
  de: 'germany', nl: 'netherlands',  be: 'belgium',
  fr: 'france',  es: 'spain',        it: 'italy', pt: 'portugal',
  se: 'sweden',  no: 'norway',       fi: 'finland', dk: 'denmark',
  pl: 'poland',  cz: 'czechia', 'czech republic': 'czechia',
  ro: 'romania', hu: 'hungary',      lt: 'lithuania', ua: 'ukraine',
  ca: 'canada',  br: 'brazil',
  au: 'australia', id: 'indonesia',  ph: 'philippines', in: 'india',
  ng: 'nigeria', gh: 'ghana',        ke: 'kenya',
  za: 'southafrica', 'south africa': 'southafrica',
};

function resolveCountry(raw) {
  const lower = raw.toLowerCase().trim();
  return ALIASES[lower] || lower;
}

// ── Country code → dial prefix mapping ──────────────────────────────────────
const DIAL_PREFIX = {
  nigeria: '234', ghana: '233', kenya: '254', southafrica: '27',
  usa: '1', canada: '1', uk: '44', france: '33', germany: '49',
  netherlands: '31', sweden: '46', norway: '47', finland: '358',
  denmark: '45', poland: '48', czechia: '420', romania: '40',
  hungary: '36', ukraine: '380', australia: '61', india: '91',
  indonesia: '62', philippines: '63', brazil: '55', spain: '34',
  italy: '39', portugal: '351', belgium: '32', lithuania: '370',
};

// ── Country → API slug mappings ──────────────────────────────────────────────
// Each API uses a different slug/country-code for the same country
const API_SLUGS = {
  // receive-smss.com — full slug table
  receivesmss: {
    nigeria: 'nigeria', ghana: 'ghana', kenya: 'kenya', southafrica: 'south-africa',
    usa: 'united-states', canada: 'canada', uk: 'united-kingdom',
    france: 'france', germany: 'germany', netherlands: 'netherlands',
    belgium: 'belgium', spain: 'spain', italy: 'italy', portugal: 'portugal',
    sweden: 'sweden', norway: 'norway', finland: 'finland', denmark: 'denmark',
    poland: 'poland', czechia: 'czech-republic', romania: 'romania',
    hungary: 'hungary', lithuania: 'lithuania', ukraine: 'ukraine',
    australia: 'australia', india: 'india', indonesia: 'indonesia',
    philippines: 'philippines', brazil: 'brazil',
  },
  // smstome.com — ISO2 codes
  smstome: {
    nigeria: 'ng', ghana: 'gh', kenya: 'ke', southafrica: 'za',
    usa: 'us', canada: 'ca', uk: 'gb',
    france: 'fr', germany: 'de', netherlands: 'nl', belgium: 'be',
    spain: 'es', italy: 'it', portugal: 'pt',
    sweden: 'se', norway: 'no', finland: 'fi', denmark: 'dk',
    poland: 'pl', czechia: 'cz', romania: 'ro', hungary: 'hu',
    lithuania: 'lt', ukraine: 'ua',
    australia: 'au', india: 'in', indonesia: 'id', philippines: 'ph',
    brazil: 'br',
  },
  // freereceivesms.com slugs
  freereceivesms: {
    nigeria: 'nigeria', ghana: 'ghana', kenya: 'kenya',
    usa: 'usa', canada: 'canada', uk: 'united-kingdom',
    france: 'france', germany: 'germany', netherlands: 'netherlands',
    sweden: 'sweden', norway: 'norway', finland: 'finland',
    poland: 'poland', india: 'india', indonesia: 'indonesia',
    australia: 'australia', brazil: 'brazil',
  },
  // quackr.io slugs
  quackr: {
    nigeria: 'nigeria', ghana: 'ghana', kenya: 'kenya',
    usa: 'united-states', canada: 'canada', uk: 'united-kingdom',
    france: 'france', germany: 'germany', netherlands: 'netherlands',
    belgium: 'belgium', spain: 'spain', italy: 'italy',
    sweden: 'sweden', norway: 'norway', finland: 'finland', denmark: 'denmark',
    poland: 'poland', ukraine: 'ukraine',
    australia: 'australia', india: 'india', indonesia: 'indonesia',
    philippines: 'philippines', brazil: 'brazil',
  },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Live fetchers — each returns [{digits, display}] ────────────────────────
const LIVE_FETCHERS = [

  // 1. receive-smss.com — has good African numbers
  async (country) => {
    const slug = API_SLUGS.receivesmss[country];
    if (!slug) return [];
    const { data } = await axios.get(
      `https://receive-smss.com/api/numbers/${slug}/`,
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const arr = Array.isArray(data) ? data : (data?.numbers || data?.data || []);
    return arr.slice(0, 8).map(n => {
      const raw = String(n.number || n.phone || n.msisdn || '').replace(/\D/g, '');
      return raw ? { digits: raw, display: '+' + raw } : null;
    }).filter(Boolean);
  },

  // 2. smstome.com
  async (country) => {
    const slug = API_SLUGS.smstome[country];
    if (!slug) return [];
    const { data } = await axios.get(
      `https://smstome.com/api/country/${slug}`,
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const arr = Array.isArray(data) ? data : (data?.data || []);
    return arr.slice(0, 8).map(n => {
      const raw = String(n.number || n.phone || '').replace(/\D/g, '');
      return raw ? { digits: raw, display: '+' + raw } : null;
    }).filter(Boolean);
  },

  // 3. freereceivesms.com
  async (country) => {
    const slug = API_SLUGS.freereceivesms[country];
    if (!slug) return [];
    const { data } = await axios.get(
      `https://freereceivesms.com/api/numbers/?country=${slug}`,
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const arr = Array.isArray(data) ? data : (data?.numbers || data?.data || []);
    return arr.slice(0, 8).map(n => {
      const raw = String(n.number || n.phone || '').replace(/\D/g, '');
      return raw ? { digits: raw, display: '+' + raw } : null;
    }).filter(Boolean);
  },

  // 4. quackr.io
  async (country) => {
    const slug = API_SLUGS.quackr[country];
    if (!slug) return [];
    const { data } = await axios.get(
      `https://quackr.io/api/numbers/${slug}`,
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const arr = Array.isArray(data) ? data : (data?.data || []);
    return arr.slice(0, 8).map(n => {
      const raw = String(n.number || n.phone || n.msisdn || '').replace(/\D/g, '');
      return raw ? { digits: raw, display: '+' + raw } : null;
    }).filter(Boolean);
  },

  // 5. hs3x.com — scrape number list page
  async (country) => {
    const prefix = DIAL_PREFIX[country];
    if (!prefix) return [];
    const { data } = await axios.get(
      `https://hs3x.com/`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    const matches = [];
    const re = new RegExp(`\\+?(${prefix}\\d{7,12})`, 'g');
    let m;
    while ((m = re.exec(data)) !== null) {
      const digits = m[1].replace(/\D/g, '');
      if (!matches.find(x => x.digits === digits)) {
        matches.push({ digits, display: '+' + digits });
      }
      if (matches.length >= 6) break;
    }
    return matches;
  },

  // 6. onlinesim.io — free list API, filter by prefix
  async (country) => {
    const prefix = DIAL_PREFIX[country];
    if (!prefix) return [];
    const { data } = await axios.get(
      'https://onlinesim.io/api/getFreeList.php',
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const list = Array.isArray(data?.response) ? data.response : [];
    return list
      .filter(n => String(n.number || n.phone || '').replace(/\D/g, '').startsWith(prefix))
      .slice(0, 6)
      .map(n => {
        const raw = String(n.number || n.phone || '').replace(/\D/g, '');
        return raw ? { digits: raw, display: '+' + raw } : null;
      }).filter(Boolean);
  },

  // 7. receivesms.cc — has +234 numbers
  async (country) => {
    const prefix = DIAL_PREFIX[country];
    if (!prefix) return [];
    const { data } = await axios.get(
      'https://receivesms.cc/api/numbers/',
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const arr = Array.isArray(data) ? data : (data?.numbers || data?.data || []);
    return arr
      .filter(n => String(n.number || n.phone || '').replace(/\D/g, '').startsWith(prefix))
      .slice(0, 6)
      .map(n => {
        const raw = String(n.number || n.phone || '').replace(/\D/g, '');
        return raw ? { digits: raw, display: '+' + raw } : null;
      }).filter(Boolean);
  },

  // 8. smsreceivefree.com
  async (country) => {
    const prefix = DIAL_PREFIX[country];
    if (!prefix) return [];
    const { data } = await axios.get(
      'https://smsreceivefree.com/api/numbers/',
      { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const arr = Array.isArray(data) ? data : (data?.numbers || data?.data || []);
    return arr
      .filter(n => String(n.number || n.phone || '').replace(/\D/g, '').startsWith(prefix))
      .slice(0, 6)
      .map(n => {
        const raw = String(n.number || n.phone || '').replace(/\D/g, '');
        return raw ? { digits: raw, display: '+' + raw } : null;
      }).filter(Boolean);
  },
];

// ── Fetch live numbers for a country from ALL APIs in parallel ───────────────
async function fetchLiveNumbers(country) {
  const results = await Promise.allSettled(
    LIVE_FETCHERS.map(fn => fn(country))
  );
  const seen   = new Set();
  const merged = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const n of (r.value || [])) {
      if (n?.digits && !seen.has(n.digits)) {
        seen.add(n.digits);
        merged.push(n);
      }
    }
  }
  return merged;
}

// ── SMS reading APIs ─────────────────────────────────────────────────────────
function norm(m, fromKeys, textKeys, timeKeys) {
  const pick = (obj, keys) => { for (const k of keys) if (obj[k]) return String(obj[k]); return ''; };
  return { from: pick(m, fromKeys) || 'Unknown', text: pick(m, textKeys) || '(no content)', time: pick(m, timeKeys) };
}

const SMS_APIS = [
  { name: 'A1', async fetch(d) {
    const { data } = await axios.get('https://receive-smss.com/api/sms/' + d + '/', { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.messages || data?.data || []);
    return r.slice(0, 10).map(m => norm(m, ['originator','from','sender'], ['text','body','message'], ['time_ago','date','received']));
  }},
  { name: 'A2', async fetch(d) {
    const { data } = await axios.get('https://quackr.io/api/messages/' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.data || []);
    return r.slice(0, 10).map(m => norm(m, ['sender','from'], ['message','text','body'], ['created_at','time','date']));
  }},
  { name: 'A3', async fetch(d) {
    const { data } = await axios.get('https://hs3x.com/api/sms.php?num=' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.list || data?.messages || []);
    return r.slice(0, 10).map(m => norm(m, ['from','sender','number'], ['content','text','body'], ['time','date','received_at']));
  }},
  { name: 'A4', async fetch(d) {
    const { data } = await axios.get('https://smsreceivefree.com/api/sms/' + d + '/', { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.data || data?.sms || []);
    return r.slice(0, 10).map(m => norm(m, ['from','sender','number'], ['content','text','message'], ['time','date']));
  }},
  { name: 'A5', async fetch(d) {
    const { data } = await axios.get('https://www.receivesmsonline.net/api/sms/' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.messages || data?.data || []);
    return r.slice(0, 10).map(m => norm(m, ['from','originator','sender'], ['text','body','message'], ['time_ago','date','received']));
  }},
  { name: 'A6', async fetch(d) {
    const { data } = await axios.get('https://smstome.com/api/phone/' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.data || []);
    return r.slice(0, 10).map(m => norm(m, ['sender','from'], ['message','text','body'], ['date','time']));
  }},
  { name: 'A7', async fetch(d) {
    const { data } = await axios.get('https://onlinesim.io/api/getFreeList.php', { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const list = Array.isArray(data?.response) ? data.response : [];
    const match = list.find(n => String(n.number || n.phone || '').replace(/\D/g,'').endsWith(d.slice(-9)));
    if (!match) return [];
    return (match.messages || []).slice(0, 10).map(m => norm(m, ['sender','from'], ['text','message'], ['time']));
  }},
  { name: 'A8', async fetch(d) {
    const { data } = await axios.get('https://receivesms.cc/api/messages/' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.data || data?.messages || []);
    return r.slice(0, 10).map(m => norm(m, ['from','sender'], ['text','message'], ['date','time']));
  }},
  { name: 'A9', async fetch(d) {
    const { data } = await axios.get('https://proovl.com/api/messages?phone=' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.data || []);
    return r.slice(0, 10).map(m => norm(m, ['from','originator'], ['text','body'], ['time','created']));
  }},
  { name: 'A10', async fetch(d) {
    const { data } = await axios.get('https://freereceivesms.com/api/phone-sms/?phone=' + d, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const r = Array.isArray(data) ? data : (data?.data || []);
    return r.slice(0, 10).map(m => norm(m, ['from','sender'], ['text','message'], ['time','date']));
  }},
];

async function fetchSMS(digits) {
  for (const api of SMS_APIS) {
    try {
      const msgs = await api.fetch(digits);
      if (Array.isArray(msgs) && msgs.length > 0) return msgs;
    } catch (_) {}
  }
  return [];
}

// ── Command ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'tempnumber',
  aliases: ['tmpnum', 'tempnum', 'tempsms', 'smsonline', 'receivesms'],
  category: 'utility',
  description: 'Free disposable phone numbers to receive SMS/OTP online',
  usage: '.tempnumber | .tempnumber <country> | .tempnumber sms <number>',

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || 'list').toLowerCase();
      const knownSubs = ['list', 'numbers', 'sms', 'inbox', 'read', 'check'];

      // ── LIST — .tempnumber list ───────────────────────────────────────────
      if (sub === 'list' || sub === 'numbers') {
        const grouped = {};
        STATIC_NUMBERS.forEach(n => {
          if (!grouped[n.country]) grouped[n.country] = [];
          grouped[n.country].push(n);
        });

        let t = '┏❐ 《 *📱 ' + sc('temp numbers') + '* 》 ❐\n┃\n';
        t += '┣◆ 🌍 *' + sc('free public numbers') + '* — ' + STATIC_NUMBERS.length + ' numbers, ' + Object.keys(grouped).length + ' countries\n';
        t += '┃   _(Static pool + live APIs when you filter by country)_\n┃\n';
        let first = true;
        for (const [, nums] of Object.entries(grouped)) {
          if (!first) t += '┃\n';
          first = false;
          t += '┣◆ ' + nums[0].flag + ' *' + sc(nums[0].name) + '*\n';
          nums.forEach(n => { t += '┃  📞 `' + n.display + '`\n'; });
        }
        t += '┃\n┣◆ 💡 *' + sc('usage') + ':*\n';
        t += '┃  • *.tempnumber nigeria* — all Nigeria numbers (static + live)\n';
        t += '┃  • *.tempnumber sms 2348012345678* — read SMS\n┃\n';
        t += '┣◆ ⚠️ Public shared numbers — not for sensitive accounts!\n';
        t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
        return extra.reply(t);
      }

      // ── SMS CHECK ─────────────────────────────────────────────────────────
      if (['sms', 'inbox', 'read', 'check'].includes(sub)) {
        const rawNum = (args[1] || '').replace(/[^0-9]/g, '');
        if (!rawNum || rawNum.length < 7) {
          return extra.reply(
            '📱 *' + sc('check sms') + '*\n\nUsage: *.tempnumber sms <number>*\n' +
            'Example: *.tempnumber sms 2348012345678*\n\n_Digits only_\n\n' +
            '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍'
          );
        }
        await extra.reply('🔄 Checking *+' + rawNum + '* across ' + SMS_APIS.length + ' sources...');
        const messages = await fetchSMS(rawNum);
        if (!messages.length) {
          return extra.reply(
            '┏❐ 《 *📭 SMS — +' + rawNum + '* 》 ❐\n┃\n' +
            '┣◆ ⚠️ No messages found yet.\n┃   _Try again shortly._\n' +
            '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍'
          );
        }
        let t = '┏❐ 《 *📬 SMS — +' + rawNum + '* 》 ❐\n┃  Found *' + messages.length + '* message(s)\n┃\n';
        messages.forEach((m, i) => {
          t += '┣◆ ' + (i + 1) + '. 👤 *From:* ' + m.from + '\n';
          if (m.time) t += '┃   🕐 *Time:* ' + m.time + '\n';
          t += '┃   💬 *Message:*\n```\n' + m.text.slice(0, 300) + '\n```\n';
          if (i < messages.length - 1) t += '┃\n';
        });
        t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
        return extra.reply(t);
      }

      // ── COUNTRY FILTER — .tempnumber nigeria ─────────────────────────────
      const key     = resolveCountry(sub);
      const staticM = STATIC_NUMBERS.filter(n => n.country === key);
      const flag    = staticM[0]?.flag || '🌍';
      const name    = staticM[0]?.name || key;

      // Check if country exists at all
      const allKeys = new Set(STATIC_NUMBERS.map(n => n.country));
      if (!allKeys.has(key) && !DIAL_PREFIX[key]) {
        const unique = [...new Set(STATIC_NUMBERS.map(n => n.flag + ' ' + n.name))];
        let t = '┏❐ 《 *❌ ' + sc('country not found') + '* 》 ❐\n┃\n';
        t += '┣◆ Country *' + sub + '* not in pool.\n┃\n';
        t += '┣◆ 🌍 *' + sc('available countries') + ':*\n┃\n';
        unique.forEach(c => { t += '┃  ' + c + '\n'; });
        t += '┃\n┣◆ 💡 Try: *.tempnumber nigeria* or *.tempnumber usa*\n';
        t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
        return extra.reply(t);
      }

      // Send static numbers immediately while fetching live
      let quickMsg = '┏❐ 《 *' + flag + ' ' + sc(name) + ' ' + sc('numbers') + '* 》 ❐\n┃\n';
      if (staticM.length) {
        quickMsg += '┣◆ 📦 *Static pool:*\n';
        staticM.forEach(n => {
          quickMsg += '┃  📞 `' + n.display + '`\n';
          quickMsg += '┃   *.tempnumber sms ' + n.digits + '*\n';
        });
        quickMsg += '┃\n';
      }
      quickMsg += '┣◆ 🔄 Fetching live numbers from 8 APIs...\n┗❐';
      await extra.reply(quickMsg);

      // Fetch live numbers from all APIs in parallel
      const live = await fetchLiveNumbers(key);

      // Merge with static, deduplicate
      const staticDigits = new Set(staticM.map(n => n.digits));
      const freshOnly    = live.filter(n => !staticDigits.has(n.digits));

      // Build final combined reply
      let t = '┏❐ 《 *' + flag + ' ' + sc(name) + ' ' + sc('numbers — full list') + '* 》 ❐\n┃\n';

      if (staticM.length) {
        t += '┣◆ 📦 *' + sc('static pool') + ' (' + staticM.length + '):*\n';
        staticM.forEach(n => {
          t += '┃  📞 `' + n.display + '`\n';
          t += '┃   *.tempnumber sms ' + n.digits + '*\n';
        });
        t += '┃\n';
      }

      if (freshOnly.length) {
        t += '┣◆ 🌐 *' + sc('live from apis') + ' (' + freshOnly.length + '):*\n';
        freshOnly.forEach(n => {
          t += '┃  📞 `' + n.display + '`\n';
          t += '┃   *.tempnumber sms ' + n.digits + '*\n';
        });
        t += '┃\n';
      } else {
        t += '┣◆ ℹ️ No additional live numbers found right now.\n┃\n';
      }

      const total = staticM.length + freshOnly.length;
      t += '┣◆ 📊 *Total: ' + total + ' number(s)* across ' + (staticM.length ? 'static + ' : '') + '8 APIs\n';
      t += '┣◆ ⚠️ ' + sc('shared public numbers — do not use for sensitive accounts') + '\n';
      t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + config.botName + '* 🐍';
      return extra.reply(t);

    } catch (e) {
      await extra.reply('❌ Error: ' + e.message);
    }
  },
};
