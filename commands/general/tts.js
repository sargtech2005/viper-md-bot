/**
 * TTS — Text to Speech
 * Uses 4 free providers with automatic fallback.
 */
const APIs = require('../../utils/api');
const axios = require('axios');

module.exports = {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'general',
  description: 'Convert text to speech',
  usage: '.tts <text>',

  async execute(sock, msg, args, extra) {
    try {
      const text = args.join(' ').trim();
      if (!text) {
        return extra.reply(
          '🔊 *Text to Speech*\n\n' +
          'Usage: `.tts <text>`\n' +
          'Example: `.tts Hello, how are you?`'
        );
      }

      await sock.sendMessage(extra.from, { react: { text: '🎙️', key: msg.key } });

      // textToSpeech now returns either a Buffer directly or a URL string
      const result = await APIs.textToSpeech(text);

      let audioBuffer;
      if (Buffer.isBuffer(result)) {
        audioBuffer = result;
      } else if (typeof result === 'string' && result.startsWith('http')) {
        const res = await axios.get(result, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        audioBuffer = Buffer.from(res.data);
      } else {
        throw new Error('Unexpected TTS response format');
      }

      if (!audioBuffer || audioBuffer.length < 500) {
        throw new Error('Audio file too small — provider may have failed silently');
      }

      await sock.sendMessage(extra.from, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: true,
      }, { quoted: msg });

      await sock.sendMessage(extra.from, { react: { text: '✅', key: msg.key } });

    } catch (error) {
      await extra.reply(`❌ TTS failed: ${error.message}`);
    }
  }
};
