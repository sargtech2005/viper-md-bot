/**
 * .status — Post to Owner's WhatsApp Personal Status (Story)
 * ─────────────────────────────────────────────────────────────
 * Works exactly like .gs (Group Status) but posts to status@broadcast
 * so it appears as the bot owner's WhatsApp story/status.
 *
 * HOW TO USE:
 *   Send image/video with caption  →  .status [optional caption]
 *   Reply to image/video/audio     →  .status [optional caption]
 *   Text only                      →  .status your message here
 *   Text with color                →  .status red your message
 *
 * Colors: red orange yellow green teal blue purple pink black
 */

const {
  downloadContentFromMessage,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const database = require('../../database');
const config   = require('../../config');
const { sc }   = require('../../utils/categoryMenu');

// ffmpeg — optional, only needed for audio/voice status
let fluent = null, ffmpegBin = null;
try {
  fluent    = require('fluent-ffmpeg');
  ffmpegBin = require('../../utils/ffmpegPath');
  if (ffmpegBin) fluent.setFfmpegPath(ffmpegBin);
} catch (_) {}

const COLORS = {
  red:    '#C0392B', orange: '#E67E22', yellow: '#F1C40F',
  green:  '#27AE60', teal:   '#16A085', blue:   '#2980B9',
  purple: '#9C27B0', pink:   '#E91E63', black:  '#212121',
};
const DEFAULT_COLOR = '#9C27B0';

module.exports = {
  name: 'status',
  aliases: ['poststatus', 'mystatus', 'os'],
  category: 'owner',
  description: 'Post to bot owner WhatsApp status/story',
  usage: '.status [caption]  |  reply to media  |  .status text here  |  .status red text',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const B = database.getSetting('botName', config.botName);

    // ── Parse optional colour keyword ─────────────────────────────────────
    let bgColor  = DEFAULT_COLOR;
    let textArgs = args.slice();
    if (textArgs.length > 0 && COLORS[textArgs[0]?.toLowerCase()]) {
      bgColor  = COLORS[textArgs[0].toLowerCase()];
      textArgs = textArgs.slice(1);
    }
    const caption = textArgs.join(' ').trim();

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

    // ── CASE A: Image sent WITH this command ──────────────────────────────
    if (imgDirect) {
      await extra.reply('⏳ Posting image to your status...');
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        await postMyStatus(sock, { image: buf, caption });
        return extra.reply(`✅ Image posted to your status!${caption ? `\n📝 _"${caption}"_` : ''}\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── CASE B: Video sent WITH this command ──────────────────────────────
    if (vidDirect) {
      await extra.reply('⏳ Posting video to your status...');
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        await postMyStatus(sock, { video: buf, caption, gifPlayback: false });
        return extra.reply(`✅ Video posted to your status!${caption ? `\n📝 _"${caption}"_` : ''}\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── CASE C: Audio sent WITH this command ──────────────────────────────
    if (audDirect) {
      await extra.reply('⏳ Posting audio to your status...');
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const { finalBuf, waveform } = await prepareAudio(buf);
        await postMyStatus(sock, { audio: finalBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true, waveform });
        return extra.reply(`✅ Audio posted to your status!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── CASE D: Reply to image ────────────────────────────────────────────
    if (quotedMsg && /image|sticker/i.test(quotedType)) {
      await extra.reply('⏳ Posting image to your status...');
      try {
        const buf = await dlQuoted(quotedMsg, quotedType.includes('sticker') ? 'sticker' : 'image', ctx);
        await postMyStatus(sock, { image: buf, caption });
        return extra.reply(`✅ Image posted to your status!${caption ? `\n📝 _"${caption}"_` : ''}\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── CASE E: Reply to video ────────────────────────────────────────────
    if (quotedMsg && /video/i.test(quotedType)) {
      await extra.reply('⏳ Posting video to your status...');
      try {
        const buf = await dlQuoted(quotedMsg, 'video', ctx);
        await postMyStatus(sock, { video: buf, caption, gifPlayback: false });
        return extra.reply(`✅ Video posted to your status!${caption ? `\n📝 _"${caption}"_` : ''}\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── CASE F: Reply to audio ────────────────────────────────────────────
    if (quotedMsg && /audio/i.test(quotedType)) {
      await extra.reply('⏳ Posting audio to your status...');
      try {
        const buf = await dlQuoted(quotedMsg, 'audio', ctx);
        const { finalBuf, waveform } = await prepareAudio(buf);
        await postMyStatus(sock, { audio: finalBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true, waveform });
        return extra.reply(`✅ Audio posted to your status!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── CASE G: Text-only status ──────────────────────────────────────────
    if (caption) {
      await extra.reply('⏳ Posting text to your status...');
      try {
        await postMyStatus(sock, { text: caption }, bgColor);
        return extra.reply(`✅ Text posted to your status!\n📝 _"${caption}"_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      } catch (e) { return extra.reply('❌ Failed: ' + e.message); }
    }

    // ── No content → show help ────────────────────────────────────────────
    return extra.reply(
      `┏❐ 《 *📢 ${sc('owner status')}* 》 ❐\n┃\n` +
      `┣◆ 🖼️ *Image:*\n┃   Attach image → caption: *.status*\n┃   Attach image → caption: *.status Hello!*\n┃\n` +
      `┣◆ 🎥 *Video:*\n┃   Attach video → caption: *.status [text]*\n┃\n` +
      `┣◆ 🎵 *Reply to media:*\n┃   Reply to image/video/audio → *.status*\n┃\n` +
      `┣◆ 💬 *Text:*\n┃   *.status Hello everyone!*\n┃   *.status red 🔴 Urgent update*\n┃\n` +
      `┣◆ 🎨 *Colors:* red · orange · yellow · green · teal · blue · purple · pink · black\n` +
      `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
    );
  },
};

// ── Post to status@broadcast (personal story) ────────────────────────────────
async function postMyStatus(sock, content, bgColor) {
  const payload = { ...content, backgroundColor: bgColor };
  await sock.sendMessage('status@broadcast', payload);
}

// ── Download quoted message media ────────────────────────────────────────────
async function dlQuoted(quotedMsg, type, ctx) {
  const mediaMsg = quotedMsg[`${type}Message`] || quotedMsg;
  const stream   = await downloadContentFromMessage(mediaMsg, type);
  const chunks   = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Prepare audio: convert to opus + build waveform ─────────────────────────
async function prepareAudio(buf) {
  let finalBuf = buf, waveform;
  if (fluent && ffmpegBin) {
    try { finalBuf = await toOpus(buf); } catch (_) {}
    try { waveform = await buildWaveform(buf); } catch (_) {}
  }
  return { finalBuf, waveform };
}

function toOpus(buffer) {
  const { PassThrough } = require('stream');
  return new Promise((resolve, reject) => {
    const src = new PassThrough(), dst = new PassThrough(), chunks = [];
    src.end(buffer);
    dst.on('data', c => chunks.push(c));
    dst.on('end',  () => resolve(Buffer.concat(chunks)));
    dst.on('error', reject);
    fluent(src).noVideo().audioCodec('libopus').format('ogg')
      .audioChannels(1).audioFrequency(48000).on('error', reject).pipe(dst, { end: true });
  });
}

function buildWaveform(buffer, bars = 64) {
  const { PassThrough } = require('stream');
  return new Promise((resolve, reject) => {
    const src = new PassThrough(), dst = new PassThrough(), chunks = [];
    src.end(buffer);
    dst.on('data', c => chunks.push(c));
    dst.on('error', reject);
    dst.on('end', () => {
      const raw = Buffer.concat(chunks), samples = raw.length / 2;
      if (!samples) return resolve(undefined);
      const amps = Array.from({ length: samples }, (_, i) => Math.abs(raw.readInt16LE(i * 2)) / 32768);
      const size = Math.floor(amps.length / bars);
      if (!size) return resolve(undefined);
      const avg = Array.from({ length: bars }, (_, i) =>
        amps.slice(i * size, (i + 1) * size).reduce((a, b) => a + b, 0) / size);
      const max = Math.max(...avg);
      if (!max) return resolve(undefined);
      resolve(Buffer.from(avg.map(v => Math.floor((v / max) * 100))).toString('base64'));
    });
    fluent(src).audioChannels(1).audioFrequency(16000).format('s16le').on('error', reject).pipe(dst, { end: true });
  });
}
