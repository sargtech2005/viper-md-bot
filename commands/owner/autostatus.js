/**
 * .autostatus — toggle auto status view & save  (VIPER BOT MD)
 *
 * When ON: the bot automatically views and silently saves status updates
 * from all your WhatsApp contacts. Useful for keeping up without manually
 * opening each status, and for archiving media statuses.
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'autostatus',
  aliases: ['autostatusview', 'statusview'],
  category: 'owner',
  description: 'Auto-view and save WhatsApp status updates from contacts',
  usage: '.autostatus on/off',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const current = database.getSetting('autoStatus', config.autoStatus);
    const state   = args[0]?.toLowerCase();

    if (!state || !['on', 'off'].includes(state))
      return extra.reply(
        `📡 *Auto Status View*\n\n` +
        `When *ON*, the bot silently views all contact status updates.\n\n` +
        `Usage: *.autostatus on/off*\n` +
        `Currently: ${current ? '🟢 ON' : '🔴 OFF'}`
      );

    const val = state === 'on';
    if (current === val)
      return extra.reply(`😹 Auto Status is *already ${state.toUpperCase()}* 💀 Nothing changed!`);

    database.updateSettings({ autoStatus: val });
    await extra.reply(`✅ *Auto Status* → ${val ? '🟢 *ON*' : '🔴 *OFF*'}\n\n> Boss said so 👑`);
  },
};
