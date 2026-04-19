/**
 * ffmpegPath.js — VIPER BOT MD
 * Resolves ffmpeg from system PATH on Termux/Linux.
 * Falls back gracefully so the bot doesn't crash on startup
 * even if ffmpeg isn't installed.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

function resolveFFmpeg() {
  // 1. Try system ffmpeg (works on Termux: pkg install ffmpeg)
  try {
    const which = execSync('which ffmpeg 2>/dev/null || command -v ffmpeg 2>/dev/null', {
      encoding: 'utf8', timeout: 3000,
    }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch (_) {}

  // 2. Common Termux path
  const termuxPath = '/data/data/com.termux/files/usr/bin/ffmpeg';
  if (fs.existsSync(termuxPath)) return termuxPath;

  // 3. Try ffmpeg-static (only if actually installed)
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath && fs.existsSync(staticPath)) return staticPath;
  } catch (_) {}

  // 4. Return null — commands that need ffmpeg will fail gracefully
  return null;
}

const ffmpegPath = resolveFFmpeg();

if (!ffmpegPath) {
  console.warn('⚠️  ffmpeg not found. Sticker/media conversion will be limited.');
  console.warn('   Install it on Termux with:  pkg install ffmpeg');
}

module.exports = ffmpegPath;
