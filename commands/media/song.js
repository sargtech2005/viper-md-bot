/**
 * .song / .play — Download audio from YouTube
 *
 * PRIMARY:  ytdl-core  (direct, no external API, already in package.json)
 * FALLBACK: public APIs tried in sequence if ytdl-core fails
 *
 * Audio always converted to MP3 via ffmpeg for WhatsApp compatibility.
 */

const yts    = require('yt-search');
const ytdl   = require('@distube/ytdl-core');
const axios  = require('axios');
const { ffmpeg } = require('../../utils/converter');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Hard timeout wrapper — prevents any single operation from hanging forever
function withTimeout(fn, ms, label) {
  return Promise.race([
    (typeof fn === 'function' ? fn() : fn),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function withRetry(fn, tries = 2, delay = 1000) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < tries) await sleep(delay * i); }
  }
  throw last;
}

// ── Detect actual audio format from magic bytes ──────────────────────────────
function detectAudioFormat(buf) {
  if (!buf || buf.length < 16) return 'mp3';
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3';
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return 'mp3';
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'webm';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'm4a';
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf.slice(4, 8).toString('ascii') === 'ftyp') return 'm4a';
  if (buf.slice(0, 4).toString('ascii') === 'fLaC') return 'flac';
  return 'm4a';
}

// ── Convert to MP3 via ffmpeg ─────────────────────────────────────────────────
async function toMP3(buffer, inputExt) {
  if (inputExt === 'mp3') {
    if (buffer[0] === 0x49 || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
      return buffer;
    }
    inputExt = 'm4a';
  }
  const mp3Buffer = await ffmpeg(buffer, [
    '-vn',
    '-map_metadata', '-1',
    '-ac', '2',
    '-ar', '44100',
    '-b:a', '128k',
    '-f', 'mp3',
  ], inputExt, 'mp3');
  if (!mp3Buffer || mp3Buffer.length < 8192) {
    throw new Error(`ffmpeg produced empty output (${mp3Buffer?.length || 0} bytes)`);
  }
  return mp3Buffer;
}

// ── PRIMARY: ytdl-core direct download ───────────────────────────────────────
async function downloadViaYtdl(videoUrl) {
  // Get audio-only format info
  const info = await withTimeout(
    () => ytdl.getInfo(videoUrl, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0' } } }),
    25_000,
    'ytdl getInfo'
  );

  // Pick best audio-only format
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio',
    filter: 'audioonly',
  });

  if (!format) throw new Error('ytdl: no audio format found');

  // Stream to buffer
  const stream = ytdl.downloadFromInfo(info, { format });
  const chunks = [];
  let total = 0;

  await withTimeout(
    () => new Promise((res, rej) => {
      stream.on('data', chunk => {
        total += chunk.length;
        if (total > 50 * 1024 * 1024) { stream.destroy(); rej(new Error('ytdl: file too large (>50MB)')); return; }
        chunks.push(chunk);
      });
      stream.on('end', res);
      stream.on('error', rej);
    }),
    60_000,
    'ytdl stream'
  );

  const buf = Buffer.concat(chunks);
  if (buf.length < 8192) throw new Error(`ytdl: buffer too small (${buf.length} bytes)`);

  const ext = format.container === 'webm' ? 'webm' : (format.container || 'm4a');
  return {
    buffer: buf,
    ext,
    title: info.videoDetails.title,
  };
}

// ── FALLBACK: download a URL to buffer ───────────────────────────────────────
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
      timeout: 30000,
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
    if (e1.code === 'ECONNABORTED' || e1.message.includes('timeout')) throw new Error('Download timed out');
    throw e1;
  }
}

// ── FALLBACK APIs ─────────────────────────────────────────────────────────────
async function apiYupra(url) {
  const r = await withRetry(() => axios.get(
    `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 20000 }
  ));
  const d = r.data?.data;
  if (r.data?.success && d?.download_url) return { url: d.download_url, title: d.title, ext: 'mp3' };
  throw new Error('Yupra: no URL');
}

async function apiSiputzx(url) {
  const r = await withRetry(() => axios.get(
    `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 20000 }
  ));
  const dlUrl = r.data?.data?.url || r.data?.dl || r.data?.url;
  if (dlUrl) return { url: dlUrl, title: r.data?.data?.title || r.data?.title, ext: 'mp3' };
  throw new Error('Siputzx: no URL');
}

async function apiIzumiUrl(url) {
  const r = await withRetry(() => axios.get(
    `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=mp3`,
    { timeout: 20000 }
  ));
  if (r.data?.result?.download) return { url: r.data.result.download, title: r.data.result.title, ext: 'mp3' };
  throw new Error('IzumiURL: no URL');
}

async function apiIzumiQuery(query) {
  const r = await withRetry(() => axios.get(
    `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`,
    { timeout: 20000 }
  ));
  if (r.data?.result?.download) return { url: r.data.result.download, title: r.data.result.title, ext: 'mp3' };
  throw new Error('IzumiQuery: no URL');
}

async function apiEliteProTech(url) {
  const r = await withRetry(() => axios.get(
    `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(url)}&format=mp3`,
    { timeout: 20000 }
  ));
  if (r.data?.success && r.data?.downloadURL) return { url: r.data.downloadURL, title: r.data.title, ext: 'mp3' };
  throw new Error('EliteProTech: no URL');
}

async function apiInvidious(url) {
  const vidId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (!vidId) throw new Error('Invidious: no video ID');
  const instances = [
    'https://invidious.jing.rocks',
    'https://inv.nadeko.net',
    'https://invidious.privacydev.net',
  ];
  for (const base of instances) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${vidId}`, { timeout: 15000 });
      const streams = r.data?.adaptiveFormats || [];
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
        const search = await withTimeout(() => yts(text), 15_000, 'YouTube search');
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
            const meta  = await withTimeout(() => yts({ videoId: vidId }), 10_000, 'yt meta');
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

    // ── 3. Try ytdl-core FIRST (most reliable, no external API needed) ────
    let rawBuffer = null;
    let rawExt    = 'mp3';
    let resolvedTitle = videoTitle || text;

    try {
      console.log('[Song] Trying ytdl-core...');
      const result = await downloadViaYtdl(videoUrl);
      rawBuffer     = result.buffer;
      rawExt        = result.ext;
      if (result.title) resolvedTitle = result.title;
      console.log(`[Song] ✅ ytdl-core — ${rawBuffer.length} bytes, ext: ${rawExt}`);
    } catch (e) {
      console.log(`[Song] ytdl-core failed: ${e.message} — trying fallback APIs`);
    }

    // ── 4. Fallback API chain if ytdl-core failed ─────────────────────────
    if (!rawBuffer) {
      const fallbackApis = [
        { name: 'Yupra',        fn: () => apiYupra(videoUrl) },
        { name: 'Siputzx',      fn: () => apiSiputzx(videoUrl) },
        { name: 'IzumiURL',     fn: () => apiIzumiUrl(videoUrl) },
        { name: 'EliteProTech', fn: () => apiEliteProTech(videoUrl) },
        { name: 'Invidious',    fn: () => apiInvidious(videoUrl) },
        { name: 'IzumiQuery',   fn: () => apiIzumiQuery(videoTitle || text) },
      ];

      for (const { name, fn } of fallbackApis) {
        try {
          console.log(`[Song] Trying ${name}...`);
          const result = await withTimeout(fn, 20_000, name);
          if (!result?.url) { console.log(`[Song] ${name}: no URL`); continue; }
          if (result.title) resolvedTitle = result.title;

          const buf = await withTimeout(() => downloadToBuffer(result.url), 35_000, `${name} download`);
          if (!buf || buf.length < 8192) { console.log(`[Song] ${name}: too small`); continue; }

          rawBuffer = buf;
          rawExt    = result.ext || detectAudioFormat(buf);
          console.log(`[Song] ✅ ${name} — ${buf.length} bytes`);
          break;
        } catch (e) {
          console.log(`[Song] ${name} failed: ${e.message}`);
        }
      }
    }

    if (!rawBuffer) {
      return sock.sendMessage(chatId, {
        text: '❌ All download sources failed.\n\n• The song may be age-restricted or unavailable\n• Try a different search term\n• Paste the YouTube link directly',
      }, { quoted: msg });
    }

    // ── 5. Detect actual format and convert to MP3 ────────────────────────
    const detectedExt = detectAudioFormat(rawBuffer);
    console.log(`[Song] API said: ${rawExt}, magic bytes: ${detectedExt}`);

    let finalBuffer;
    try {
      finalBuffer = await toMP3(rawBuffer, detectedExt);
      console.log(`[Song] Converted to MP3: ${finalBuffer.length} bytes`);
    } catch (convErr) {
      console.error(`[Song] ffmpeg conversion failed: ${convErr.message}`);
      finalBuffer = rawBuffer; // last resort: send unconverted
    }

    if (!finalBuffer || finalBuffer.length < 4096) {
      return sock.sendMessage(chatId, { text: '❌ Audio processing failed. Please try again.' }, { quoted: msg });
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
