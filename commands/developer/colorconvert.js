/**
 * .colorconvert <value>  (VIPER BOT MD)
 * Converts between HEX, RGB and HSL colour formats.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c+c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0)*255), g: Math.round(f(8)*255), b: Math.round(f(4)*255) };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function colorBlock(hex) {
  // Best effort emoji approximation for color block visual
  return `🎨 \`${hex}\``;
}

module.exports = {
  name: 'colorconvert',
  aliases: ['color', 'colour', 'hex2rgb', 'rgb2hex', 'colorconv'],
  category: 'developer',
  description: 'Convert HEX ↔ RGB ↔ HSL colours',
  usage: '.colorconvert <#hex | rgb(r,g,b) | hsl(h,s%,l%)>',

  async execute(sock, msg, args, extra) {
    const raw = args.join(' ').trim();
    if (!raw) return extra.reply(
      `🤦 Give me a colour value!\n` +
      `Usage: *.colorconvert <value>*\n` +
      `Examples:\n` +
      `  *.colorconvert #FF5733*\n` +
      `  *.colorconvert rgb(255,87,51)*\n` +
      `  *.colorconvert hsl(14,100%,60%)*`
    );

    try {
      let rgb;

      // ── Parse input ─────────────────────────────────────────────────────
      if (/^#?[0-9a-fA-F]{3,6}$/.test(raw.replace(/\s/,''))) {
        rgb = hexToRgb(raw.trim().startsWith('#') ? raw.trim() : '#' + raw.trim());
      } else if (/rgb\s*\(/i.test(raw)) {
        const m = raw.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
        if (!m) throw new Error('Invalid rgb() format. Use: rgb(255,87,51)');
        rgb = { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
        for (const k of ['r','g','b']) {
          if (rgb[k] < 0 || rgb[k] > 255) throw new Error(`Value ${rgb[k]} out of 0–255 range`);
        }
      } else if (/hsl\s*\(/i.test(raw)) {
        const m = raw.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
        if (!m) throw new Error('Invalid hsl() format. Use: hsl(14,100%,60%)');
        rgb = hslToRgb(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
      } else {
        throw new Error('Unrecognised format. Use #HEX, rgb(r,g,b) or hsl(h,s%,l%)');
      }

      const hex = rgbToHex(rgb);
      const hsl = rgbToHsl(rgb);

      let t = `┏❐ 《 *🎨 ${sc('colour converter')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🔷 *HEX*  : \`${hex}\`\n`;
      t += `┣◆ 🔴 *RGB*  : \`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})\`\n`;
      t += `┣◆ 🌈 *HSL*  : \`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\`\n`;
      t += `┃\n`;
      t += `┣◆ 🖌️ *CSS*   : \`color: ${hex};\`\n`;
      t += `┣◆ 🖌️ *CSS*   : \`color: rgb(${rgb.r},${rgb.g},${rgb.b});\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ *Colour parse error:*\n\`${e.message}\``);
    }
  },
};
