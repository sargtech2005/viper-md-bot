const APIs = require('../../utils/api');
const { sc } = require('../../utils/categoryMenu');
module.exports = {
  name: 'joke', aliases: ['jokes'],
  category: 'fun', description: 'Get a random joke', usage: '.joke',
  async execute(sock, msg, args, extra) {
    try {
      const joke = await APIs.getJoke();
      let t = `🤣 *${sc('joke time')}!*\n\n`;
      t += `${joke.setup}\n\n`;
      t += `🥁 *${joke.punchline}*\n\n`;
      t += `😂 iykyk`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
