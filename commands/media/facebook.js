/**
 * Facebook Downloader — multi-provider with fallback
 */

const axios = require('axios');
const config = require('../../config');

const processedMessages = new Set();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

// Provider 1: getfvid / fbdownloader API
async function tryFbdownloader(url) {
  const r = await axios.post(
    'https://getfvid.com/downloader',
    new URLSearchParams({ url }),
    { timeout: 20000, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://getfvid.com/' } }
  );
  const matches = (r.data || '').match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/g) || [];
  if (matches.length) return { videoUrl: matches[0] };
  throw new Error('getfvid: no mp4');
}

// Provider 2: snapfrom / eliteprotech
async function tryEliteProTech(url) {
  const r = await axios.get(
    `https://eliteprotech-apis.zone.id/fbdown?url=${encodeURIComponent(url)}`,
    { timeout: 20000, headers: { 'User-Agent': UA } }
  );
  if (r.data?.success && r.data?.download_url) return { videoUrl: r.data.download_url, title: r.data.title };
  throw new Error('eliteprotech fb: no data');
}

// Provider 3: siputzx
async function trySiputzx(url) {
  const r = await axios.get(
    `https://api.siputzx.my.id/api/d/fb?url=${encodeURIComponent(url)}`,
    { timeout: 20000, headers: { 'User-Agent': UA } }
  );
  const videoUrl = r.data?.data?.hd || r.data?.data?.sd || r.data?.hd || r.data?.sd;
  if (videoUrl) return { videoUrl, title: r.data?.data?.title };
  throw new Error('siputzx fb: no video');
}

// Provider 4: savefrom style (yupra)
async function tryYupra(url) {
  const r = await axios.get(
    `https://api.yupra.my.id/api/downloader/facebook?url=${encodeURIComponent(url)}`,
    { timeout: 20000, headers: { 'User-Agent': UA } }
  );
  if (r.data?.success && r.data?.data?.download_url) return { videoUrl: r.data.data.download_url, title: r.data.data.title };
  throw new Error('yupra fb: no data');
}

// Provider 5: bochilteam scraper (original)
async function tryBochil(url) {
  const { facebookdl } = require('@bochilteam/scraper-facebook');
  const data = await facebookdl(url);
  if (!data?.video?.length) throw new Error('bochil: no video array');
  const option = data.video[0];
  if (!option?.download) throw new Error('bochil: no download fn');
  const videoData = await option.download();
  if (typeof videoData === 'string') return { videoUrl: videoData, title: data.title };
  if (Buffer.isBuffer(videoData)) return { buffer: videoData, title: data.title };
  if (videoData?.url) return { videoUrl: videoData.url, title: data.title };
  throw new Error('bochil: invalid format');
}

module.exports = {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl'],
  category: 'download',
  description: 'Download Facebook videos',
  usage: '.fb <Facebook URL>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const chatId = extra.from;
      const text = args.join(' ').trim() ||
                   msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text || '';

      const urlMatch = text.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.watch)\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : text.trim();

      const fbPattern = /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.watch)\//;
      if (!url || !fbPattern.test(url)) {
        return extra.reply(
          '📘 *Facebook Downloader*\n\n' +
          'Usage: `.fb <Facebook video URL>`\n' +
          'Example: `.fb https://www.facebook.com/video/xyz`\n\n' +
          '_Supports: Facebook videos, reels, watch_'
        );
      }

      await sock.sendMessage(chatId, { react: { text: '⬇️', key: msg.key } });

      const providers = [
        { name: 'EliteProTech', fn: () => tryEliteProTech(url) },
        { name: 'Siputzx',      fn: () => trySiputzx(url) },
        { name: 'Yupra',        fn: () => tryYupra(url) },
        { name: 'Bochil',       fn: () => tryBochil(url) },
        { name: 'Getfvid',      fn: () => tryFbdownloader(url) },
      ];

      let result = null;
      for (const { name, fn } of providers) {
        try {
          result = await fn();
          console.log(`[FB] ✅ ${name}`);
          break;
        } catch (e) {
          console.log(`[FB] ✗ ${name}: ${e.message}`);
        }
      }

      if (!result) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        return extra.reply('❌ Could not download this Facebook video.\n\n_The video may be private, age-restricted, or temporarily unavailable._');
      }

      const botName = config.botName.toUpperCase();
      const caption = `📘 *Downloaded by ${botName}*${result.title ? `\n\n📝 ${result.title}` : ''}`;

      if (result.buffer) {
        await sock.sendMessage(chatId, { video: result.buffer, mimetype: 'video/mp4', caption }, { quoted: msg });
      } else if (result.videoUrl) {
        try {
          await sock.sendMessage(chatId, { video: { url: result.videoUrl }, mimetype: 'video/mp4', caption }, { quoted: msg });
        } catch (urlErr) {
          // Download to buffer and retry
          const r = await axios.get(result.videoUrl, { responseType: 'arraybuffer', timeout: 60000, headers: { 'User-Agent': UA, 'Referer': 'https://www.facebook.com/' } });
          await sock.sendMessage(chatId, { video: Buffer.from(r.data), mimetype: 'video/mp4', caption }, { quoted: msg });
        }
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    } catch (error) {
      console.error('[FB] Error:', error);
      await extra.reply('❌ An error occurred. Please try again.');
    }
  }
};
