/**
 * .ownerinfo — show bot owner contact card
 *
 * Reads ownerName and ownerNumber from per-session settings.json (set at
 * session creation or via .setownerinfo). Every user sees their own info.
 */
const config   = require('../../config');
const database = require('../../database');
const { sc }   = require('../../utils/categoryMenu');

module.exports = {
  name: 'ownerinfo',
  aliases: ['creator', 'whosmyboss'],
  category: 'owner',
  description: 'Show bot owner info & contact',
  usage: '.ownerinfo',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      // Per-session owner details — set at creation or via .setownerinfo
      const ownerName   = database.getSetting('ownerName', null)
                       || database.getSetting('ownerDisplayName', null);
      const ownerNumber = database.getSetting('ownerDisplayNumber', null)
                       || process.env.SESSION_NUMBER
                       || '';
      const botName     = database.getSetting('botName', config.botName);
      const botVersion  = config.botVersion;

      let t = `👑 *${sc('bot owner')}*\n\n`;
      if (ownerName) t += `┣◆ 🧑 *${ownerName}*\n`;
      if (ownerNumber) t += `┣◆ 📱 wa.me/${ownerNumber}\n`;
      t += `┃\n`;
      t += `┣◆ 🤖 *Bot*: ${botName} v${botVersion}\n`;
      t += `┗❐\n\n`;
      t += `> *${botName}* 🐍 — *built different* 😎`;

      await extra.reply(t);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
