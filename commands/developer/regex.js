/**
 * .regex <pattern> | <string>  (VIPER BOT MD)
 * Separator is " | " (space-pipe-space)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'regex',
  aliases: ['regexp', 'regextest', 'retest'],
  category: 'developer',
  description: 'Test a regex pattern against a string',
  usage: '.regex <pattern>[/flags] | <string to test>',

  async execute(sock, msg, args, extra) {
    const full = args.join(' ');
    const sepIdx = full.indexOf(' | ');

    if (sepIdx === -1) {
      return extra.reply(
        `🤦 Missing separator! Use *|* between pattern and string:\n` +
        `Usage: *.regex <pattern> | <string>*\n` +
        `Example: *.regex \\d+ | abc123def*\n` +
        `With flags: *.regex (?i)hello/i | Hello World*`
      );
    }

    const patternRaw = full.slice(0, sepIdx).trim();
    const testStr    = full.slice(sepIdx + 3).trim();

    if (!patternRaw || !testStr) {
      return extra.reply(`❌ Both pattern and test string are required.`);
    }

    // Parse optional /flags suffix
    let pattern = patternRaw, flags = 'gm';
    const flagMatch = patternRaw.match(/^(.+)\/([gimsuy]*)$/);
    if (flagMatch) { pattern = flagMatch[1]; flags = flagMatch[2] || 'gm'; }

    try {
      const re      = new RegExp(pattern, flags);
      const matches = [...testStr.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))];
      const isMatch = re.test(testStr);

      let t = `┏❐ 《 *🧩 ${sc('regex tester')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🔍 *Pattern*: \`${pattern}\`\n`;
      t += `┣◆ 🏳️ *Flags*: \`${flags || 'none'}\`\n`;
      t += `┣◆ 📝 *Test string*: \`${testStr.slice(0, 100)}\`\n`;
      t += `┃\n`;
      t += `┣◆ ${isMatch ? '✅ *Match found!*' : '❌ *No match*'}\n`;
      if (matches.length > 0) {
        t += `┣◆ 🎯 *Total matches*: ${matches.length}\n`;
        t += `┃\n`;
        matches.slice(0, 5).forEach((m, i) => {
          t += `┣◆ [${i + 1}] \`${m[0]}\` @ index ${m.index}\n`;
          if (m.length > 1) {
            m.slice(1).forEach((g, gi) => {
              t += `┃    Group ${gi + 1}: \`${g ?? 'undefined'}\`\n`;
            });
          }
        });
        if (matches.length > 5) t += `┣◆ _…and ${matches.length - 5} more_\n`;
      }
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Invalid regex: \`${e.message}\`\n\n_Check your pattern syntax!_`);
    }
  },
};
