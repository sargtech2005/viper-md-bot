/**
 * MediaFire Download — download any file from a MediaFire link
 *
 * Usage: .mediafire <mediafire_link>
 */
const axios = require('axios');
const path  = require('path');

// File size limit: 50MB to stay within WhatsApp limits
const MAX_BYTES = 50 * 1024 * 1024;

module.exports = {
  name: 'mediafire',
  aliases: ['mf', 'mfdl'],
  category: 'download',
  description: 'Download a file from MediaFire',
  usage: '.mediafire <link>',

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        return extra.reply(
          '📦 *MediaFire Download*\n\n' +
          'Usage: `.mediafire <link>`\n\n' +
          'Example:\n`.mediafire https://www.mediafire.com/file/abc123/file.zip`'
        );
      }

      const link = args[0].trim();
      if (!link.includes('mediafire.com')) {
        return extra.reply('❌ Please provide a valid MediaFire link.');
      }

      await sock.sendMessage(extra.from, { react: { text: '⏳', key: msg.key } });
      await extra.reply('🔍 Fetching download link...');

      const directUrl = await getDirectLink(link);
      if (!directUrl) {
        return extra.reply('❌ Could not extract download link.\n\nThe file may be private, deleted, or the link is invalid.');
      }

      // Get file info via HEAD request
      const head = await axios.head(directUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
      }).catch(() => null);

      const contentLength = head?.headers?.['content-length']
        ? parseInt(head.headers['content-length'])
        : null;
      const contentType  = head?.headers?.['content-type'] || 'application/octet-stream';

      // Warn if too large
      if (contentLength && contentLength > MAX_BYTES) {
        const sizeMB = (contentLength / 1024 / 1024).toFixed(1);
        return extra.reply(
          `❌ File too large (${sizeMB} MB).\n\nWhatsApp limits documents to ~50 MB.\n\n` +
          `🔗 Direct link:\n${directUrl}`
        );
      }

      await extra.reply('📥 Downloading...');

      // Download the file
      const response = await axios.get(directUrl, {
        timeout: 120000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 10,
        maxContentLength: MAX_BYTES,
      });

      const buf      = Buffer.from(response.data);
      const fileName = extractFileName(directUrl, link);
      const mime     = response.headers['content-type'] || 'application/octet-stream';
      const sizeMB   = (buf.length / 1024 / 1024).toFixed(2);

      // Send as document (works for all file types)
      await sock.sendMessage(extra.from, {
        document: buf,
        fileName: fileName,
        mimetype: mime,
        caption: `✅ *${fileName}*\n📦 Size: ${sizeMB} MB\n\n📥 Downloaded via MediaFire`,
      }, { quoted: msg });

      await sock.sendMessage(extra.from, { react: { text: '✅', key: msg.key } });

    } catch (error) {
      const msg2 = error.message || '';
      if (msg2.includes('maxContentLength') || msg2.includes('exceeded')) {
        return extra.reply('❌ File too large to download through the bot (>50 MB).');
      }
      await extra.reply(`❌ Download failed: ${error.message}`);
    }
  }
};

// ── Extract direct download URL from a MediaFire page ───────────────────────
async function getDirectLink(pageUrl) {
  // If it's already a direct download URL pattern, return as-is
  if (pageUrl.includes('download.mediafire.com') || pageUrl.includes('/download/')) {
    return pageUrl;
  }

  const html = await axios.get(pageUrl, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    maxRedirects: 5,
  }).then(r => r.data).catch(() => null);

  if (!html) return null;

  // Try multiple extraction patterns MediaFire uses
  const patterns = [
    /id="downloadButton"[^>]*href="([^"]+)"/i,
    /href="(https:\/\/download\.mediafire\.com\/[^"]+)"/i,
    /"direct_download_url"\s*:\s*"([^"]+)"/i,
    /window\.location\.href\s*=\s*'(https:\/\/[^']+)'/i,
    /download_link['"]\s*:\s*['"]([^'"]+)['"]/i,
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1]) return m[1].replace(/&amp;/g, '&');
  }

  return null;
}

// ── Get filename from URL or original link ───────────────────────────────────
function extractFileName(directUrl, fallbackUrl) {
  try {
    const urlObj = new URL(directUrl);
    const parts  = urlObj.pathname.split('/');
    const name   = decodeURIComponent(parts[parts.length - 1]);
    if (name && name.includes('.')) return name;
  } catch (_) {}

  try {
    const parts = fallbackUrl.split('/');
    const name  = decodeURIComponent(parts[parts.length - 1]).split('?')[0];
    if (name && name.includes('.')) return name;
  } catch (_) {}

  return 'mediafire_download';
}
