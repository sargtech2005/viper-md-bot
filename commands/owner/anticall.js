/**
 * .anticall — toggle anti-call system (per-session)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'anticall',
  category: 'owner',
  ownerOnly: true,
  description: 'Enable or disable anti-call system',
  usage: '.anticall on/off',

  async execute(sock, msg, args, extra) {
    const current = database.getSetting('anticall', config.defaultGroupSettings?.anticall ?? false);
    const option  = args[0]?.toLowerCase();

    if (!option || !['on','off'].includes(option))
      return extra.reply(`Usage: *.anticall on/off*\nCurrently: ${current ? '🟢 ON' : '🔴 OFF'}`);

    const enabled = option === 'on';
    if (current === enabled)
      return extra.reply(`😹 Anti-call is *already ${option.toUpperCase()}* 💀`);

    database.updateSettings({ anticall: enabled });
    await extra.reply(
      enabled
        ? '✅ Anti-call *enabled*. Calls will be auto-rejected & blocked.'
        : '❌ Anti-call *disabled*.'
    );
  },
};
