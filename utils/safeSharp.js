/**
 * safeSharp.js — VIPER BOT MD
 * Wraps sharp with a Jimp fallback for ARM (Termux/Android).
 * Never throws on require() — errors happen per-call so the bot stays up.
 */
let _sharp = null;
let _jimp  = null;
let _sharpOk = false;

// Try loading sharp once (it may fail on android-arm)
try {
  _sharp   = require('sharp');
  _sharpOk = true;
} catch (_) {
  // sharp not available — will use Jimp
}

// Try loading Jimp
try { _jimp = require('jimp'); } catch (_) {}

/**
 * Convert any image buffer to PNG Buffer.
 * @param {Buffer} input
 * @returns {Promise<Buffer>}
 */
async function toPng(input) {
  if (_sharpOk) {
    try { return await _sharp(input).png().toBuffer(); } catch (_) {}
  }
  if (_jimp) {
    const img = await _jimp.read(input);
    return await img.getBufferAsync(_jimp.MIME_PNG);
  }
  throw new Error('No image processor available (sharp + jimp both unavailable)');
}

/**
 * Resize image to fit within maxW × maxH, return PNG Buffer.
 */
async function resize(input, maxW, maxH) {
  if (_sharpOk) {
    try {
      return await _sharp(input)
        .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
        .png().toBuffer();
    } catch (_) {}
  }
  if (_jimp) {
    const img = await _jimp.read(input);
    img.scaleToFit(maxW, maxH);
    return await img.getBufferAsync(_jimp.MIME_PNG);
  }
  throw new Error('No image processor available');
}

/**
 * Get image metadata (width, height, format).
 */
async function metadata(input) {
  if (_sharpOk) {
    try { return await _sharp(input).metadata(); } catch (_) {}
  }
  if (_jimp) {
    const img = await _jimp.read(input);
    return { width: img.bitmap.width, height: img.bitmap.height, pages: 1 };
  }
  throw new Error('No image processor available');
}

/**
 * Convert WebP buffer to PNG buffer (first frame).
 */
async function webpToPng(input) {
  return toPng(input);
}

module.exports = { toPng, resize, metadata, webpToPng, isSharpAvailable: () => _sharpOk };
