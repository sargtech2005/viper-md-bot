/**
 * SSWeb — Screenshot a website
 * Uses 3 free APIs with automatic fallback so it doesn't silently fail.
 */
const axios = require('axios');

// ── Screenshot providers (no API key needed) ─────────────────────────────────
const PROVIDERS = [
  // 1. EliteProTech (original)
  async (url) => {
    const r = await axios.get(
      `https://eliteprotech-apis.zone.id/ssweb?url=${encodeURIComponent(url)}`,
      { timeout: 25000, responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (r.headers['content-type']?.includes('image')) return Buffer.from(r.data);
    const j = JSON.parse(Buffer.from(r.data).toString());
    const link = j?.url || j?.data?.url || j?.image;
    if (!link) throw new Error('No image in response');
    const img = await axios.get(link, { timeout: 20000, responseType: 'arraybuffer' });
    return Buffer.from(img.data);
  },

  // 2. Thum.io — completely free, no key
  async (url) => {
    const r = await axios.get(
      `https://image.thum.io/get/width/1280/crop/900/${encodeURIComponent(url)}`,
      { timeout: 25000, responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!r.headers['content-type']?.includes('image')) throw new Error('Not an image');
    return Buffer.from(r.data);
  },

  // 3. WordPress mshots — free, no key
  async (url) => {
    const r = await axios.get(
      `https://s0.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1280&h=900`,
      { timeout: 30000, responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const ct = r.headers['content-type'] || '';
    if (!ct.includes('image') || r.data.length < 5000) throw new Error('Blank/error image');
    return Buffer.from(r.data);
  },

  // 4. Microlink — free tier, no key
  async (url) => {
    const r = await axios.get('https://api.microlink.io/', {
      params: { url, screenshot: true, meta: false, embed: 'screenshot.url' },
      timeout: 30000, responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const ct = r.headers['content-type'] || '';
    if (ct.includes('image')) return Buffer.from(r.data);
    // microlink may return JSON with a URL instead
    const j = JSON.parse(Buffer.from(r.data).toString());
    const ssUrl = j?.data?.screenshot?.url;
    if (!ssUrl) throw new Error('No screenshot URL');
    const img = await axios.get(ssUrl, { timeout: 20000, responseType: 'arraybuffer' });
    return Buffer.from(img.data);
  },
];

module.exports = {
  name: 'ssweb',
  aliases: ['screenshot', 'ss', 'webss'],
  category: 'general',
  description: 'Take a screenshot of a website',
  usage: '.ssweb <url>',

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        return extra.reply(
          '📸 *Screenshot Website*\n\n' +
          'Usage: `.ssweb <url>`\n\n' +
          'Example: `.ssweb https://github.com`'
        );
      }

      let url = args[0].trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      await sock.sendMessage(extra.from, { react: { text: '📸', key: msg.key } });

      let buf = null;
      let lastErr = '';

      for (let i = 0; i < PROVIDERS.length; i++) {
        try {
          buf = await PROVIDERS[i](url);
          if (buf && buf.length > 3000) break; // valid image
          buf = null;
          throw new Error('Image too small');
        } catch (e) {
          lastErr = e.message;
          buf = null;
        }
      }

      if (!buf) {
        return extra.reply(`❌ Could not screenshot that page.\n\nAll providers failed: ${lastErr}`);
      }

      await sock.sendMessage(extra.from, {
        image: buf,
        caption: `📸 Screenshot of: ${url}`,
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`❌ Screenshot failed: ${error.message}`);
    }
  }
};
