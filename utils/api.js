/**
 * API Integration Utilities — VIPER BOT MD
 * Fixed TTS, IG, FB, TikTok with working providers + proper fallback chains.
 */

const axios = require('axios');

const api = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

const APIs = {
  // Image Generation
  generateImage: async (prompt) => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/ai/stablediffusion`, { params: { prompt } });
      return response.data;
    } catch (error) { throw new Error('Failed to generate image'); }
  },

  // AI Chat
  chatAI: async (text) => {
    try {
      const response = await api.get(`https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(text)}`);
      if (response.data && response.data.msg) return { msg: response.data.msg };
      return response.data;
    } catch (error) { throw new Error('Failed to get AI response'); }
  },

  // YouTube Download
  ytDownload: async (url, type = 'audio') => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/d/ytmp3`, { params: { url } });
      return response.data;
    } catch (error) { throw new Error('Failed to download YouTube video'); }
  },

  // Instagram Download — multi-provider fallback
  igDownload: async (url) => {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

    // Provider 1: saveig.app API
    const trySaveig = async () => {
      const r = await axios.get(
        `https://api.saveig.app/api?url=${encodeURIComponent(url)}`,
        { timeout: 15000, headers: { 'User-Agent': UA } }
      );
      if (r.data?.data?.length) return r.data.data.map(i => ({ url: i.url, type: i.type }));
      throw new Error('saveig: no data');
    };

    // Provider 2: snapinsta-style API
    const trySnapinsta = async () => {
      const r = await axios.post(
        'https://snapinsta.app/action.php',
        new URLSearchParams({ url }),
        { timeout: 15000, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://snapinsta.app/' } }
      );
      const matches = (r.data || '').match(/https:\/\/[^"'\s]+(?:\.mp4|\.jpg|\.jpeg)[^"'\s]*/g) || [];
      if (matches.length) return matches.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'photo' }));
      throw new Error('snapinsta: no media');
    };

    // Provider 3: siputzx fallback
    const trySiputzx = async () => {
      const r = await axios.get(`https://api.siputzx.my.id/api/d/igdl`, { params: { url }, timeout: 15000 });
      if (r.data?.data?.length) return r.data.data;
      throw new Error('siputzx: no data');
    };

    const providers = [trySaveig, trySnapinsta, trySiputzx];
    let lastErr = '';
    for (const fn of providers) {
      try { return await fn(); } catch (e) { lastErr = e.message; }
    }
    throw new Error(`All IG providers failed. Last: ${lastErr}`);
  },

  // TikTok Download — multi-provider fallback
  tiktokDownload: async (url) => {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

    // Provider 1: tikwm (no watermark)
    const tryTikwm = async () => {
      const r = await axios.post(
        'https://www.tikwm.com/api/',
        new URLSearchParams({ url, count: 12, cursor: 0, web: 1, hd: 1 }),
        { timeout: 15000, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (r.data?.code === 0 && r.data?.data?.play) {
        return { videoUrl: r.data.data.hdplay || r.data.data.play, title: r.data.data.title };
      }
      throw new Error('tikwm: no video');
    };

    // Provider 2: snaptik-style
    const tryMusicaldown = async () => {
      const r = await axios.get(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
        { timeout: 15000, headers: { 'User-Agent': UA } }
      );
      if (r.data?.code === 0 && r.data?.data?.play) {
        return { videoUrl: r.data.data.play, title: r.data.data.title };
      }
      throw new Error('tikwm-get: no video');
    };

    // Provider 3: siputzx fallback
    const trySiputzx = async () => {
      const r = await axios.get(
        `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`,
        { timeout: 15000, headers: { 'User-Agent': UA } }
      );
      if (r.data?.status && r.data?.data) {
        const d = r.data.data;
        const videoUrl = d.urls?.[0] || d.video_url || d.url || d.download_url;
        if (videoUrl) return { videoUrl, title: d.metadata?.title || 'TikTok Video' };
      }
      throw new Error('siputzx: no video');
    };

    const providers = [tryTikwm, tryMusicaldown, trySiputzx];
    let lastErr = '';
    for (const fn of providers) {
      try { return await fn(); } catch (e) { lastErr = e.message; }
    }
    throw new Error(`All TikTok providers failed. Last: ${lastErr}`);
  },

  // TikTok Download (legacy alias used by tiktok.js)
  getTikTokDownload: async (url) => {
    return APIs.tiktokDownload(url);
  },

  // Translate
  translate: async (text, to = 'en') => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/tools/translate`, { params: { text, to } });
      return response.data;
    } catch (error) { throw new Error('Translation failed'); }
  },

  // Random Meme
  getMeme: async () => {
    try {
      const response = await api.get('https://meme-api.com/gimme');
      return response.data;
    } catch (error) { throw new Error('Failed to fetch meme'); }
  },

  // Random Quote
  getQuote: async () => {
    try {
      const response = await api.get('https://api.quotable.io/random');
      return response.data;
    } catch (error) { throw new Error('Failed to fetch quote'); }
  },

  // Random Joke
  getJoke: async () => {
    try {
      const response = await api.get('https://official-joke-api.appspot.com/random_joke');
      return response.data;
    } catch (error) { throw new Error('Failed to fetch joke'); }
  },

  // Weather
  getWeather: async (city) => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/tools/weather`, { params: { city } });
      return response.data;
    } catch (error) { throw new Error('Failed to fetch weather'); }
  },

  // Shorten URL
  shortenUrl: async (url) => {
    try {
      const response = await api.get(`https://tinyurl.com/api-create.php`, { params: { url } });
      return response.data;
    } catch (error) { throw new Error('Failed to shorten URL'); }
  },

  // Wikipedia Search
  wikiSearch: async (query) => {
    try {
      const response = await api.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) { throw new Error('Wikipedia search failed'); }
  },

  // Song Download APIs (unchanged — .song already works)
  getIzumiDownloadByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = { timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' } };
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try { return await getter(); }
        catch (err) { lastError = err; if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt)); }
      }
      throw lastError;
    };
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube?url returned no download');
  },

  getIzumiDownloadByQuery: async (query) => {
    const AXIOS_DEFAULTS = { timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' } };
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try { return await getter(); }
        catch (err) { lastError = err; if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt)); }
      }
      throw lastError;
    };
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube-play returned no download');
  },

  getYupraDownloadByUrl: async (youtubeUrl) => {
    const r = await axios.get(`https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 60000 });
    if (r.data?.success && r.data?.data?.download_url) return { download: r.data.data.download_url, title: r.data.data.title, thumbnail: r.data.data.thumbnail };
    throw new Error('Yupra returned no download');
  },

  getOkatsuDownloadByUrl: async (youtubeUrl) => {
    const r = await axios.get(`https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 60000 });
    if (r.data?.dl) return { download: r.data.dl, title: r.data.title, thumbnail: r.data.thumb };
    throw new Error('Okatsu ytmp3 returned no download');
  },

  getEliteProTechDownloadByUrl: async (youtubeUrl) => {
    const r = await axios.get(`https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`, { timeout: 60000 });
    if (r.data?.success && r.data?.downloadURL) return { download: r.data.downloadURL, title: r.data.title };
    throw new Error('EliteProTech ytdown returned no download');
  },

  getEliteProTechVideoByUrl: async (youtubeUrl) => {
    const r = await axios.get(`https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`, { timeout: 60000 });
    if (r.data?.success && r.data?.downloadURL) return { download: r.data.downloadURL, title: r.data.title };
    throw new Error('EliteProTech ytdown video returned no download');
  },

  getYupraVideoByUrl: async (youtubeUrl) => {
    const r = await axios.get(`https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 60000 });
    if (r.data?.success && r.data?.data?.download_url) return { download: r.data.data.download_url, title: r.data.data.title, thumbnail: r.data.data.thumbnail };
    throw new Error('Yupra returned no download');
  },

  getOkatsuVideoByUrl: async (youtubeUrl) => {
    const r = await axios.get(`https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 60000 });
    if (r.data?.result?.mp4) return { download: r.data.result.mp4, title: r.data.result.title };
    throw new Error('Okatsu ytmp4 returned no mp4');
  },

  // Screenshot Website API
  screenshotWebsite: async (url) => {
    try {
      const apiUrl = `https://eliteprotech-apis.zone.id/ssweb?url=${encodeURIComponent(url)}`;
      const response = await axios.get(apiUrl, { timeout: 30000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (response.headers['content-type']?.includes('image')) return Buffer.from(response.data);
      try {
        const data = JSON.parse(Buffer.from(response.data).toString());
        return data.url || data.data?.url || data.image || apiUrl;
      } catch (e) { return Buffer.from(response.data); }
    } catch (error) { throw new Error('Failed to take screenshot'); }
  },

  // ── TEXT TO SPEECH — Fixed provider chain ────────────────────────────────
  textToSpeech: async (text) => {
    const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const enc = encodeURIComponent(text);

    // Provider 1: StreamElements — most reliable free TTS
    const tryStreamElements = async () => {
      const { data } = await axios.get(
        `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${enc}`,
        { timeout: 20000, responseType: 'arraybuffer', headers: { 'User-Agent': UA } }
      );
      const buf = Buffer.from(data);
      if (buf.length < 1000) throw new Error('StreamElements: response too small');
      return buf;
    };

    // Provider 2: TikTok TTS (edge-tts style, free)
    const tryTikTokTTS = async () => {
      const r = await axios.post(
        'https://tiktok-tts.weilnet.workers.dev/api/generation',
        { text: text.slice(0, 300), voice: 'en_us_001' },
        { timeout: 20000, headers: { 'User-Agent': UA, 'Content-Type': 'application/json' } }
      );
      if (r.data?.success && r.data?.data) {
        const buf = Buffer.from(r.data.data, 'base64');
        if (buf.length < 1000) throw new Error('TikTok TTS: too small');
        return buf;
      }
      throw new Error('TikTok TTS: no data');
    };

    // Provider 3: Google Translate TTS (short texts)
    const tryGoogleTTS = async () => {
      const chunk = text.slice(0, 200);
      const { data } = await axios.get(
        `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en&client=tw-ob`,
        { timeout: 20000, responseType: 'arraybuffer',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', Referer: 'https://translate.google.com/' } }
      );
      const buf = Buffer.from(data);
      if (buf.length < 500) throw new Error('Google TTS: response too small');
      return buf;
    };

    // Provider 4: VoiceRSS
    const tryVoiceRSS = async () => {
      const { data } = await axios.get(
        `https://api.voicerss.org/?key=&hl=en-us&src=${enc}&c=MP3&f=48khz_16bit_stereo`,
        { timeout: 20000, responseType: 'arraybuffer', headers: { 'User-Agent': UA } }
      );
      const buf = Buffer.from(data);
      if (buf[0] === 0xFF || buf[0] === 0x49) return buf;
      throw new Error('VoiceRSS: no audio');
    };

    // Provider 5: ttsmp3.com
    const tryTTSMP3 = async () => {
      const r = await axios.post(
        'https://ttsmp3.com/makemp3_new.php',
        new URLSearchParams({ msg: text.slice(0, 300), lang: 'Joanna', source: 'ttsmp3' }),
        { timeout: 20000, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://ttsmp3.com/' } }
      );
      const mp3url = r.data?.MP3 ? `https://ttsmp3.com/created_mp3_ai/${r.data.MP3}` : null;
      if (!mp3url) throw new Error('ttsmp3: no MP3');
      const audio = await axios.get(mp3url, { timeout: 15000, responseType: 'arraybuffer' });
      const buf = Buffer.from(audio.data);
      if (buf.length < 500) throw new Error('ttsmp3: audio too small');
      return buf;
    };

    const providers = [tryStreamElements, tryTikTokTTS, tryGoogleTTS, tryVoiceRSS, tryTTSMP3];
    let lastErr = '';
    for (const fn of providers) {
      try {
        const result = await fn();
        if (result) return result;
      } catch (e) { lastErr = e.message; }
    }
    throw new Error(`All TTS providers failed. Last error: ${lastErr}`);
  }
};

module.exports = APIs;
