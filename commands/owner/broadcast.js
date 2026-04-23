const { sc } = require('../../utils/categoryMenu');
const config  = require('../../config');
const { bulkDelay } = require('../../handler');
module.exports = {
  name: 'broadcast', aliases: ['bc'],
  category: 'owner', description: 'Broadcast message to all groups', usage: '.broadcast <message>',
  ownerOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) return extra.reply('❌ Provide a message to broadcast!\n_Usage: .broadcast Hello world_');
      const message = args.join(' ');
      const groups = await sock.groupFetchAllParticipating();
      const groupIds = Object.keys(groups);
      let sent = 0, failed = 0;

      for (const id of groupIds) {
        try {
          let t = `📡 *${sc('broadcast message')}*\n\n${message}\n\n> *${config.botName}* 🐍`;
          await sock.sendMessage(id, { text: t });
          sent++;
          await bulkDelay(1500, 2500); // human-paced, reduces ban risk
        } catch (_) { failed++; }
      }
      await extra.reply(`📡 *${sc('broadcast done')}!*\n\n✅ Sent: ${sent} groups\n❌ Failed: ${failed} groups`);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
