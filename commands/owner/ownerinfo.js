/**
 * .ownerinfo — show bot owner contact card  (VIPER BOT MD)
 *
 * Each session has its own owner display name and number stored in the
 * session DB. Users set them once with:
 *   .setownerinfo name Your Name
 *   .setownerinfo number 2348XXXXXXXXX
 * Falls back to the paired session number if not explicitly set.
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
      // Per-session owner details — set with .setownerinfo
      const ownerName   = database.getSetting('ownerDisplayName', null);
      const ownerNumber = database.getSetting('ownerDisplayNumber', null)
                          || process.env.SESSION_NUMBER
                          || config.ownerNumber[0];
      const botName     = database.getSetting('botName', config.botName);
      const botVersion  = config.botVersion;

      let t = `👑 *${sc('bot owner')}*\n\n`;
      if (ownerName) {
        t += `┣◆ 🧑 *${ownerName}*\n`;
      }
      t += `┣◆ 📱 wa.me/${ownerNumber}\n`;
      t += `┃\n`;
      t += `┣◆ 🤖 *Bot*: ${botName} v${botVersion}\n`;
      t += `┗❐\n\n`;
      t += `> *${botName}* 🐍 — *built different* 😎`;

      await extra.reply(t);
    } catch (e) {
      await extra.reply(`💀 Bruh something crashed: ${e.message} 😭`);
    }
  },
};
