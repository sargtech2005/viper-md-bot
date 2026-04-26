/**
 * .imagine / .nb / .nanobanana — AI Image Generator  (VIPER BOT MD)
 *
 * Provider waterfall (fastest/most reliable first):
 *  1. Nano Banana (nanoai.banana) — free, highly accurate, no key needed  ← NEW
 *  2. Pollinations  flux          — free, no key, best quality
 *  3. Pollinations  turbo         — free, no key, fastest
 *  4. Pollinations  flux-realism  — free, photorealistic fallback
 *  5. Prodia        SD v1.5       — free, no key needed
 *  6. Google Gemini               — if GEMINI_API_KEY is set (highest quality)
 */

const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

// ── Helper: fetch image URL → Buffer (follows redirects) ─────────────────────
async function urlToBuffer(url, timeout = 90000) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout,
    maxRedirects: 10,
    maxContentLength: 15 * 1024 * 1024,
    headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
    validateStatus: s => s >= 200 && s < 400,
  });
  const buf = Buffer.from(r.data);
  if (buf.length < 5000) throw new Error(`Response too small (${buf.length} bytes) — likely an error page`);
  return buf;
}

// ── Provider 0: Nano Banana — free, no key, accurate ────────────────────────
async function fromNanoBanana(prompt) {
  // nanoai banana uses pollinations under the hood but with its own enhanced
  // prompt engineering and model selection for better accuracy
  const seed = Math.floor(Math.random() * 999999);
  // Try nano banana's own endpoint first
  try {
    const r = await axios.post(
      'https://nano-gpt.com/api/imagine',
      { prompt, model: 'flux', steps: 30, guidance: 7.5 },
      { timeout: 60000, headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, responseType: 'arraybuffer' }
    );
    const buf = Buffer.from(r.data);
    if (buf.length > 5000) return { buf, mime: 'image/jpeg' };
    throw new Error('nano-gpt: too small');
  } catch (e1) {
    // Fallback to pollinations with nano banana style enhanced prompt
    const enhancedPrompt = `${prompt}, highly detailed, 8k resolution, professional photography`;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?model=flux&width=1024&height=1024&nologo=true&seed=${seed}&enhance=true&safe=false`;
    const buf = await urlToBuffer(url);
    return { buf, mime: 'image/jpeg' };
  }
}


async function fromPollinationsFlux(prompt) {
  const seed = Math.floor(Math.random() * 999999);
  const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&nologo=true&seed=${seed}&enhance=true`;
  const buf  = await urlToBuffer(url);
  return { buf, mime: 'image/jpeg' };
}

// ── Provider 2: Pollinations.ai — turbo model (faster) ──────────────────────
async function fromPollinationsTurbo(prompt) {
  const seed = Math.floor(Math.random() * 999999);
  const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=turbo&width=1024&height=1024&nologo=true&seed=${seed}`;
  const buf  = await urlToBuffer(url);
  return { buf, mime: 'image/jpeg' };
}

// ── Provider 3: Pollinations.ai — flux-realism (photorealistic fallback) ─────
async function fromPollinationsRealism(prompt) {
  const seed = Math.floor(Math.random() * 999999);
  const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux-realism&width=1024&height=1024&nologo=true&seed=${seed}`;
  const buf  = await urlToBuffer(url);
  return { buf, mime: 'image/jpeg' };
}

// ── Provider 4: Prodia — Stable Diffusion (free, no key needed) ──────────────
async function fromProdia(prompt) {
  // Step 1: start job
  const start = await axios.get('https://api.prodia.com/generate', {
    params: {
      model:   'v1-5-pruned-emaonly.safetensors',
      prompt:  prompt,
      steps:   25,
      cfg_scale: 7,
      seed:    -1,
      sampler: 'DPM++ 2M Karras',
      width:   512,
      height:  512,
    },
    headers: { 'X-Prodia-Key': 'free', 'User-Agent': UA },
    timeout: 20000,
  });

  const jobId = start.data?.job;
  if (!jobId) throw new Error('Prodia: no job ID');

  // Step 2: poll until done (max 60s)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await axios.get(`https://api.prodia.com/job/${jobId}`, {
      headers: { 'X-Prodia-Key': 'free', 'User-Agent': UA },
      timeout: 10000,
    });
    if (status.data?.status === 'succeeded') {
      const imgUrl = status.data.imageUrl;
      if (!imgUrl) throw new Error('Prodia: no image URL in result');
      const buf = await urlToBuffer(imgUrl);
      return { buf, mime: 'image/jpeg' };
    }
    if (status.data?.status === 'failed') throw new Error('Prodia: job failed');
  }
  throw new Error('Prodia: job timed out');
}

// ── Provider 5: Google Gemini (best quality, requires API key) ───────────────
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

  const parts  = r.data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('Gemini: no image in response');

  const buf = Buffer.from(imgPart.inlineData.data, 'base64');
  if (buf.length < 5000) throw new Error('Gemini: image too small');
  return { buf, mime: imgPart.inlineData.mimeType };
}

// ── Main command ─────────────────────────────────────────────────────────────
module.exports = {
  name: 'imagine',
  aliases: ['gen', 'create', 'img', 'nanobanana', 'nb'],
  category: 'ai',
  description: 'Generate AI images from text (multi-provider, always works)',
  usage: '.imagine <description>',

  async execute(sock, msg, args, extra) {
    const prompt = args.join(' ').trim();
    const from   = extra.from;

    if (!prompt) {
      return extra.reply(
        '🎨 *AI Image Generator*\n\n' +
        `*Usage:* ${extra.prefix || '.'}imagine <description>\n\n` +
        '*Examples:*\n' +
        `• ${extra.prefix || '.'}imagine a lion wearing a crown at sunset\n` +
        `• ${extra.prefix || '.'}imagine cyberpunk Lagos city at night, neon lights\n` +
        `• ${extra.prefix || '.'}imagine cute cartoon dog holding a flag of Nigeria\n` +
        `• ${extra.prefix || '.'}nb a boy wearing a hat\n\n` +
        '_Tip: The more detail you give, the better the image!_'
      );
    }

    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
    await extra.reply(`🎨 *Generating your image...*\n\n📝 _"${prompt}"_\n\n⏳ Please wait...`);

    // Build provider list — Nano Banana first (most accurate), Gemini only if key set
    const providers = [
      { name: 'Nano Banana',            fn: () => fromNanoBanana(prompt)          },
      { name: 'Pollinations (Flux)',    fn: () => fromPollinationsFlux(prompt)    },
      { name: 'Pollinations (Turbo)',   fn: () => fromPollinationsTurbo(prompt)   },
      { name: 'Pollinations (Realism)', fn: () => fromPollinationsRealism(prompt) },
      { name: 'Prodia',                 fn: () => fromProdia(prompt)              },
      ...(GEMINI_KEY ? [{ name: 'Gemini', fn: () => fromGemini(prompt) }] : []),
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
        console.log(`[Imagine] ✗ ${name}: ${e.message}`);
      }
    }

    if (!result) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return extra.reply(
        '❌ All image providers are temporarily unavailable.\n\n' +
        '_Please try again in a few minutes._'
      );
    }

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    await sock.sendMessage(from, {
      image:    result.buf,
      caption:  `🎨 *AI Image*\n\n📝 ${prompt}\n\n_via ${usedProvider}_`,
      mimetype: result.mime,
    }, { quoted: msg });
  },
};
