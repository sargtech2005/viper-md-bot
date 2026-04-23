/**
 * API Integration Utilities
 */

const axios = require('axios');

const api = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// API Endpoints
const APIs = {
  // Image Generation
  generateImage: async (prompt) => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/ai/stablediffusion`, {
        params: { prompt }
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to generate image');
    }
  },
  
  // AI Chat - Shizo API
  chatAI: async (text) => {
    try {
      const response = await api.get(`https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(text)}`);
      if (response.data && response.data.msg) {
        return { msg: response.data.msg };
      }
      return response.data;
    } catch (error) {
      throw new Error('Failed to get AI response');
    }
  },
  
  // YouTube Download
  ytDownload: async (url, type = 'audio') => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/d/ytmp3`, {
        params: { url }
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to download YouTube video');
    }
  },
  
  // Instagram Download
  igDownload: async (url) => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/d/igdl`, {
        params: { url }
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to download Instagram content');
    }
  },
  
  // TikTok Download
  tiktokDownload: async (url) => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/d/tiktok`, {
        params: { url }
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to download TikTok video');
    }
  },
  
  // Translate
  translate: async (text, to = 'en') => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/tools/translate`, {
        params: { text, to }
      });
      return response.data;
    } catch (error) {
      throw new Error('Translation failed');
    }
  },
  
  // Random Meme
  getMeme: async () => {
    try {
      const response = await api.get('https://meme-api.com/gimme');
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch meme');
    }
  },
  
  // Random Quote
  getQuote: async () => {
    try {
      const response = await api.get('https://api.quotable.io/random');
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch quote');
    }
  },
  
  // Random Joke
  getJoke: async () => {
    try {
      const response = await api.get('https://official-joke-api.appspot.com/random_joke');
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch joke');
    }
  },
  
  // Weather
  getWeather: async (city) => {
    try {
      const response = await api.get(`https://api.siputzx.my.id/api/tools/weather`, {
        params: { city }
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch weather');
    }
  },
  
  // Shorten URL
  shortenUrl: async (url) => {
    try {
      const response = await api.get(`https://tinyurl.com/api-create.php`, {
        params: { url }
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to shorten URL');
    }
  },
  
  // Wikipedia Search
  wikiSearch: async (query) => {
    try {
      const response = await api.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      throw new Error('Wikipedia search failed');
    }
  },
  
  // Song Download APIs
  getIzumiDownloadByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube?url returned no download');
  },
  
  getIzumiDownloadByQuery: async (query) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube-play returned no download');
  },
  
  getYupraDownloadByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
      return {
        download: res.data.data.download_url,
        title: res.data.data.title,
        thumbnail: res.data.data.thumbnail
      };
    }
    throw new Error('Yupra returned no download');
  },
  
  getOkatsuDownloadByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.dl) {
      return {
        download: res.data.dl,
        title: res.data.title,
        thumbnail: res.data.thumb
      };
    }
    throw new Error('Okatsu ytmp3 returned no download');
  },
  
  getEliteProTechDownloadByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
      return {
        download: res.data.downloadURL,
        title: res.data.title
      };
    }
    throw new Error('EliteProTech ytdown returned no download');
  },
  
    getEliteProTechVideoByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
      return {
        download: res.data.downloadURL,
        title: res.data.title
      };
    }
    throw new Error('EliteProTech ytdown video returned no download');
  },
  
  // Video Download APIs
  getYupraVideoByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
      return {
        download: res.data.data.download_url,
        title: res.data.data.title,
        thumbnail: res.data.data.thumbnail
      };
    }
    throw new Error('Yupra returned no download');
  },
  
  getOkatsuVideoByUrl: async (youtubeUrl) => {
    const AXIOS_DEFAULTS = {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    
    const tryRequest = async (getter, attempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await getter();
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      throw lastError;
    };
    
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp4) {
      return { download: res.data.result.mp4, title: res.data.result.title };
    }
    throw new Error('Okatsu ytmp4 returned no mp4');
  },
  
  // TikTok Download API
  getTikTokDownload: async (url) => {
    const apiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`;
    try {
      const response = await axios.get(apiUrl, { 
        timeout: 15000,
        headers: {
          'accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data && response.data.status && response.data.data) {
        let videoUrl = null;
        let title = null;
        
        if (response.data.data.urls && Array.isArray(response.data.data.urls) && response.data.data.urls.length > 0) {
          videoUrl = response.data.data.urls[0];
          title = response.data.data.metadata?.title || 'TikTok Video';
        } else if (response.data.data.video_url) {
          videoUrl = response.data.data.video_url;
          title = response.data.data.metadata?.title || 'TikTok Video';
        } else if (response.data.data.url) {
          videoUrl = response.data.data.url;
          title = response.data.data.metadata?.title || 'TikTok Video';
        } else if (response.data.data.download_url) {
          videoUrl = response.data.data.download_url;
          title = response.data.data.metadata?.title || 'TikTok Video';
        }
        
        return { videoUrl, title };
      }
      throw new Error('Invalid API response');
    } catch (error) {
      throw new Error('TikTok download failed');
    }
  },
  
  // Screenshot Website API
  screenshotWebsite: async (url) => {
    try {
      const apiUrl = `https://eliteprotech-apis.zone.id/ssweb?url=${encodeURIComponent(url)}`;
      const response = await axios.get(apiUrl, {
        timeout: 30000,
        responseType: 'arraybuffer',
        headers: {
          'accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      // Return the image buffer directly (API returns PNG binary)
      if (response.headers['content-type']?.includes('image')) {
        return Buffer.from(response.data);
      }
      
      // If API returns JSON with URL, try to parse it
      try {
        const data = JSON.parse(Buffer.from(response.data).toString());
        return data.url || data.data?.url || data.image || apiUrl;
      } catch (e) {
        // If not JSON, assume it's image data and return buffer
        return Buffer.from(response.data);
      }
    } catch (error) {
      throw new Error('Failed to take screenshot');
    }
  },
  
  // Text to Speech API
  textToSpeech: async (text) => {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const enc = encodeURIComponent(text);

    // ── Provider 1: VoiceRSS (free, no key needed for short texts) ──────────
    const tryVoiceRSS = async () => {
      const { data } = await axios.get(
        `https://api.voicerss.org/?key=&hl=en-us&src=${enc}&c=MP3&f=48khz_16bit_stereo`,
        { timeout: 20000, responseType: 'arraybuffer', headers: { 'User-Agent': UA } }
      );
      const buf = Buffer.from(data);
      // VoiceRSS returns error as text when key is missing — check for audio magic bytes
      if (buf[0] === 0xFF || buf[0] === 0x49) return buf; // MP3 magic bytes
      throw new Error('VoiceRSS: no audio');
    };

    // ── Provider 2: StreamElements TTS (free, no key) ────────────────────────
    const tryStreamElements = async () => {
      const { data } = await axios.get(
        `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${enc}`,
        { timeout: 20000, responseType: 'arraybuffer', headers: { 'User-Agent': UA } }
      );
      const buf = Buffer.from(data);
      if (buf.length < 1000) throw new Error('StreamElements: response too small');
      return buf;
    };

    // ── Provider 3: Google Translate TTS (free, works for short texts ≤200 chars) ─
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

    // ── Provider 4: ttstool.com ──────────────────────────────────────────────
    const tryTTSTool = async () => {
      const res = await axios.post('https://ttstool.com/api/tts',
        { text, voice: 'en-US-Neural2-F', speed: 1 },
        { timeout: 20000, headers: { 'User-Agent': UA, 'Content-Type': 'application/json' } }
      );
      const url = res.data?.url || res.data?.audio_url || res.data?.data?.url;
      if (!url) throw new Error('ttstool: no URL');
      const audio = await axios.get(url, { timeout: 15000, responseType: 'arraybuffer' });
      return Buffer.from(audio.data);
    };

    // ── Provider 5: laurine.site (original — kept as final fallback) ─────────
    const tryLaurine = async () => {
      const response = await axios.get(
        `https://www.laurine.site/api/tts/tts-nova?text=${enc}`,
        { timeout: 25000, headers: { accept: '*/*', 'User-Agent': UA } }
      );
      const d = response.data;
      if (typeof d === 'string' && d.startsWith('http')) return d;
      const url = d?.data?.URL || d?.data?.url || d?.data?.MP3
        ? (d.data.MP3 ? `https://ttsmp3.com/created_mp3_ai/${d.data.MP3}` : (d.data.URL || d.data.url))
        : (d?.URL || d?.url || (d?.MP3 ? `https://ttsmp3.com/created_mp3_ai/${d.MP3}` : null));
      if (!url) throw new Error('laurine: no URL');
      // url might be a link — download it
      if (typeof url === 'string' && url.startsWith('http')) {
        const audio = await axios.get(url, { timeout: 15000, responseType: 'arraybuffer' });
        return Buffer.from(audio.data);
      }
      return url;
    };

    const providers = [tryStreamElements, tryGoogleTTS, tryTTSTool, tryLaurine];
    let lastErr = '';
    for (const fn of providers) {
      try {
        const result = await fn();
        if (result) return result; // Buffer or URL string — tts.js handles both
      } catch (e) {
        lastErr = e.message;
      }
    }
    throw new Error(`All TTS providers failed. Last error: ${lastErr}`);
  }
};

module.exports = APIs;
