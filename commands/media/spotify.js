/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  .spotify — Spotify Track Downloader (VIPER BOT MD)  ║
 * ║                                                      ║
 * ║  Supports: track URL, album URL, or plain search     ║
 * ║                                                      ║
 * ║  Download API waterfall:                             ║
 * ║  1. SpotifyDown.com  — primary                       ║
 * ║  2. FabDL.com        — fallback                      ║
 * ║  3. Loader.to        — last resort                   ║
 * ╚══════════════════════════════════════════════════════╝
 */

const axios = require('axios');
const { ffmpeg } = require('../../utils/converter');

const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractSpotifyId(input) {
  // Handles: https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC
  //          spotify:track:4uLU6hMCjMI75M1A2tKUQC
  const m = input.match(/(?:track|album)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function isSpotifyUrl(text) {
  return /spotify\.com\/(track|album|playlist)\//i.test(text) ||
         /spotify:track:/i.test(text);
}

async function downloadBuffer(url) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: Infinity,
    headers: { 'User-Agent': UA, 'Referer': 'https://spotifydown.com/' },
    validateStatus: s => s >= 200 && s < 400,
  });
  const buf = Buffer.from(r.data);
  if (buf.length < 8192) throw new Error(`Buffer too small (${buf.length} bytes)`);
  return buf;
}

// ── Provider 1: SpotifyDown.com ──────────────────────────────────────────────
async function apiSpotifyDown(trackId) {
  const headers = {
    'User-Agent': UA,
    'Referer':    'https://spotifydown.com/',
    'Origin':     'https://spotifydown.com',
  };

  // Step 1: search metadata
  const meta = await axios.get(`https://api.spotifydown.com/metadata/track/${trackId}`, {
    headers, timeout: 20000,
  });
  if (!meta.data?.id) throw new Error('SpotifyDown: no track metadata');
  const { title, artists, album, releaseDate, cover } = meta.data;

  // Step 2: get download link
  const dl = await axios.get(`https://api.spotifydown.com/download/${trackId}`, {
    headers, timeout: 30000,
  });
  if (!dl.data?.link) throw new Error('SpotifyDown: no download link');

  return {
    url:      dl.data.link,
    title:    title   || 'Unknown',
    artist:   artists || 'Unknown',
    album:    album   || '',
    cover:    cover   || null,
    year:     releaseDate?.slice(0, 4) || '',
    provider: 'SpotifyDown',
  };
}

// ── Provider 2: FabDL.com ────────────────────────────────────────────────────
async function apiFabDL(spotifyUrl) {
  const headers = {
    'User-Agent': UA,
    'Referer':    'https://fabdl.com/',
  };

  // Step 1: get task info
  const r1 = await axios.get(`https://api.fabdl.com/spotify/get?url=${encodeURIComponent(spotifyUrl)}`, {
    headers, timeout: 20000,
  });
  const d = r1.data?.result;
  if (!d?.gid || !d?.id) throw new Error('FabDL: no task info');

  // Step 2: convert (poll up to 30s)
  const taskUrl = `https://api.fabdl.com/spotify/mp3-convert-task/${d.gid}/${d.id}`;
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    const r2 = await axios.get(taskUrl, { headers, timeout: 15000 });
    if (r2.data?.result?.download_url) {
      return {
        url:      r2.data.result.download_url,
        title:    d.name   || 'Unknown',
        artist:   d.artists || 'Unknown',
        album:    d.album  || '',
        cover:    d.image  || null,
        year:     '',
        provider: 'FabDL',
      };
    }
  }
  throw new Error('FabDL: conversion timed out');
}

// ── Provider 3: Loader.to ────────────────────────────────────────────────────
async function apiLoaderTo(spotifyUrl) {
  const headers = {
    'User-Agent': UA,
    'Referer':    'https://loader.to/',
    'Origin':     'https://loader.to',
  };

  const r = await axios.get('https://loader.to/api/button/', {
    params: { url: spotifyUrl, f: 'mp3' },
    headers,
    timeout: 20000,
  });
  if (!r.data?.id) throw new Error('Loader.to: no task id');

  const taskId = r.data.id;
  // Poll for download link
  for (let i = 0; i < 12; i++) {
    await sleep(3000);
    const p = await axios.get(`https://loader.to/api/info/?format=mp3&url=${encodeURIComponent(spotifyUrl)}&api_key=free`, {
      headers, timeout: 15000,
    });
    if (p.data?.download_url || p.data?.success === 1) {
      const dlUrl = p.data.download_url || p.data.url;
      if (dlUrl) return { url: dlUrl, title: 'Track', artist: '', album: '', cover: null, year: '', provider: 'Loader.to' };
    }
  }
  throw new Error('Loader.to: timed out');
}

// ── Spotify Search (for text queries) ────────────────────────────────────────
async function searchSpotify(query) {
  // Use SpotifyDown's search endpoint
  const r = await axios.get(`https://api.spotifydown.com/search/tracks?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://spotifydown.com/' },
    timeout: 15000,
  });
  const tracks = r.data?.trackList || r.data?.tracks || r.data?.items || [];
  if (!tracks.length) throw new Error('No tracks found for that search');

  const t = tracks[0];
  return {
    id:     t.id,
    url:    `https://open.spotify.com/track/${t.id}`,
    title:  t.title  || t.name   || 'Unknown',
    artist: t.artists|| t.artist || 'Unknown',
    cover:  t.cover  || t.image  || null,
  };
}

// ── Main command ─────────────────────────────────────────────────────────────
module.exports = {
  name: 'spotify',
  aliases: ['sp', 'spdl', 'spoti'],
  category: 'download',
  description: 'Download songs from Spotify',
  usage: '.spotify <song name or Spotify link>',

  async execute(sock, msg, args, extra) {
    const input  = args.join(' ').trim();
    const from   = extra.from;

    if (!input) {
      return extra.reply(
        '🎵 *Spotify Downloader*\n\n' +
        `*Usage:* ${extra.prefix || '.'}spotify <song name or link>\n\n` +
        '*Examples:*\n' +
        `• ${extra.prefix || '.'}spotify Burna Boy Last Last\n` +
        `• ${extra.prefix || '.'}spotify Asake Organise\n` +
        `• ${extra.prefix || '.'}spotify https://open.spotify.com/track/...`
      );
    }

    await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } });

    // ── Step 1: Resolve track ID and URL ────────────────────────────────────
    let trackId  = null;
    let trackUrl = null;
    let meta     = null; // { title, artist, cover }

    if (isSpotifyUrl(input)) {
      trackId  = extractSpotifyId(input);
      trackUrl = input.startsWith('http') ? input : `https://open.spotify.com/track/${trackId}`;
      await extra.reply('🎵 *Fetching Spotify track...*\n\n⏳ Please wait...');
    } else {
      // Search by text
      await extra.reply(`🔍 *Searching Spotify for:* _"${input}"_\n\n⏳ Please wait...`);
      try {
        const found = await searchSpotify(input);
        trackId  = found.id;
        trackUrl = found.url;
        meta     = found;
        console.log(`[Spotify] Found: ${found.title} by ${found.artist}`);
      } catch (e) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return extra.reply(`❌ Track not found: *${input}*\n\nTry being more specific or paste the Spotify link directly.`);
      }
    }

    if (!trackId) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return extra.reply('❌ Could not extract track ID from that link.');
    }

    // ── Step 2: Get download link via waterfall ──────────────────────────────
    const providers = [
      { name: 'SpotifyDown', fn: () => apiSpotifyDown(trackId) },
      { name: 'FabDL',       fn: () => apiFabDL(trackUrl) },
      { name: 'Loader.to',   fn: () => apiLoaderTo(trackUrl) },
    ];

    let dlInfo = null;
    for (const { name, fn } of providers) {
      try {
        console.log(`[Spotify] Trying ${name}...`);
        dlInfo = await fn();
        console.log(`[Spotify] ✅ ${name} — ${dlInfo.url}`);
        break;
      } catch (e) {
        console.log(`[Spotify] ${name} failed: ${e.message}`);
      }
    }

    // Merge any metadata from search step
    if (dlInfo && meta) {
      dlInfo.title  = dlInfo.title  || meta.title;
      dlInfo.artist = dlInfo.artist || meta.artist;
      dlInfo.cover  = dlInfo.cover  || meta.cover;
    }

    if (!dlInfo) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return extra.reply('❌ All download sources failed.\n\n• The track may be unavailable in your region\n• Try a different song or paste the link directly');
    }

    // ── Step 3: Download audio buffer ────────────────────────────────────────
    let audioBuffer;
    try {
      audioBuffer = await downloadBuffer(dlInfo.url);
    } catch (e) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return extra.reply(`❌ Download failed: ${e.message}`);
    }

    // ── Step 4: Convert to MP3 via ffmpeg if not already ────────────────────
    const magic4 = audioBuffer.slice(0, 4).toString('ascii');
    const isMP3  = (audioBuffer[0] === 0x49 && audioBuffer[1] === 0x44 && audioBuffer[2] === 0x33) // ID3
                 || (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0);                  // MPEG sync
    const isM4A  = magic4 === 'ftyp' || audioBuffer.slice(4, 8).toString('ascii') === 'ftyp';

    let finalBuffer = audioBuffer;
    if (!isMP3) {
      try {
        const inputExt = isM4A ? 'm4a' : 'mp3';
        finalBuffer = await ffmpeg(audioBuffer, [
          '-vn', '-map_metadata', '-1',
          '-ac', '2', '-ar', '44100', '-b:a', '128k', '-f', 'mp3',
        ], inputExt, 'mp3');
        console.log(`[Spotify] Converted to MP3: ${finalBuffer.length} bytes`);
      } catch (e) {
        console.warn(`[Spotify] ffmpeg convert failed: ${e.message} — sending raw`);
        finalBuffer = audioBuffer;
      }
    }

    // ── Step 5: Send cover art + audio ───────────────────────────────────────
    const title  = dlInfo.title  || 'Unknown Track';
    const artist = dlInfo.artist || 'Unknown Artist';
    const caption =
      `🎵 *${title}*\n` +
      `👤 ${artist}` +
      (dlInfo.album ? `\n💿 ${dlInfo.album}` : '') +
      (dlInfo.year  ? ` (${dlInfo.year})`   : '') +
      `\n\n_via ${dlInfo.provider}_`;

    // Send cover thumbnail first if available
    if (dlInfo.cover) {
      try {
        const coverBuf = await downloadBuffer(dlInfo.cover);
        await sock.sendMessage(from, {
          image: coverBuf, caption,
        }, { quoted: msg });
      } catch { /* cover optional — skip silently */ }
    }

    const safeName = (title + ' - ' + artist)
      .replace(/[^\w\s\-]/g, '')
      .trim()
      .slice(0, 60) || 'spotify-track';

    await sock.sendMessage(from, {
      audio:    finalBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${safeName}.mp3`,
      ptt:      false,
    }, { quoted: msg });

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
  },
};
