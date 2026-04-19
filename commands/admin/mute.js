const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'mute',
  category: 'admin', description: 'Mute the group', usage: '.mute',
  groupOnly: true, adminOnly: true, botAdminNeeded: true,
  async execute(sock, msg, args, extra) {
    try {
      await sock.groupSettingUpdate(extra.from, 'announcement');
      let t = `🔇 *${sc('group muted')}!*\n\n`;
      t += `😤 Only admins can talk now.\n`;
      t += `🙊 Everyone else — shhhhh!`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
