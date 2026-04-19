/**
 * .cron <expression>  (VIPER BOT MD)
 * Explains a cron expression in plain English.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

const MONTHS = ['','January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function parseField(val, min, max, names=[]) {
  if (val === '*') return null;  // every
  if (val.startsWith('*/')) {
    const step = parseInt(val.slice(2));
    return `every ${step} (from ${min} to ${max})`;
  }
  if (val.includes('-')) {
    const [a, b] = val.split('-').map(v => names[parseInt(v)] || v);
    return `from ${a} to ${b}`;
  }
  if (val.includes('/')) {
    const [range, step] = val.split('/');
    const [a, b] = range.split('-');
    const startName = names[parseInt(a)] || a;
    return `every ${step} starting at ${startName}`;
  }
  if (val.includes(',')) {
    const parts = val.split(',').map(v => names[parseInt(v)] || v);
    return parts.join(', ');
  }
  return names[parseInt(val)] || val;
}

function describe(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    throw new Error('Cron must have 5 fields: minute hour day month weekday\nOptional 6th field: year');
  }

  const [min, hr, dom, mon, dow, yr] = parts;

  const minDesc  = parseField(min, 0, 59);
  const hrDesc   = parseField(hr, 0, 23);
  const domDesc  = parseField(dom, 1, 31);
  const monDesc  = parseField(mon, 1, 12, MONTHS);
  const dowDesc  = parseField(dow, 0, 6, DAYS);
  const yrDesc   = yr ? parseField(yr, 1970, 2099) : null;

  const lines = [];

  // Minute
  if (minDesc === null) lines.push('every minute');
  else lines.push(`at minute(s): ${minDesc}`);

  // Hour
  if (hrDesc !== null) lines.push(`of hour(s): ${hrDesc}`);

  // Day of month
  if (domDesc !== null) lines.push(`on day(s) of month: ${domDesc}`);
  else if (dowDesc !== null) lines.push('on any day of the month');

  // Month
  if (monDesc !== null) lines.push(`in: ${monDesc}`);

  // Day of week
  if (dowDesc !== null) lines.push(`only on: ${dowDesc}`);

  // Year
  if (yrDesc !== null) lines.push(`in year(s): ${yrDesc}`);

  return lines;
}

// Common presets
const PRESETS = {
  '* * * * *':     'Every minute',
  '0 * * * *':     'Every hour (at minute 0)',
  '0 0 * * *':     'Every day at midnight',
  '0 0 * * 0':     'Every Sunday at midnight',
  '0 0 1 * *':     'First day of every month',
  '0 0 1 1 *':     'Every New Year (Jan 1 midnight)',
  '*/5 * * * *':   'Every 5 minutes',
  '*/15 * * * *':  'Every 15 minutes',
  '*/30 * * * *':  'Every 30 minutes',
  '0 9 * * 1-5':   'Weekdays at 9:00 AM',
  '0 0 * * 1':     'Every Monday at midnight',
};

module.exports = {
  name: 'cron',
  aliases: ['cronparse', 'cronhelp', 'cronexplain'],
  category: 'developer',
  description: 'Explain a cron expression in plain English',
  usage: '.cron <expression>',

  async execute(sock, msg, args, extra) {
    const expr = args.join(' ').trim();

    if (!expr) {
      let t = `🕰️ *${sc('cron expression helper')}*\n\n`;
      t += `Usage: *.cron <expression>*\n\n`;
      t += `Format: \`min hr dom mon dow [year]\`\n\n`;
      t += `*Common presets:*\n`;
      for (const [e, d] of Object.entries(PRESETS)) {
        t += `  \`${e}\`\n  _→ ${d}_\n\n`;
      }
      return extra.reply(t);
    }

    try {
      // Check preset first
      const preset = PRESETS[expr];
      const lines  = describe(expr);
      const parts  = expr.split(/\s+/);
      const labels = ['Minute','Hour','Day','Month','Weekday','Year'].slice(0, parts.length);

      let t = `┏❐ 《 *🕰️ ${sc('cron parser')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *Expression*: \`${expr}\`\n`;
      t += `┃\n`;
      t += `┣◆ *Fields:*\n`;
      parts.forEach((p, i) => {
        t += `┃    ${labels[i]}: \`${p}\`\n`;
      });
      t += `┃\n`;
      t += `┣◆ *📖 Meaning:*\n`;
      lines.forEach(l => { t += `┃    ✦ ${l}\n`; });
      if (preset) t += `┃\n┣◆ 💡 *Summary*: ${preset}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ *${e.message}*\n\nExample: *.cron 0 9 * * 1-5*`);
    }
  },
};
