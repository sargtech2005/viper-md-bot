/**
 * Translate Command - multi-API fallback, works by reply or direct text
 */

const fetch = require('node-fetch');

module.exports = {
  name: 'translate',
  aliases: ['trt', 'tr'],
  category: 'utility',
  description: 'Translate text to different languages',
  usage: '.translate <lang> <text>  OR  reply to a message with .translate <lang>',

  async execute(sock, msg, args, extra) {
    try {
      let textToTranslate = '';
      let lang = '';

      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (quotedMessage) {
        textToTranslate = quotedMessage.conversation
          || quotedMessage.extendedTextMessage?.text
          || quotedMessage.imageMessage?.caption
          || quotedMessage.videoMessage?.caption || '';
        lang = args.join(' ').trim();
      } else {
        if (args.length < 2) {
          return extra.reply(
            '*🌐 Translator*\n\n' +
            'Usage:\n' +
            '1. Reply to a message: `.translate fr`\n' +
            '2. Direct: `.translate fr Hello world`\n\n' +
            'Codes: `en es fr de it pt ru ja ko zh ar hi`'
          );
        }
        lang = args[0];
        textToTranslate = args.slice(1).join(' ');
      }

      if (!textToTranslate) return extra.reply('❌ No text to translate.');
      if (!lang)           return extra.reply('❌ No language code. Example: `.translate fr Hello`');

      // Fire-and-forget typing — non-blocking
      sock.sendPresenceUpdate('composing', extra.from).catch(() => {});

      let translatedText = null;

      // API 1 — Google Translate (free endpoint)
      try {
        const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(textToTranslate)}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.[0]?.[0]?.[0]) translatedText = d[0][0][0];
        }
      } catch {}

      // API 2 — MyMemory
      if (!translatedText) {
        try {
          const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|${lang}`);
          if (r.ok) {
            const d = await r.json();
            if (d?.responseData?.translatedText) translatedText = d.responseData.translatedText;
          }
        } catch {}
      }

      // API 3 — Dreaded
      if (!translatedText) {
        try {
          const r = await fetch(`https://api.dreaded.site/api/translate?text=${encodeURIComponent(textToTranslate)}&lang=${lang}`);
          if (r.ok) {
            const d = await r.json();
            if (d?.translated) translatedText = d.translated;
          }
        } catch {}
      }

      if (!translatedText) return extra.reply('❌ All translation APIs failed. Try again shortly.');

      await extra.reply(
        `🌐 *Translation*\n\n` +
        `📝 *Original:* ${textToTranslate}\n` +
        `🔤 *Translated (${lang.toUpperCase()}):* ${translatedText}`
      );

    } catch (e) {
      await extra.reply(`❌ Translation error: ${e.message}`);
    }
  },
};
