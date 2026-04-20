/**
 * Set Prefix Command - Change bot command prefix (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'setprefix',
  aliases: ['prefix'],
  category: 'owner',
  description: 'Change bot command prefix',
  usage: '.setprefix <new prefix>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const currentPrefix = database.getSetting('prefix', config.prefix);
    if (args.length === 0)
      return extra.reply(`📌 Current prefix: *${currentPrefix}*\n\nUsage: ${currentPrefix}setprefix <new prefix>`);

    const newPrefix = args[0];
    if (newPrefix.length > 3)
      return extra.reply('❌ Prefix must be 1-3 characters long!');

    // Save to per-session DB (does NOT touch config.js — isolates this session)
    database.updateSettings({ prefix: newPrefix });
    await extra.reply(`✅ Prefix changed to: *${newPrefix}*\n\nNew command format: ${newPrefix}command\n\n> Boss said so 👑`);
  },
};
