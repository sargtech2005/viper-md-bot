/**
 * .passgen [length] [type]  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const crypto = require('crypto');

const CHARSETS = {
  alpha:   'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  num:     '0123456789',
  sym:     '!@#$%^&*()-_=+[]{}|;:,.<>?',
  get all() { return this.alpha + this.num + this.sym; },
  get alphanum() { return this.alpha + this.num; },
};

function genPass(length, charset) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => charset[b % charset.length]).join('');
}

function strength(pass) {
  let score = 0;
  if (/[a-z]/.test(pass)) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  if (pass.length >= 16) score++;
  return ['❌ Weak', '🟡 Fair', '🟡 Moderate', '🟢 Strong', '🟢 Very Strong', '🔒 Fort Knox 😂'][score];
}

module.exports = {
  name: 'passgen',
  aliases: ['pwgen', 'genpass', 'password'],
  category: 'developer',
  description: 'Generate a strong random password',
  usage: '.passgen [length] [all|alphanum|alpha|num]',

  async execute(sock, msg, args, extra) {
    try {
      const len  = Math.min(Math.max(parseInt(args[0] || '16') || 16, 4), 128);
      const type = (args[1] || 'all').toLowerCase();

      const charset = CHARSETS[type] || CHARSETS.all;
      if (!CHARSETS[type]) {
        return extra.reply(
          `😬 Unknown type *${type}*\nValid: \`all | alphanum | alpha | num\``
        );
      }

      const pass = genPass(len, charset);
      const str  = strength(pass);

      let t = `┏❐ 《 *🛡️ ${sc('password generator')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🔑 *Password*:\n┃\`${pass}\`\n`;
      t += `┣◆ 📏 *Length*:   \`${len}\`\n`;
      t += `┣◆ 🔤 *Charset*:  \`${type}\`\n`;
      t += `┣◆ 💪 *Strength*: ${str}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
