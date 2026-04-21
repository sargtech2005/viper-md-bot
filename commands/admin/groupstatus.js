/**
 * .gs / .groupstatus — Post to WhatsApp Group Status
 * ───────────────────────────────────────────────────
 * Posts to the group's Status feed — members see it just like
 * a normal WhatsApp story/status.
 *
 * HOW TO USE:
 *   Send image/video with caption  →  .gs [optional caption]
 *   Reply to image/video/audio     →  .gs [optional caption]
 *   Text only                      →  .gs your message here
 *   Text with color                →  .gs red your message
 *
 * Colors: red orange yellow green teal blue purple pink black
 */

const crypto = require('crypto');
const {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const { PassThrough } = require('stream');

// ffmpeg — optional, only needed for audio/voice status
let fluent = null;
let ffmpegBin = null;
try {
  fluent    = require('fluent-ffmpeg');
  ffmpegBin = require('../../utils/ffmpegPath');
  if (ffmpegBin) fluent.setFfmpegPath(ffmpegBin);
} catch (_) {}

const COLORS = {
  red:    '#C0392B',
  orange: '#E67E22',
  yellow: '#F1C40F',
  green:  '#27AE60',
  teal:   '#16A085',
  blue:   '#2980B9',
  purple: '#9C27B0',
  pink:   '#E91E63',
  black:  '#212121',
};
const DEFAULT_COLOR = '#9C27B0';

module.exports = {
  name: 'groupstatus',
  aliases: ['gs', 'gstatus', 'grpstatus', 'addstatus'],
  description: 'Post to WhatsApp Group Status (image, video, audio, or text)',
  usage: '.gs [caption]  |  reply to media  |  .gs text here  |  .gs red text',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const from = extra.from;

    if (!extra.isGroup) {
      return extra.reply('👥 This command only works inside groups.');
    }

    // ── Parse optional colour keyword from front of args ─────────────────
    let bgColor = DEFAULT_COLOR;
    let textArgs = args.slice();
    if (textArgs.length > 0 && COLORS[textArgs[0]?.toLowerCase()]) {
      bgColor  = COLORS[textArgs[0].toLowerCase()];
      textArgs = textArgs.slice(1);
    }
    const caption = textArgs.join(' ').trim();

    // ── Figure out where the media is ─────────────────────────────────────
    // Priority 1: current message has media attached (user sent with .gs as caption)
    // Priority 2: user replied to a media message
    // Priority 3: text-only status

    const content    = msg.message || {};
    const imgDirect  = content.imageMessage;
    const vidDirect  = content.videoMessage;
    const audDirect  = content.audioMessage;

    const ctx        = content.extendedTextMessage?.contextInfo
                    || content.imageMessage?.contextInfo
                    || content.videoMessage?.contextInfo
                    || content.audioMessage?.contextInfo;
    const quotedMsg  = ctx?.quotedMessage;
    const quotedType = quotedMsg ? Object.keys(quotedMsg)[0] : null;

    // ── CASE A: Image sent WITH this command as caption ───────────────────
    if (imgDirect) {
      await extra.reply('⏳ Posting image to group status...');
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        await postStatus(sock, from, { image: buf, caption }, bgColor);
        return extra.reply('✅ Image posted to group status!' + (caption ? `\n📝 _"${caption}"_` : ''));
      } catch (e) {
        console.error('[GS] direct image:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── CASE B: Video sent WITH this command as caption ───────────────────
    if (vidDirect) {
      await extra.reply('⏳ Posting video to group status...');
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        await postStatus(sock, from, { video: buf, caption }, bgColor);
        return extra.reply('✅ Video posted to group status!' + (caption ? `\n📝 _"${caption}"_` : ''));
      } catch (e) {
        console.error('[GS] direct video:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── CASE C: Audio sent WITH this command ─────────────────────────────
    if (audDirect) {
      await extra.reply('⏳ Posting audio to group status...');
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const { finalBuf, waveform } = await prepareAudio(buf);
        await postStatus(sock, from, { audio: finalBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true, waveform }, bgColor);
        return extra.reply('✅ Audio posted to group status!');
      } catch (e) {
        console.error('[GS] direct audio:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── CASE D: Reply to image ────────────────────────────────────────────
    if (quotedMsg && /image|sticker/i.test(quotedType)) {
      await extra.reply('⏳ Posting image to group status...');
      try {
        const buf = await dlQuoted(quotedMsg, quotedType.includes('sticker') ? 'sticker' : 'image', ctx, from);
        await postStatus(sock, from, { image: buf, caption }, bgColor);
        return extra.reply('✅ Image posted to group status!' + (caption ? `\n📝 _"${caption}"_` : ''));
      } catch (e) {
        console.error('[GS] quoted image:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── CASE E: Reply to video ────────────────────────────────────────────
    if (quotedMsg && /video/i.test(quotedType)) {
      await extra.reply('⏳ Posting video to group status...');
      try {
        const buf = await dlQuoted(quotedMsg, 'video', ctx, from);
        await postStatus(sock, from, { video: buf, caption }, bgColor);
        return extra.reply('✅ Video posted to group status!' + (caption ? `\n📝 _"${caption}"_` : ''));
      } catch (e) {
        console.error('[GS] quoted video:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── CASE F: Reply to audio / voice note ──────────────────────────────
    if (quotedMsg && /audio/i.test(quotedType)) {
      await extra.reply('⏳ Posting audio to group status...');
      try {
        const buf = await dlQuoted(quotedMsg, 'audio', ctx, from);
        const { finalBuf, waveform } = await prepareAudio(buf);
        await postStatus(sock, from, { audio: finalBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true, waveform }, bgColor);
        return extra.reply('✅ Audio posted to group status!');
      } catch (e) {
        console.error('[GS] quoted audio:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── CASE G: Text-only status ──────────────────────────────────────────
    if (caption) {
      await extra.reply('⏳ Posting text to group status...');
      try {
        await postStatus(sock, from, { text: caption }, bgColor);
        return extra.reply(`✅ Text posted to group status!\n📝 _"${caption}"_`);
      } catch (e) {
        console.error('[GS] text:', e.message);
        return extra.reply('❌ Failed: ' + e.message);
      }
    }

    // ── No content at all → show help ─────────────────────────────────────
    return extra.reply(
      '📢 *Group Status — Post like a Story*\n\n' +
      '*Send image/video directly:*\n' +
      '  Attach image → caption: `.gs`\n' +
      '  Attach image → caption: `.gs Hello everyone!`\n\n' +
      '*Reply to any media:*\n' +
      '  Reply to image/video/audio → `.gs`\n' +
      '  Reply to image → `.gs Check this out!`\n\n' +
      '*Text status:*\n' +
      '  `.gs Hello everyone!`\n' +
      '  `.gs red 🔴 Urgent announcement`\n' +
      '  `.gs blue Meeting at 5pm today`\n\n' +
      '*Colors:* red · orange · yellow · green · teal · blue · purple · pink · black\n\n' +
      '> Only group admins can use this. Bot must be admin too.'
    );
  },
};

// ── Post groupStatusMessageV2 ────────────────────────────────────────────────
async function postStatus(sock, jid, content, bgColor) {
  const inner = await generateWAMessageContent(content, {
    upload: sock.waUploadToServer,
  });

  // Inject background colour into text messages
  if (content.text) {
    inner.extendedTextMessage = {
      text: content.text,
      backgroundArgb: hexToArgb(bgColor),
      font: 0,
    };
    delete inner.conversation;
  }

  const secret = crypto.randomBytes(32);
  const waMsg  = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo:  { messageSecret: secret },
      groupStatusMessageV2: {
        message: {
          ...inner,
          messageContextInfo: { messageSecret: secret },
        },
      },
    },
    {}
  );

  await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
  return waMsg;
}

// ── Download quoted message media ────────────────────────────────────────────
async function dlQuoted(quotedMsg, type, ctx, from) {
  const mediaMsg = quotedMsg[`${type}Message`] || quotedMsg;
  const stream   = await downloadContentFromMessage(mediaMsg, type);
  const chunks   = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Prepare audio: convert to opus + build waveform ─────────────────────────
async function prepareAudio(buf) {
  let finalBuf = buf;
  let waveform;
  if (fluent && ffmpegBin) {
    try { finalBuf = await toOpus(buf); } catch (_) {}
    try { waveform = await buildWaveform(buf); } catch (_) {}
  }
  return { finalBuf, waveform };
}

// ── hex color → WhatsApp ARGB uint32 ────────────────────────────────────────
function hexToArgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

// ── Convert audio to OGG/Opus ────────────────────────────────────────────────
function toOpus(buffer) {
  return new Promise((resolve, reject) => {
    const src = new PassThrough();
    const dst = new PassThrough();
    const chunks = [];
    src.end(buffer);
    dst.on('data', c => chunks.push(c));
    dst.on('end',  () => resolve(Buffer.concat(chunks)));
    dst.on('error', reject);
    fluent(src).noVideo().audioCodec('libopus').format('ogg')
      .audioChannels(1).audioFrequency(48000)
      .on('error', reject).pipe(dst, { end: true });
  });
}

// ── Build waveform from raw audio ────────────────────────────────────────────
function buildWaveform(buffer, bars = 64) {
  return new Promise((resolve, reject) => {
    const src = new PassThrough();
    const dst = new PassThrough();
    const chunks = [];
    src.end(buffer);
    dst.on('data',  c => chunks.push(c));
    dst.on('error', reject);
    dst.on('end', () => {
      const raw     = Buffer.concat(chunks);
      const samples = raw.length / 2;
      if (!samples) return resolve(undefined);
      const amps = Array.from({ length: samples }, (_, i) =>
        Math.abs(raw.readInt16LE(i * 2)) / 32768
      );
      const size = Math.floor(amps.length / bars);
      if (!size) return resolve(undefined);
      const avg = Array.from({ length: bars }, (_, i) =>
        amps.slice(i * size, (i + 1) * size).reduce((a, b) => a + b, 0) / size
      );
      const max = Math.max(...avg);
      if (!max) return resolve(undefined);
      resolve(Buffer.from(avg.map(v => Math.floor((v / max) * 100))).toString('base64'));
    });
    fluent(src).audioChannels(1).audioFrequency(16000).format('s16le')
      .on('error', reject).pipe(dst, { end: true });
  });
}
