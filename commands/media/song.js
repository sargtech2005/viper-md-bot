/**
 * .song / .play — Download audio from YouTube
 * Tries 8 public APIs in sequence, converts to MP3, sends as audio message.
 */

const yts  = require('yt-search');
const axios = require('axios');
const { toAudio } = require('../../utils/converter');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tryRequest(fn, attempts = 3, delay = 1500) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < attempts) await sleep(delay * i); }
  }
  throw last;
}

async function fetchBuffer(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
  };
  // Try arraybuffer
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer', timeout: 120000,
      maxContentLength: Infinity, maxBodyLength: Infinity,
      headers, validateStatus: s => s >= 200 && s < 400,
    });
    const buf = Buffer.from(r.data);
    if (buf.length > 5000) return buf;
    throw new Error('Buffer too small');
  } catch (e1) {
    if (e1.response?.status === 451) throw new Error('Content unavailable (451)');
  }
  // Fallback stream
  const r = await axios.get(url, {
    responseType: 'stream', timeout: 120000,
    maxContentLength: Infinity, headers,
    validateStatus: s => s >= 200 && s < 400,
  });
  const chunks = [];
  await new Promise((res, rej) => {
    r.data.on('data', c => chunks.push(c));
    r.data.on('end', res);
    r.data.on('error', rej);
  });
  const buf = Buffer.concat(chunks);
  if (buf.length < 5000) throw new Error('Stream too small');
  return buf;
}

function detectFormat(buf) {
  if (!buf || buf.length < 12) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)   return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.slice(0, 3).toString('ascii') === 'ID3')    return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.slice(0, 4).toString('ascii') === 'OggS')   return { mime: 'audio/ogg',  ext: 'ogg' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF')   return { mime: 'audio/wav',  ext: 'wav' };
  if (buf.slice(4, 8).toString('ascii') === 'ftyp')   return { mime: 'audio/mp4',  ext: 'm4a' };
  return { mime: 'audio/mp4', ext: 'm4a' };
}

// ── API implementations ───────────────────────────────────────────────────────

async function apiCobalt(url) {
  const r = await tryRequest(() => axios.post('https://cobalt.tools/api/json', {
    url, aFormat: 'mp3', isAudioOnly: true, disableMetadata: true,
  }, { timeout: 30000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }));
  if (r.data?.status === 'stream' && r.data?.url) return { download: r.data.url };
  const picked = r.data?.picker?.find(p => p.type === 'audio') || r.data?.picker?.[0];
  if (picked?.url) return { download: picked.url };
  throw new Error('Cobalt: no URL');
}

async function apiYupra(url) {
  const r = await tryRequest(() => axios.get(
    `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 40000 }
  ));
  if (r.data?.success && r.data?.data?.download_url)
    return { download: r.data.data.download_url, title: r.data.data.title, thumbnail: r.data.data.thumbnail };
  throw new Error('Yupra: no URL');
}

async function apiSiputzx(url) {
  const r = await tryRequest(() => axios.get(
    `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 40000 }
  ));
  const dlUrl = r.data?.data?.url || r.data?.dl || r.data?.url;
  if (dlUrl) return { download: dlUrl, title: r.data?.data?.title || r.data?.title };
  throw new Error('Siputzx: no URL');
}

async function apiEliteProTech(url) {
  const r = await tryRequest(() => axios.get(
    `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(url)}&format=mp3`,
    { timeout: 40000 }
  ));
  if (r.data?.success && r.data?.downloadURL)
    return { download: r.data.downloadURL, title: r.data.title };
  throw new Error('EliteProTech: no URL');
}

async function apiOkatsu(url) {
  const r = await tryRequest(() => axios.get(
    `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 40000 }
  ));
  if (r.data?.dl) return { download: r.data.dl, title: r.data.title, thumbnail: r.data.thumb };
  throw new Error('Okatsu: no URL');
}

async function apiIzumiUrl(url) {
  const r = await tryRequest(() => axios.get(
    `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=mp3`,
    { timeout: 40000 }
  ));
  if (r.data?.result?.download) return { download: r.data.result.download, title: r.data.result.title };
  throw new Error('Izumi URL: no URL');
}

async function apiIzumiQuery(query) {
  const r = await tryRequest(() => axios.get(
    `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`,
    { timeout: 40000 }
  ));
  if (r.data?.result?.download) return { download: r.data.result.download, title: r.data.result.title };
  throw new Error('Izumi query: no URL');
}

async function apiAudiDL(url) {
  // Public YTMP3 mirror
  const r = await tryRequest(() => axios.get(
    `https://yousician-api.vercel.app/api/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 40000 }
  ));
  const dlUrl = r.data?.download || r.data?.url || r.data?.link || r.data?.data?.url;
  if (dlUrl) return { download: dlUrl, title: r.data?.title || r.data?.data?.title };
  throw new Error('AudiDL: no URL');
}

// ── Command ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube URL>',

  async execute(sock, msg, args) {
    const text   = args.join(' ').trim();
    const chatId = msg.key.remoteJid;

    if (!text) {
      return sock.sendMessage(chatId, {
        text: '🎵 Usage: *.song <song name or YouTube URL>*\n\nExample: *.song Burna Boy Last Last*'
      }, { quoted: msg });
    }

    // ── Resolve video URL + metadata ────────────────────────────────────────
    const isYtUrl = /youtu(\.be|be\.com)/.test(text);
    let videoUrl = isYtUrl ? text : null;
    let videoTitle, videoThumb, videoDuration;

    try {
      if (!isYtUrl) {
        const search = await yts(text);
        if (!search?.videos?.length) {
          return sock.sendMessage(chatId, { text: '❌ No results found. Try a different search.' }, { quoted: msg });
        }
        const v = search.videos[0];
        videoUrl      = v.url;
        videoTitle    = v.title;
        videoThumb    = v.thumbnail;
        videoDuration = v.timestamp;
      } else {
        // Grab metadata for direct URLs
        try {
          const vidId = text.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
          if (vidId) {
            const meta = await yts({ videoId: vidId });
            videoTitle    = meta?.title;
            videoThumb    = meta?.thumbnail;
            videoDuration = meta?.timestamp;
          }
        } catch {}
      }
    } catch (e) {
      return sock.sendMessage(chatId, { text: `❌ Search failed: ${e.message}` }, { quoted: msg });
    }

    // ── Send loading preview ────────────────────────────────────────────────
    try {
      const caption = `🎵 *${videoTitle || 'Downloading...'}*${videoDuration ? `\n⏱ ${videoDuration}` : ''}\n\n⏳ _Fetching audio..._`;
      if (videoThumb) {
        await sock.sendMessage(chatId, { image: { url: videoThumb }, caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
      }
    } catch {}

    // ── Try APIs ────────────────────────────────────────────────────────────
    const apis = [
      { name: 'Cobalt',       fn: () => apiCobalt(videoUrl) },
      { name: 'Yupra',        fn: () => apiYupra(videoUrl) },
      { name: 'Siputzx',      fn: () => apiSiputzx(videoUrl) },
      { name: 'EliteProTech', fn: () => apiEliteProTech(videoUrl) },
      { name: 'Okatsu',       fn: () => apiOkatsu(videoUrl) },
      { name: 'IzumiURL',     fn: () => apiIzumiUrl(videoUrl) },
      { name: 'AudiDL',       fn: () => apiAudiDL(videoUrl) },
      { name: 'IzumiQuery',   fn: () => apiIzumiQuery(videoTitle || text) },
    ];

    let audioBuffer = null;
    let resolvedTitle = videoTitle || text;

    for (const { name, fn } of apis) {
      try {
        console.log(`[Song] Trying ${name}...`);
        const result = await fn();
        if (!result?.download) { console.log(`[Song] ${name}: no download URL, skipping`); continue; }
        if (result.title) resolvedTitle = result.title;
        audioBuffer = await fetchBuffer(result.download);
        if (audioBuffer.length > 5000) {
          console.log(`[Song] ✅ ${name} success — ${audioBuffer.length} bytes`);
          break;
        }
        audioBuffer = null;
      } catch (e) {
        console.log(`[Song] ${name} failed: ${e.message}`);
      }
    }

    if (!audioBuffer) {
      return sock.sendMessage(chatId, {
        text: '❌ All download sources failed.\n\nThis song may be:\n• Age-restricted or unavailable\n• Blocked in your region\n• A live stream (not supported)\n\nTry a different song!'
      }, { quoted: msg });
    }

    // ── Ensure MP3 ──────────────────────────────────────────────────────────
    const { mime, ext } = detectFormat(audioBuffer);
    let finalBuffer = audioBuffer;
    let finalMime   = mime;
    let finalExt    = ext;

    if (ext !== 'mp3') {
      try {
        const converted = await toAudio(audioBuffer, ext);
        if (converted && converted.length > 5000) {
          finalBuffer = converted;
          finalMime   = 'audio/mpeg';
          finalExt    = 'mp3';
        }
      } catch (e) {
        console.log(`[Song] Conversion ${ext}→mp3 failed: ${e.message}, sending original`);
      }
    }

    // ── Send ────────────────────────────────────────────────────────────────
    const safeName = (resolvedTitle || 'audio').replace(/[^\w\s\-]/g, '').trim().slice(0, 60);
    await sock.sendMessage(chatId, {
      audio:    finalBuffer,
      mimetype: finalMime,
      fileName: `${safeName}.${finalExt}`,
      ptt:      false,
    }, { quoted: msg });
  },
};
