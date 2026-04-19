const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'unmute',
  category: 'admin', description: 'Unmute the group', usage: '.unmute',
  groupOnly: true, adminOnly: true, botAdminNeeded: true,
  async execute(sock, msg, args, extra) {
    try {
      await sock.groupSettingUpdate(extra.from, 'not_announcement');
      let t = `🔊 *${sc('group unmuted')}!*\n\n`;
      t += `🎉 Chat is open again!\n`;
      t += `😂 Now everyone can yap.`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
