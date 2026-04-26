/**
 * TikTok Downloader — multi-provider, no watermark
 */

const APIs = require('../../utils/api');
const axios = require('axios');
const config = require('../../config');

const processedMessages = new Set();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'download',
  description: 'Download TikTok videos (no watermark)',
  usage: '.tiktok <TikTok URL>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const chatId = extra?.from || msg.key.remoteJid;
      const text = args.join(' ').trim() ||
                   msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text || '';

      const urlMatch = text.match(/https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : text.trim();

      const ttPattern = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//;
      if (!url || !ttPattern.test(url)) {
        const reply = extra?.reply || ((t) => sock.sendMessage(chatId, { text: t }, { quoted: msg }));
        return reply(
          '🎵 *TikTok Downloader*\n\n' +
          'Usage: `.tt <TikTok URL>`\n' +
          'Example: `.tt https://vm.tiktok.com/xxx`\n\n' +
          '_Downloads without watermark!_'
        );
      }

      await sock.sendMessage(chatId, { react: { text: '⬇️', key: msg.key } });

      let result = null;
      try {
        result = await APIs.tiktokDownload(url);
      } catch (err) {
        // Try ruhend-scraper fallback
        try {
          const { ttdl } = require('ruhend-scraper');
          const data = await ttdl(url);
          if (data?.data?.length) {
            for (const m of data.data) {
              if (m.type === 'video' || /\.(mp4|mov)/i.test(m.url || '')) {
                result = { videoUrl: m.url, title: 'TikTok Video' };
                break;
              }
            }
          }
          if (!result) throw new Error('ruhend: no video');
        } catch (e2) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
          const reply = extra?.reply || ((t) => sock.sendMessage(chatId, { text: t }, { quoted: msg }));
          return reply(`❌ Could not download TikTok video.\n\nAll providers failed. Please try a different link.\n_Error: ${err.message}_`);
        }
      }

      if (!result?.videoUrl) {
        const reply = extra?.reply || ((t) => sock.sendMessage(chatId, { text: t }, { quoted: msg }));
        return reply('❌ No video URL found. Please try again.');
      }

      const botName = config.botName.toUpperCase();
      const caption = `🎵 *Downloaded by ${botName}*${result.title ? `\n\n📝 ${result.title}` : ''}`;

      try {
        // Download to buffer for reliability
        const r = await axios.get(result.videoUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: 100 * 1024 * 1024,
          headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/', 'Accept': 'video/mp4,video/*,*/*' }
        });
        const buf = Buffer.from(r.data);
        if (buf.length < 1000) throw new Error('buffer too small');

        await sock.sendMessage(chatId, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
      } catch (dlErr) {
        // URL method fallback
        await sock.sendMessage(chatId, { video: { url: result.videoUrl }, mimetype: 'video/mp4', caption }, { quoted: msg });
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    } catch (error) {
      console.error('[TT] Error:', error);
      const reply = extra?.reply || ((t) => sock.sendMessage(msg.key.remoteJid, { text: t }, { quoted: msg }));
      await reply('❌ An error occurred. Please try again.');
    }
  }
};
