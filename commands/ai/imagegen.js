/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  .imagine — AI Image Generation  (VIPER BOT MD)      ║
 * ║                                                      ║
 * ║  Provider waterfall (best → fastest fallback):       ║
 * ║  1. Google Gemini  (gemini-2.0-flash-image) — best   ║
 * ║  2. Pollinations   (nanobanana model) — free, no key ║
 * ║  3. felo.ai proxy  (Gemini Flash mirror) — free      ║
 * ╚══════════════════════════════════════════════════════╝
 */

const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

// ── Helper: download image URL → Buffer ─────────────────────────────────────
async function urlToBuffer(url) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: 10 * 1024 * 1024,
    headers: { 'User-Agent': UA },
    validateStatus: s => s >= 200 && s < 400,
  });
  const buf = Buffer.from(r.data);
  if (buf.length < 4096) throw new Error(`Image too small (${buf.length} bytes)`);
  return buf;
}

// ── Provider 1: Google Gemini official ──────────────────────────────────────
async function fromGemini(prompt) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_KEY}`;
  const r = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  }, {
    timeout: 90000,
    headers: { 'Content-Type': 'application/json' },
  });

  const parts = r.data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('Gemini: no image in response');

  const buf = Buffer.from(imgPart.inlineData.data, 'base64');
  if (buf.length < 4096) throw new Error('Gemini: image buffer too small');
  return { buf, mime: imgPart.inlineData.mimeType };
}

// ── Provider 2: Pollinations.ai (nanobanana model, 100% free, no key) ───────
async function fromPollinations(prompt) {
  const seed    = Math.floor(Math.random() * 999999);
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=nanobanana&width=1024&height=1024&nologo=true&seed=${seed}&enhance=true`;
  const buf = await urlToBuffer(url);
  return { buf, mime: 'image/jpeg' };
}

// ── Provider 3: felo.ai Gemini proxy (free, no key) ─────────────────────────
async function fromFelo(prompt) {
  const r = await axios.post('https://api.felo.ai/v1/gemini-image-gen', {
    prompt,
    resolution: '1024x1024',
    model: 'gemini-2.5-flash-image-preview',
  }, {
    timeout: 90000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer free',
      'User-Agent': UA,
    },
    responseType: 'arraybuffer',
    validateStatus: s => s >= 200 && s < 400,
  });

  const buf = Buffer.from(r.data);
  // felo might return JSON with a URL instead of raw bytes
  if (buf[0] === 0x7B) { // '{'
    const json = JSON.parse(buf.toString());
    const imgUrl = json?.data?.url || json?.url || json?.image_url;
    if (!imgUrl) throw new Error('felo: no image URL in JSON response');
    return { buf: await urlToBuffer(imgUrl), mime: 'image/jpeg' };
  }
  if (buf.length < 4096) throw new Error(`felo: response too small (${buf.length} bytes)`);
  return { buf, mime: 'image/jpeg' };
}

// ── Main command ─────────────────────────────────────────────────────────────
module.exports = {
  name: 'imagine',
  aliases: ['gen', 'create', 'img', 'nanobanana', 'nb'],
  category: 'ai',
  description: 'Generate AI images from text using Nano Banana (Gemini)',
  usage: '.imagine <description>',

  async execute(sock, msg, args, extra) {
    const prompt = args.join(' ').trim();
    const from   = extra.from;

    if (!prompt) {
      return extra.reply(
        '🍌 *Nano Banana — AI Image Generator*\n\n' +
        'Generate any image using Google Gemini AI.\n\n' +
        `*Usage:* ${extra.prefix || '.'}imagine <description>\n\n` +
        '*Examples:*\n' +
        `• ${extra.prefix || '.'}imagine a lion wearing a crown at sunset\n` +
        `• ${extra.prefix || '.'}imagine cyberpunk Lagos city at night, neon lights\n` +
        `• ${extra.prefix || '.'}imagine cute cartoon dog holding a flag of Nigeria\n\n` +
        '_Tip: The more detail you give, the better the image!_'
      );
    }

    // Loading reaction
    await sock.sendMessage(from, { react: { text: '🍌', key: msg.key } });
    await extra.reply(`🍌 *Generating your image...*\n\n📝 _"${prompt}"_\n\n⏳ Please wait...`);

    const providers = [
      { name: 'Gemini',       fn: () => fromGemini(prompt) },
      { name: 'Pollinations', fn: () => fromPollinations(prompt) },
      { name: 'Felo AI',      fn: () => fromFelo(prompt) },
    ];

    let result = null;
    let usedProvider = '';

    for (const { name, fn } of providers) {
      try {
        console.log(`[Imagine] Trying ${name}...`);
        result = await fn();
        usedProvider = name;
        console.log(`[Imagine] ✅ ${name} — ${result.buf.length} bytes`);
        break;
      } catch (e) {
        console.log(`[Imagine] ${name} failed: ${e.message}`);
      }
    }

    if (!result) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return extra.reply('❌ All image providers failed. Please try again shortly.');
    }

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

    await sock.sendMessage(from, {
      image:   result.buf,
      caption: `🍌 *Nano Banana*\n\n📝 ${prompt}\n\n_Generated by ${usedProvider}_`,
      mimetype: result.mime,
    }, { quoted: msg });
  },
};
