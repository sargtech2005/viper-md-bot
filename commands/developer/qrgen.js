/**
 * .qrgen <text>  (VIPER BOT MD)
 * Generates a QR code image using the qrcode npm package.
 */
const config   = require('../../config');
const database = require('../../database');
const { sc } = require('../../utils/categoryMenu');
const QRCode = require('qrcode');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');

module.exports = {
  name: 'qrgen',
  aliases: ['qr', 'genqr', 'makeqr'],
  category: 'developer',
  description: 'Generate a QR code image from any text or URL',
  usage: '.qrgen <text or URL>',

  async execute(sock, msg, args, extra) {
    const text = args.join(' ').trim();
    if (!text) return extra.reply(
      `⬛ Give me something to encode!\nUsage: *.qrgen <text>*\nExample: *.qrgen https://t.me/vipermdpairbot*`
    );

    await extra.reply(`⬛ Generating QR code...`);

    const tmpFile = path.join(os.tmpdir(), `qr_${Date.now()}.png`);
    try {
      await QRCode.toFile(tmpFile, text, {
        type:          'png',
        width:         400,
        margin:        2,
        color:         { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });

      await sock.sendMessage(extra.from, {
        image:   fs.readFileSync(tmpFile),
        caption: `⬛ *QR Code generated!*\n\n📝 *Content:* \`${text.slice(0, 100)}\`\n\n> *${config.botName}* 🐍`,
        ...{
          contextInfo: {
            forwardingScore: 1, isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid:   config.newsletterJid,
              newsletterName:  config.botName,
              serverMessageId: -1,
            },
          },
        },
      }, { quoted: msg });

    } catch (e) {
      await extra.reply(`💀 QR generation failed: \`${e.message}\``);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  },
};
