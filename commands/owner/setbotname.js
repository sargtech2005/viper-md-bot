/**
 * .setbotname — change bot name (per-session, does NOT touch config.js)
 */
const config   = require('../../config');
const database = require('../../database');

module.exports = {
  name: 'setbotname',
  aliases: ['setname', 'botname'],
  category: 'owner',
  description: 'Change bot name for this session',
  usage: '.setbotname <new name>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const currentName = database.getSetting('botName', config.botName);

    // Accept name from quoted reply or from args
    let newBotName = '';
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg) {
      newBotName = (
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text ||
        quotedMsg.imageMessage?.caption ||
        quotedMsg.videoMessage?.caption || ''
      ).trim();
    } else {
      newBotName = args.join(' ').trim();
    }

    if (!newBotName) {
      return extra.reply(
        `📝 *Set Bot Name*\n\n` +
        `Current: *${currentName}*\n\n` +
        `Usage: *.setbotname <new name>*\nor reply to a message containing the name.`
      );
    }

    if (newBotName.length > 50)
      return extra.reply('❌ Bot name must be 50 characters or less.');

    database.updateSettings({ botName: newBotName });
    await extra.reply(`✅ Bot name changed to: *${newBotName}*\n\n> Boss said so 👑`);
  },
};
