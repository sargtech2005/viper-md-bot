/**
 * Magic Studio AI Art — Generate AI art from text prompts
 * Uses siputzx.my.id stable-diffusion proxy.
 * Name: 'magicstudio' (was 'imagine' — caused collision with imagegen.js)
 */

const axios = require('axios');

const BASE = 'https://api.siputzx.my.id/api/ai/magicstudio';

module.exports = {
  name: 'magicstudio',
  aliases: ['magic', 'magicai', 'studio'],
  category: 'ai',
  description: 'Generate AI art from text prompt (Magic Studio)',
  usage: '.magicstudio <prompt>',

  async execute(sock, msg, args, extra) {
    const prompt = args.join(' ').trim();
    const from   = extra.from;

    if (!prompt) {
      return extra.reply(
        '🎨 *Magic Studio — AI Art Generator*\n\n' +
        `Usage: ${extra.prefix || '.'}magicstudio <prompt>\n\n` +
        'Examples:\n' +
        `• ${extra.prefix || '.'}magicstudio a cyberpunk city at night\n` +
        `• ${extra.prefix || '.'}magicstudio majestic lion wearing a golden crown\n` +
        `• ${extra.prefix || '.'}magicstudio anime girl in a Lagos market\n\n` +
        '_The more descriptive, the better the result!_'
      );
    }

    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
    await extra.reply(`🎨 *Generating art...*\n\n📝 _"${prompt}"_\n\n⏳ Please wait up to 60s...`);

    try {
      const url = `${BASE}?prompt=${encodeURIComponent(prompt)}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
        timeout: 120000,
      });

      const imageBuffer = Buffer.from(response.data);

      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Empty response from API');
      }
      if (imageBuffer.length > 5 * 1024 * 1024) {
        throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(from, {
        image:   imageBuffer,
        caption: `🎨 *Magic Studio*\n\n📝 ${prompt}`,
      }, { quoted: msg });

    } catch (error) {
      console.error('[MagicStudio]', error.message);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });

      if (error.response?.status === 429) {
        return extra.reply('❌ Rate limit exceeded. Please try again later.');
      } else if (error.response?.status === 400) {
        return extra.reply('❌ Invalid prompt. Please try a different description.');
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return extra.reply('❌ Request timed out. The image is taking too long. Try again.');
      }
      return extra.reply(`❌ Failed to generate art: ${error.message}`);
    }
  },
};
