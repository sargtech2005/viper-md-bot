/**
 * .minify html|css|js <code>  (VIPER BOT MD)
 * Simple inline minifier — no build tools needed.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')           // remove comments
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')       // strip spaces around symbols
    .replace(/\s{2,}/g, ' ')                     // collapse whitespace
    .replace(/;\}/g, '}')                        // remove last semicolon in block
    .replace(/\n/g, '')
    .trim();
}

function minifyJS(js) {
  return js
    .replace(/\/\/[^\n]*/g, '')                 // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')            // multi-line comments
    .replace(/\s*([=+\-*/%&|^!<>?:,;{}()\[\]])\s*/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n/g, '')
    .trim();
}

function minifyHTML(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')             // HTML comments
    .replace(/\s{2,}/g, ' ')                     // collapse whitespace
    .replace(/>\s+</g, '><')                     // whitespace between tags
    .replace(/\n/g, '')
    .trim();
}

const MINIFIERS = { html: minifyHTML, css: minifyCSS, js: minifyJS };

module.exports = {
  name: 'minify',
  aliases: ['compress', 'uglify', 'mincode'],
  category: 'developer',
  description: 'Minify HTML, CSS or JavaScript code',
  usage: '.minify html|css|js <code>',

  async execute(sock, msg, args, extra) {
    const type = (args[0] || '').toLowerCase();
    const code = args.slice(1).join(' ').trim();

    if (!MINIFIERS[type] || !code) {
      return extra.reply(
        `📦 Need a type and code!\n` +
        `Usage: *.minify html|css|js <code>*\n` +
        `Example: *.minify css  body { background: red; color: blue; }*`
      );
    }

    try {
      const minified  = MINIFIERS[type](code);
      const savedChars = code.length - minified.length;
      const savedPct   = ((savedChars / code.length) * 100).toFixed(1);

      let t = `┏❐ 《 *📦 ${sc('minify')} — ${type.toUpperCase()}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📏 *Original*: \`${code.length} chars\`\n`;
      t += `┣◆ ✂️  *Minified*: \`${minified.length} chars\`\n`;
      t += `┣◆ 💾 *Saved*:    \`${savedChars} chars (${savedPct}%)\`\n`;
      t += `┃\n`;
      t += `┣◆ 📋 *Result*:\n`;
      const display = minified.length > 1500 ? minified.slice(0, 1500) + '…' : minified;
      t += `\`\`\`\n${display}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Minification failed: \`${e.message}\``);
    }
  },
};
