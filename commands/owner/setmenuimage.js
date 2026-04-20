/**
 * .setmenuimage — Set menu image (per-session, isolated per user)
 * Saves to SESSION_DIR/db/menu_image.jpg — never shared across sessions.
 */

const fs   = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const database = require('../../database');

module.exports = {
  name: 'setmenuimage',
  aliases: ['setmenuimg', 'changemenuimage'],
  category: 'owner',
  description: 'Set or change the menu image (reply to image/sticker)',
  usage: '.setmenuimage (reply to an image or sticker)',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx?.quotedMessage)
        return extra.reply('📷 Reply to an *image* or *sticker* to set it as your menu image.');

      const quotedMsg = ctx.quotedMessage;
      const imageMsg  = quotedMsg.imageMessage || quotedMsg.stickerMessage;
      if (!imageMsg)
        return extra.reply('❌ The replied message must be an *image* or *sticker*.');

      // Check size — enforce 1 MB limit
      const fileSize = imageMsg.fileLength || imageMsg.fileSizeBytes || 0;
      if (fileSize > 1_048_576)
        return extra.reply('❌ Image too large. Please use an image *under 1 MB*.');

      const targetMessage = {
        key: { remoteJid: chatId, id: ctx.stanzaId, participant: ctx.participant },
        message: quotedMsg,
      };

      const mediaBuffer = await downloadMediaMessage(
        targetMessage, 'buffer', {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer || mediaBuffer.length === 0)
        return extra.reply('❌ Failed to download image. Please try again.');

      if (mediaBuffer.length > 1_048_576)
        return extra.reply('❌ Image too large after download. Please use an image under 1 MB.');

      // Convert to JPEG
      let finalBuffer = mediaBuffer;
      const needsConvert = quotedMsg.stickerMessage
        || (!imageMsg.mimetype?.includes('jpeg') && !imageMsg.mimetype?.includes('jpg'));

      if (needsConvert) {
        const sharp = require('../../utils/safeSharp');
        finalBuffer = await sharp(mediaBuffer).jpeg({ quality: 85 }).toBuffer();
        if (finalBuffer.length > 1_048_576) {
          // Re-compress at lower quality if still too big
          finalBuffer = await sharp(mediaBuffer).jpeg({ quality: 60 }).toBuffer();
        }
      }

      // Save to per-session DB directory — completely isolated per user
      const dbPath   = database.DB_PATH;
      const imgPath  = path.join(dbPath, 'menu_image.jpg');

      fs.mkdirSync(dbPath, { recursive: true });
      fs.writeFileSync(imgPath, finalBuffer);

      // Store the path in session settings so menu.js can find it
      database.updateSettings({ menuImagePath: imgPath });

      await extra.reply(`✅ Menu image updated! (${Math.round(finalBuffer.length / 1024)} KB)\n\n> Your menu image is private to your bot 🐍`);

    } catch (e) {
      console.error('[setmenuimage]', e.message);
      await extra.reply(`❌ Failed to set menu image: ${e.message}`);
    }
  },
};
