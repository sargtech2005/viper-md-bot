/**
 * .setownerinfo — set per-session owner display name or number  (VIPER BOT MD)
 *
 * Usage:
 *   .setownerinfo name John Doe
 *   .setownerinfo number 2348XXXXXXXXX
 *
 * Stored in the session DB so .ownerinfo shows your info, not the platform defaults.
 */
const database = require('../../database');

module.exports = {
  name: 'setownerinfo',
  aliases: ['setowner'],
  category: 'owner',
  description: 'Set your display name or number shown in .ownerinfo',
  usage: '.setownerinfo name <your name>  |  .setownerinfo number <your number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const sub   = args[0]?.toLowerCase();
    const value = args.slice(1).join(' ').trim();

    if (!sub || !value) {
      const name   = database.getSetting('ownerDisplayName', '*(not set)*');
      const number = database.getSetting('ownerDisplayNumber', process.env.SESSION_NUMBER || '*(not set)*');
      return extra.reply(
        `👑 *Set Owner Info*\n\n` +
        `Current name: *${name}*\n` +
        `Current number: *${number}*\n\n` +
        `Usage:\n` +
        `*.setownerinfo name Your Name*\n` +
        `*.setownerinfo number 2348XXXXXXXXX*`
      );
    }

    if (sub === 'name') {
      if (value.length > 50) return extra.reply('❌ Name must be 50 characters or less.');
      database.updateSettings({ ownerDisplayName: value });
      return extra.reply(`✅ Owner name set to: *${value}*\n\n> Boss said so 👑`);
    }

    if (sub === 'number') {
      const clean = value.replace(/[^0-9]/g, '');
      if (!/^\d{10,15}$/.test(clean))
        return extra.reply('❌ Invalid number. Use international format without + (e.g. 2348XXXXXXXXXX).');
      database.updateSettings({ ownerDisplayNumber: clean });
      return extra.reply(`✅ Owner number set to: *${clean}*\n\n> Boss said so 👑`);
    }

    return extra.reply('❌ Use: *.setownerinfo name <name>* or *.setownerinfo number <number>*');
  },
};
