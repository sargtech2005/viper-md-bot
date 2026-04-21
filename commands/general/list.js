/**
 * .list — Full commands list with descriptions  (VIPER BOT MD)
 * Full command list grouped by category, bot-standard text style.
 */
const config = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');
const { sc } = require('../../utils/categoryMenu');

const CAT_ICONS = {
  ai: '🤖', owner: '👑', general: '🌐', admin: '👥',
  media: '🎬', fun: '🎭', utility: '🔧', textmaker: '🖋️', developer: '💻',
};

module.exports = {
  name: 'list',
  aliases: [],
  description: 'List all commands with descriptions',
  usage: '.list',
  category: 'general',

  async execute(sock, msg, args, extra) {
    try {
      const prefix   = database.getSetting('prefix', config.prefix);
      const botName  = database.getSetting('botName', config.botName);
      const commands = loadCommands();
      const cats     = {};

      commands.forEach((cmd, name) => {
        if (cmd.name === name && !cmd.isNavShortcut) {
          const cat = (cmd.category || 'other').toLowerCase();
          if (!cats[cat]) cats[cat] = [];
          cats[cat].push(cmd);
        }
      });

      let t = '┏❐ 《 *📋 ' + sc('commands list') + '* 》 ❐\n┃\n';

      const orderedCats = Object.keys(cats).sort();
      for (const cat of orderedCats) {
        const icon = CAT_ICONS[cat] || '📁';
        const sorted = cats[cat].sort((a, b) => a.name.localeCompare(b.name));
        t += '┣◆ ' + icon + ' *' + sc(cat) + '*\n';
        for (const cmd of sorted) {
          const desc = cmd.description ? ' — ' + cmd.description : '';
          t += '┃  • `' + prefix + cmd.name + '`' + desc + '\n';
        }
        t += '┃\n';
      }

      t += '┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ' + botName + '* 🐍';

      await sock.sendMessage(extra.from, { text: t }, { quoted: msg });
    } catch (err) {
      console.error('list.js error:', err);
      await extra.reply('❌ Failed to load commands list.');
    }
  },
};
