/**
 * .groupjid — Show current group JID (VIPER BOT MD)
 */

const database = require('../../database');
const config   = require('../../config');
const { sc }   = require('../../utils/categoryMenu');

module.exports = {
  name: 'groupjid',
  aliases: ['gjid', 'grpjid', 'jid'],
  category: 'admin',
  description: 'Show the current group JID',
  usage: '.groupjid',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const B   = database.getSetting('botName', config.botName);
    const jid = extra.from;
    const gm  = extra.groupMetadata;
    const name = gm?.subject || 'Unknown Group';

    let t  = `┏❐ 《 *🆔 ${sc('group jid')}* 》 ❐\n┃\n`;
    t += `┣◆ 👥 *Group:* ${name}\n`;
    t += `┣◆ 🔑 *JID:*\n`;
    t += `┃   \`${jid}\`\n`;
    t += `┃\n`;
    t += `┣◆ 💡 _Copy the JID above for bot configs_\n`;
    t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;

    return extra.reply(t);
  },
};
