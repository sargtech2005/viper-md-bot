/**
 * WhatsApp Bot Platform
 * Copyright (c) 2024 Bot Platform
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 *
 * FIXES APPLIED:
 * 1. Import ffmpegPath so the correct binary is used (Termux / Docker / system).
 * 2. Give each run a unique filename so parallel conversions never collide.
 * 3. Always delete BOTH temp files (input AND output) even when ffmpeg errors.
 *    The old code orphaned the output file on non-zero exit, leaking disk space.
 */

const fs         = require('fs');
const path       = require('path');
const { spawn }  = require('child_process');
const ffmpegBin  = require('./ffmpegPath');  // resolves: system PATH / Termux / ffmpeg-static

// ── Silently delete a file — never throws ───────────────────────────────────
function tryUnlink(f) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} }

// ── Core ffmpeg wrapper ──────────────────────────────────────────────────────
function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return new Promise(async (resolve, reject) => {

    // Fail early with a clear message if ffmpeg is not installed
    if (!ffmpegBin) {
      return reject(new Error(
        'ffmpeg not found.\n' +
        '  Docker  : add "ffmpeg" to apk add in your Dockerfile\n' +
        '  Termux  : pkg install ffmpeg\n' +
        '  Linux   : apt install ffmpeg'
      ));
    }

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../temp');
    try {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    } catch (e) { return reject(e); }

    // Unique filenames — prevents collisions when many songs are downloaded at once
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmp = path.join(tempDir, `${uid}.${ext}`);
    const out = path.join(tempDir, `${uid}_out.${ext2}`);

    try {
      await fs.promises.writeFile(tmp, buffer);
    } catch (e) {
      return reject(e);
    }

    const proc = spawn(ffmpegBin, ['-y', '-i', tmp, ...args, out]);

    proc.on('error', (e) => {
      tryUnlink(tmp);
      tryUnlink(out);   // ← FIX: was missing — orphaned on spawn error
      reject(e);
    });

    proc.on('close', async (code) => {
      tryUnlink(tmp);   // always clean up input

      if (code !== 0) {
        tryUnlink(out); // ← FIX: was missing — orphaned on non-zero exit
        return reject(new Error(`ffmpeg exited with code ${code}`));
      }

      try {
        const result = await fs.promises.readFile(out);
        tryUnlink(out); // clean up output after reading
        resolve(result);
      } catch (e) {
        tryUnlink(out); // ← FIX: was missing — orphaned if readFile throws
        reject(e);
      }
    });
  });
}

/**
 * Convert Audio to Playable WhatsApp Audio (MP3)
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext    Input file extension
 */
function toAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-ac',  '2',
    '-b:a', '128k',
    '-ar',  '44100',
    '-f',   'mp3',
  ], ext, 'mp3');
}

/**
 * Convert Audio to Playable WhatsApp Voice Note (PTT / Opus)
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext    Input file extension
 */
function toPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a',               'libopus',
    '-b:a',               '128k',
    '-vbr',               'on',
    '-compression_level', '10',
  ], ext, 'opus');
}

/**
 * Convert Video to WhatsApp-compatible MP4
 * @param {Buffer} buffer Video Buffer
 * @param {String} ext    Input file extension
 */
function toVideo(buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v',   'libx264',
    '-c:a',   'aac',
    '-ab',    '128k',
    '-ar',    '44100',
    '-crf',   '32',
    '-preset','slow',
  ], ext, 'mp4');
}

module.exports = { toAudio, toPTT, toVideo, ffmpeg };
