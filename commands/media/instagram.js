/**
 * Instagram Downloader — multi-provider with proper fallback
 */

const APIs = require('../../utils/api');
const axios = require('axios');
const config = require('../../config');

const processedMessages = new Set();

module.exports = {
  name: 'instagram',
  aliases: ['ig', 'insta', 'igdl', 'reels'],
  category: 'download',
  description: 'Download Instagram photos/videos/reels',
  usage: '.ig <Instagram URL>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const chatId = extra.from;
      const text = args.join(' ').trim() ||
                   msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text || '';

      const urlMatch = text.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : text.trim();

      if (!url || !url.includes('instagram.com')) {
        return extra.reply(
          '📸 *Instagram Downloader*\n\n' +
          'Usage: `.ig <Instagram URL>`\n' +
          'Example: `.ig https://www.instagram.com/p/xxx`\n\n' +
          '_Works with posts, reels, stories & carousels_'
        );
      }

      await sock.sendMessage(chatId, { react: { text: '📥', key: msg.key } });

      let mediaList = [];
      try {
        mediaList = await APIs.igDownload(url);
      } catch (err) {
        // Final fallback: try ruhend-scraper if available
        try {
          const { igdl } = require('ruhend-scraper');
          const data = await igdl(url);
          if (data?.data?.length) mediaList = data.data;
          else throw new Error('ruhend returned no data');
        } catch (e2) {
          return extra.reply(`❌ Could not download from Instagram.\n\nThe post may be private or the link is invalid.\n_Error: ${err.message}_`);
        }
      }

      if (!mediaList || mediaList.length === 0) {
        return extra.reply('❌ No media found. The post might be private or the link is invalid.');
      }

      // Deduplicate by URL
      const seen = new Set();
      const unique = mediaList.filter(m => {
        if (!m?.url || seen.has(m.url)) return false;
        seen.add(m.url); return true;
      }).slice(0, 10);

      const botName = config.botName.toUpperCase();
      let sentCount = 0;

      for (const media of unique) {
        try {
          const mediaUrl = media.url;
          const isVideo = media.type === 'video' ||
                          /\.(mp4|mov|avi|webm)/i.test(mediaUrl) ||
                          url.includes('/reel/') || url.includes('/tv/');

          if (isVideo) {
            await sock.sendMessage(chatId, {
              video: { url: mediaUrl },
              mimetype: 'video/mp4',
              caption: sentCount === 0 ? `📥 *Downloaded by ${botName}*` : ''
            }, { quoted: msg });
          } else {
            await sock.sendMessage(chatId, {
              image: { url: mediaUrl },
              caption: sentCount === 0 ? `📥 *Downloaded by ${botName}*` : ''
            }, { quoted: msg });
          }

          sentCount++;
          if (sentCount < unique.length) await new Promise(r => setTimeout(r, 800));
        } catch (e) {
          console.error(`[IG] media send error: ${e.message}`);
        }
      }

      if (sentCount === 0) {
        await extra.reply('❌ Failed to send media. The files may have expired or are inaccessible.');
      } else {
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
      }
    } catch (error) {
      console.error('[IG] Error:', error);
      await extra.reply('❌ An error occurred. Please try again.');
    }
  }
};
