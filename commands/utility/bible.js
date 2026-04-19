/**
 * Bible Command - Fetch Bible verses (VIPER BOT MD)
 */
const axios = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'bible',
  aliases: ['verse', 'bibleverse'],
  category: 'utility',
  description: 'Get a Bible verse by reference or a random verse',
  usage: '.bible <Book Chapter:Verse> | .bible random',

  async execute(sock, msg, args, extra) {
    try {
      let reference = args.join(' ').trim();

      if (!reference || reference.toLowerCase() === 'random') {
        // Random popular verses pool
        const popular = [
          'John 3:16', 'Psalm 23:1', 'Romans 8:28', 'Philippians 4:13',
          'Jeremiah 29:11', 'Proverbs 3:5', 'Isaiah 40:31', 'Matthew 6:33',
          'Psalm 46:1', 'Romans 12:2', 'Hebrews 11:1', 'James 1:2',
          'Psalm 27:1', '1 Corinthians 13:4', 'Galatians 5:22'
        ];
        reference = popular[Math.floor(Math.random() * popular.length)];
      }

      // bible-api.com — free, no key needed
      const encoded = encodeURIComponent(reference);
      const { data } = await axios.get(`https://bible-api.com/${encoded}`, { timeout: 10000 });

      if (!data || !data.text) {
        return extra.reply('❌ Verse not found. Try a format like: *.bible John 3:16*');
      }

      const verseText = data.text.replace(/\n/g, ' ').trim();
      const ref = data.reference || reference;

      let t = `┏❐ 《 *📖 ${sc('bible verse')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📜 *Reference:* ${ref}\n`;
      t += `┃\n`;
      t += `┣◆ ✝️ *Verse:*\n`;
      t += `┃${verseText}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        return extra.reply('❌ Verse not found. Example usage:\n*.bible John 3:16*\n*.bible Psalm 23:1*\n*.bible random*');
      }
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
