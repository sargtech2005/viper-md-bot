/**
 * Quran Command - Fetch Quran verses (VIPER BOT MD)
 */
const axios = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

module.exports = {
  name: 'quran',
  aliases: ['quranverse', 'ayah'],
  category: 'utility',
  description: 'Get a Quran verse by Surah:Ayah or a random verse',
  usage: '.quran <Surah:Ayah> | .quran random',

  async execute(sock, msg, args, extra) {
    try {
      let input = args.join(' ').trim();
      let surah, ayah;

      // Popular ayahs for random
      const popular = [
        [2, 255], [1, 1], [2, 286], [3, 185], [36, 1],
        [55, 13], [112, 1], [93, 1], [94, 1], [67, 1],
        [2, 152], [3, 200], [39, 53], [2, 45], [13, 28]
      ];

      if (!input || input.toLowerCase() === 'random') {
        const pick = popular[Math.floor(Math.random() * popular.length)];
        surah = pick[0];
        ayah = pick[1];
      } else {
        // Accept formats: "2:255" or "2 255"
        const parts = input.includes(':') ? input.split(':') : input.split(' ');
        surah = parseInt(parts[0]);
        ayah = parseInt(parts[1]);
        if (isNaN(surah) || isNaN(ayah)) {
          return extra.reply('❌ Invalid format. Try:\n*.quran 2:255*\n*.quran 1:1*\n*.quran random*');
        }
        if (surah < 1 || surah > 114) {
          return extra.reply('❌ Surah must be between 1 and 114.');
        }
      }

      // Fetch Arabic + English (Sahih International) in one call
      const [arRes, enRes] = await Promise.all([
        axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`, { timeout: 10000 }),
        axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/en.sahih`, { timeout: 10000 }),
      ]);

      const ar = arRes.data.data;
      const en = enRes.data.data;

      if (!ar || !en) return extra.reply('❌ Verse not found. Please check the Surah and Ayah number.');

      let t = `┏❐ 《 *☪️ ${sc('quran verse')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📜 *Surah:* ${ar.surah.englishName} (${ar.surah.name}) — Ayah ${ar.numberInSurah}\n`;
      t += `┣◆ 🌍 *Meaning:* ${ar.surah.englishNameTranslation}\n`;
      t += `┃\n`;
      t += `┣◆ 🕌 *Arabic:*\n`;
      t += `┃${ar.text}\n`;
      t += `┃\n`;
      t += `┣◆ 📖 *English (Sahih Int'l):*\n`;
      t += `┃${en.text}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        return extra.reply('❌ Verse not found. Example:\n*.quran 2:255*\n*.quran 112:1*\n*.quran random*');
      }
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
