/**
 * .song / .play — Download audio from YouTube
 *
 * Audio corruption fix: WhatsApp requires either:
 *   - audio/mpeg (MP3) for saved audio files
 *   - audio/ogg; codecs=opus for voice notes
 *
 * Many APIs return AAC in MP4 container (.m4a) or WebM/Opus.
 * We ALWAYS convert to MP3 via ffmpeg to guarantee a playable file.
 */

const yts   = require('yt-search');
const axios  = require('axios');
const { ffmpeg } = require('../../utils/converter');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, tries = 3, delay = 1500) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < tries) await sleep(delay * i); }
  }
  throw last;
}

// ── Download URL → Buffer (arraybuffer then stream fallback) ─────────────────
async function downloadToBuffer(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Referer': 'https://www.youtube.com/',
  };

  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers,
      validateStatus: s => s >= 200 && s < 400,
    });
    const buf = Buffer.from(r.data);
    if (buf.length > 8192) return buf;
    throw new Error(`Buffer too small: ${buf.length} bytes`);
  } catch (e1) {
    if (e1.response?.status === 451) throw new Error('Content blocked (451)');
    if (e1.response?.status === 403) throw new Error('Access denied (403)');
  }

  // Stream fallback
  const r = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    maxContentLength: Infinity,
    headers,
    validateStatus: s => s >= 200 && s < 400,
  });
  const chunks = [];
  await new Promise((res, rej) => {
    r.data.on('data', c => chunks.push(c));
    r.data.on('end', res);
    r.data.on('error', rej);
  });
  const buf = Buffer.concat(chunks);
  if (buf.length < 8192) throw new Error(`Stream too small: ${buf.length} bytes`);
  return buf;
}

// ── Detect actual audio format from magic bytes ──────────────────────────────
function detectAudioFormat(buf) {
  if (!buf || buf.length < 16) return 'mp3';

  // MP3: ID3 tag or MPEG sync
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3'; // ID3
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return 'mp3';           // MPEG sync

  // OGG / WebM Opus
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'ogg';

  // WebM / MKV
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'webm';

  // WAV
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav';

  // MP4 / M4A — ftyp box (box size 4 bytes, then 'ftyp')
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'm4a';
  // Some MP4s start with 0x00000018 or similar
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf.slice(4, 8).toString('ascii') === 'ftyp') return 'm4a';

  // FLAC
  if (buf.slice(0, 4).toString('ascii') === 'fLaC') return 'flac';

  // Default to m4a (most common from YT download APIs)
  return 'm4a';
}

// ── Convert any audio buffer to MP3 via ffmpeg ───────────────────────────────
async function toMP3(buffer, inputExt) {
  // Already MP3 — validate it's playable before skipping conversion
  if (inputExt === 'mp3') {
    // Quick sanity: check it has ID3 or MPEG sync
    if (buffer[0] === 0x49 || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
      return buffer; // Genuine MP3, no conversion needed
    }
    // Looks like MP3 by extension but magic bytes say otherwise — convert anyway
    inputExt = 'm4a';
  }

  // Use ffmpeg to convert: input ext → mp3
  const mp3Buffer = await ffmpeg(buffer, [
    '-vn',                  // no video
    '-map_metadata', '-1',  // strip metadata (avoids iTunes-specific tags that confuse WA)
    '-ac', '2',             // stereo
    '-ar', '44100',         // 44.1kHz sample rate
    '-b:a', '128k',         // 128 kbps
    '-f', 'mp3',            // force mp3 output format
  ], inputExt, 'mp3');

  if (!mp3Buffer || mp3Buffer.length < 8192) {
    throw new Error(`ffmpeg produced empty output (${mp3Buffer?.length || 0} bytes)`);
  }
  return mp3Buffer;
}

// ── Download APIs ─────────────────────────────────────────────────────────────

async function apiYupra(url) {
  const r = await withRetry(() => axios.get(
    `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 35000 }
  ));
  const d = r.data?.data;
  if (r.data?.success && d?.download_url)
    return { url: d.download_url, title: d.title, ext: 'mp3' };
  throw new Error('Yupra: no URL');
}

async function apiSiputzx(url) {
  const r = await withRetry(() => axios.get(
    `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 35000 }
  ));
  const dlUrl = r.data?.data?.url || r.data?.dl || r.data?.url;
  if (dlUrl) return { url: dlUrl, title: r.data?.data?.title || r.data?.title, ext: 'mp3' };
  throw new Error('Siputzx: no URL');
}

async function apiEliteProTech(url) {
  const r = await withRetry(() => axios.get(
    `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(url)}&format=mp3`,
    { timeout: 35000 }
  ));
  if (r.data?.success && r.data?.downloadURL)
    return { url: r.data.downloadURL, title: r.data.title, ext: 'mp3' };
  throw new Error('EliteProTech: no URL');
}

async function apiOkatsu(url) {
  const r = await withRetry(() => axios.get(
    `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 35000 }
  ));
  if (r.data?.dl) return { url: r.data.dl, title: r.data.title, ext: 'mp3' };
  throw new Error('Okatsu: no URL');
}

async function apiIzumiUrl(url) {
  const r = await withRetry(() => axios.get(
    `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=mp3`,
    { timeout: 35000 }
  ));
  if (r.data?.result?.download)
    return { url: r.data.result.download, title: r.data.result.title, ext: 'mp3' };
  throw new Error('IzumiURL: no URL');
}

async function apiIzumiQuery(query) {
  const r = await withRetry(() => axios.get(
    `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`,
    { timeout: 35000 }
  ));
  if (r.data?.result?.download)
    return { url: r.data.result.download, title: r.data.result.title, ext: 'mp3' };
  throw new Error('IzumiQuery: no URL');
}

async function apiCobalt(url) {
  const r = await withRetry(() => axios.post('https://cobalt.tools/api/json', {
    url, aFormat: 'mp3', isAudioOnly: true, disableMetadata: true,
  }, {
    timeout: 25000,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }));
  if (r.data?.status === 'stream' && r.data?.url)
    return { url: r.data.url, ext: 'mp3' };
  const picked = r.data?.picker?.find(p => p.type === 'audio') || r.data?.picker?.[0];
  if (picked?.url) return { url: picked.url, ext: 'mp3' };
  throw new Error('Cobalt: no URL');
}

async function apiInvidious(url) {
  // Invidious public instances — open source YT frontend with direct audio links
  const vidId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (!vidId) throw new Error('Invidious: no video ID');
  const instances = [
    'https://invidious.jing.rocks',
    'https://inv.nadeko.net',
    'https://invidious.privacydev.net',
  ];
  for (const base of instances) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${vidId}`, { timeout: 20000 });
      const streams = r.data?.adaptiveFormats || [];
      // Pick best audio-only stream
      const audio = streams
        .filter(s => s.type?.includes('audio') && !s.type?.includes('video'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (audio?.url) {
        const ext = audio.type?.includes('webm') ? 'webm' : 'm4a';
        return { url: audio.url, title: r.data?.title, ext };
      }
    } catch {}
  }
  throw new Error('Invidious: no audio stream found');
}

// ── Main command ──────────────────────────────────────────────────────────────
module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'download',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube URL>',

  async execute(sock, msg, args) {
    const text   = args.join(' ').trim();
    const chatId = msg.key.remoteJid;

    if (!text) {
      return sock.sendMessage(chatId, {
        text: '🎵 Usage: *.song <song name or YouTube URL>*\n\nExample: *.song Burna Boy Last Last*',
      }, { quoted: msg });
    }

    // ── 1. Search / resolve ───────────────────────────────────────────────
    const isYtUrl = /youtu(\.be|be\.com)/.test(text);
    let videoUrl = isYtUrl ? text : null;
    let videoTitle, videoThumb, videoDuration;

    try {
      if (!isYtUrl) {
        const search = await yts(text);
        if (!search?.videos?.length)
          return sock.sendMessage(chatId, { text: '❌ No results found. Try a different search.' }, { quoted: msg });
        const v       = search.videos[0];
        videoUrl      = v.url;
        videoTitle    = v.title;
        videoThumb    = v.thumbnail;
        videoDuration = v.timestamp;
      } else {
        try {
          const vidId = text.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
          if (vidId) {
            const meta  = await yts({ videoId: vidId });
            videoTitle    = meta?.title;
            videoThumb    = meta?.thumbnail;
            videoDuration = meta?.timestamp;
          }
        } catch {}
      }
    } catch (e) {
      return sock.sendMessage(chatId, { text: `❌ Search failed: ${e.message}` }, { quoted: msg });
    }

    // ── 2. Send loading message ───────────────────────────────────────────
    const loadingCaption = `🎵 *${videoTitle || 'Downloading...'}*${videoDuration ? `\n⏱ ${videoDuration}` : ''}\n\n⏳ _Fetching audio..._`;
    try {
      if (videoThumb) {
        await sock.sendMessage(chatId, { image: { url: videoThumb }, caption: loadingCaption }, { quoted: msg });
      } else {
        await sock.sendMessage(chatId, { text: loadingCaption }, { quoted: msg });
      }
    } catch {}

    // ── 3. Try download APIs ──────────────────────────────────────────────
    const apis = [
      { name: 'Yupra',        fn: () => apiYupra(videoUrl) },
      { name: 'Siputzx',      fn: () => apiSiputzx(videoUrl) },
      { name: 'EliteProTech', fn: () => apiEliteProTech(videoUrl) },
      { name: 'Okatsu',       fn: () => apiOkatsu(videoUrl) },
      { name: 'Cobalt',       fn: () => apiCobalt(videoUrl) },
      { name: 'IzumiURL',     fn: () => apiIzumiUrl(videoUrl) },
      { name: 'Invidious',    fn: () => apiInvidious(videoUrl) },
      // Query-based last resort
      { name: 'IzumiQuery',   fn: () => apiIzumiQuery(videoTitle || text) },
    ];

    let rawBuffer = null;
    let rawExt    = 'mp3';
    let resolvedTitle = videoTitle || text;

    for (const { name, fn } of apis) {
      try {
        console.log(`[Song] Trying ${name}...`);
        const result = await fn();
        if (!result?.url) { console.log(`[Song] ${name}: no URL`); continue; }
        if (result.title) resolvedTitle = result.title;

        const buf = await downloadToBuffer(result.url);
        if (!buf || buf.length < 8192) { console.log(`[Song] ${name}: download too small`); continue; }

        rawBuffer = buf;
        rawExt    = result.ext || detectAudioFormat(buf);
        console.log(`[Song] ✅ ${name} — ${buf.length} bytes, detected format: ${rawExt}`);
        break;
      } catch (e) {
        console.log(`[Song] ${name} failed: ${e.message}`);
      }
    }

    if (!rawBuffer) {
      return sock.sendMessage(chatId, {
        text: '❌ All download sources failed.\n\n• The song may be age-restricted or unavailable\n• Try a different search term\n• Paste the YouTube link directly',
      }, { quoted: msg });
    }

    // ── 4. Detect actual format from magic bytes (don't trust API claims) ─
    const detectedExt = detectAudioFormat(rawBuffer);
    console.log(`[Song] API said: ${rawExt}, magic bytes say: ${detectedExt} — using ${detectedExt}`);

    // ── 5. Convert to MP3 — ALWAYS — to guarantee WhatsApp compatibility ──
    let finalBuffer;
    try {
      finalBuffer = await toMP3(rawBuffer, detectedExt);
      console.log(`[Song] Converted to MP3: ${finalBuffer.length} bytes`);
    } catch (convErr) {
      console.error(`[Song] ffmpeg conversion failed: ${convErr.message}`);
      // Last resort: send raw buffer and hope WA can play it
      finalBuffer = rawBuffer;
    }

    if (!finalBuffer || finalBuffer.length < 4096) {
      return sock.sendMessage(chatId, {
        text: '❌ Audio processing failed. Please try again.',
      }, { quoted: msg });
    }

    // ── 6. Send ───────────────────────────────────────────────────────────
    const safeName = (resolvedTitle || 'audio')
      .replace(/[^\w\s\-]/g, '')
      .trim()
      .slice(0, 60) || 'audio';

    await sock.sendMessage(chatId, {
      audio:    finalBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${safeName}.mp3`,
      ptt:      false,
    }, { quoted: msg });
  },
};
