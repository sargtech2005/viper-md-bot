/**
 * .advice — AI-powered life advice (adviceslip.com, free)
 * .advice <topic> for targeted advice
 */
const axios  = require('axios');
const APIs   = require('../../utils/api');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

module.exports = {
  name: 'advice',
  aliases: ['advise', 'tip', 'lifetip'],
  category: 'general',
  description: 'Get life advice or advice on any topic',
  usage: '.advice [topic]',

  async execute(sock, msg, args, extra) {
    try {
      const topic = args.join(' ').trim();
      await sock.sendMessage(extra.from, { react: { text: '🧠', key: msg.key } });

      let adviceText = '';

      if (topic) {
        // Search adviceslip for topic-specific advice
        try {
          const { data } = await axios.get(
            `https://api.adviceslip.com/advice/search/${encodeURIComponent(topic)}`,
            { timeout: 10000 }
          );
          const slips = data?.slips;
          if (Array.isArray(slips) && slips.length) {
            // Pick a random one from results
            const pick = slips[Math.floor(Math.random() * Math.min(slips.length, 5))];
            adviceText = pick.advice;
          }
        } catch (_) {}

        // Fallback: use Claude/AI via APIs if available
        if (!adviceText) {
          try {
            adviceText = await APIs.getAIResponse(
              `Give one short but powerful piece of life advice about: "${topic}". 2-3 sentences max. Be direct and practical.`
            );
          } catch (_) {}
        }

        // Final fallback: random advice from slip
        if (!adviceText) {
          const { data } = await axios.get('https://api.adviceslip.com/advice', { timeout: 10000 });
          adviceText = data?.slip?.advice || 'Keep going. Every step forward counts.';
        }
      } else {
        // Random advice
        const { data } = await axios.get('https://api.adviceslip.com/advice', { timeout: 10000 });
        adviceText = data?.slip?.advice || 'Keep going. Every step forward counts.';
      }

      const emojis = ['💡', '🌟', '🧠', '✨', '🔥', '💎', '🎯', '🌱'];
      const emoji  = emojis[Math.floor(Math.random() * emojis.length)];

      let t = `┏❐ 《 *${emoji} ${sc('life advice')}* 》 ❐\n┃\n`;
      if (topic) t += `┣◆ 🎯 *Topic:* ${topic}\n┃\n`;
      t += `┣◆ 💬 *${sc('advice')}:*\n`;
      t += `┃  _"${adviceText}"_\n`;
      t += `┃\n┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
