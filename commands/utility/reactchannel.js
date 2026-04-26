/**
 * React Channel Command — VIPER BOT MD
 * Sends emoji reactions to a WhatsApp Channel post
 * Original author: Omegatech | Adapted for Viper by SARG-TECH
 */

const axios  = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

// ── ReactChannel class ────────────────────────────────────────────────────────
class ReactChannel {
  constructor(userJwt) {
    this.siteKey    = '6LemKk8sAAAAAH5PB3f1EspbMlXjtwv5C8tiMHSm';
    this.backendUrl = 'https://back.asitha.top/api';
    this.http       = axios.create({
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userJwt}`,
      },
      timeout: 30000,
    });
  }

  async getRecaptchaToken() {
    const { data } = await axios.get(
      'https://omegatech-api.dixonomega.tech/api/tools/recaptcha-v3',
      {
        params: {
          sitekey:        this.siteKey,
          url:            this.backendUrl,
          use_enterprise: 'false',
        },
        timeout: 20000,
      }
    );
    if (!data?.success || !data?.token)
      throw new Error('reCAPTCHA bypass failed: ' + (data?.message || 'No token returned'));
    return data.token;
  }

  async getTempApiKey(recaptchaToken) {
    const { data } = await this.http.post(
      `${this.backendUrl}/user/get-temp-token`,
      { recaptcha_token: recaptchaToken }
    );
    if (!data?.token) throw new Error('Failed to obtain temp API key');
    return data.token;
  }

  async reactToPost(postLink, emojis) {
    const recaptcha = await this.getRecaptchaToken();
    const tempKey   = await this.getTempApiKey(recaptcha);
    const { data }  = await this.http.post(
      `${this.backendUrl}/channel/react-to-post?apiKey=${tempKey}`,
      { post_link: postLink, reacts: emojis.join(',') }
    );
    return data;
  }
}

// ── JWT — owner's account on back.asitha.top ──────────────────────────────────
// Rotate this when it expires (JWT exp is embedded in the token payload).
const USER_JWT = process.env.REACT_CHANNEL_JWT ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NTZmMzhjOTllNGEzOTVlOWM0ZTc3NSIsImlhdCI6MTc3NzE2NjQ0MiwiZXhwIjoxNzc3NzcxMjQyfQ.V3yZRhC5aVoFX7rwRwjIUGLH9Ly8mz4BsqgRA8ZOcH0';

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = {
  name:        'reactchannel',
  aliases:     ['rch', 'reactch'],
  category:    'utility',
  description: 'Send emoji reactions to a WhatsApp Channel post',
  usage:       '.rch <channel_post_link> <emoji1,emoji2,...>',

  async execute(sock, msg, args, extra) {
    // Usage guard
    if (!args[0]) {
      const u = extra.usedPrefix + 'rch';
      let t  = `┏❐ 《 *📡 ${sc('react channel')}* 》 ❐\n┃\n`;
      t     += `┣◆ 📌 *Usage:*\n`;
      t     += `┃  ${u} <link> <emoji1,emoji2>\n┃\n`;
      t     += `┣◆ 📝 *Example:*\n`;
      t     += `┃  ${u} https://whatsapp.com/channel/xxx 😭,🔥\n┃\n`;
      t     += `┣◆ ℹ️ *Notes:*\n`;
      t     += `┃  • Max 4 emojis\n`;
      t     += `┃  • Separate emojis with commas\n`;
      t     += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      return extra.reply(t);
    }

    // Parse args: first token = link, rest joined = emoji string
    const postLink  = args[0];
    const emojiStr  = args.slice(1).join(' ');

    if (!postLink.includes('whatsapp.com/channel/'))
      return extra.reply('❌ Invalid WhatsApp channel link.\nMust contain *whatsapp.com/channel/*');

    if (!emojiStr)
      return extra.reply('❌ No emojis provided.\nExample: `.rch <link> 😭,🔥`');

    const emojis = emojiStr.split(',').map(e => e.trim()).filter(Boolean);

    if (!emojis.length)
      return extra.reply('❌ Could not parse emojis. Separate them with commas: `😭,🔥`');

    if (emojis.length > 4)
      return extra.reply('❌ Max 4 emojis allowed.');

    // React
    await sock.sendMessage(extra.from, { react: { text: '🕒', key: msg.key } });

    try {
      const client = new ReactChannel(USER_JWT);
      await client.reactToPost(postLink, emojis);

      await sock.sendMessage(extra.from, { react: { text: '✅', key: msg.key } });

      let t  = `┏❐ 《 *📡 ${sc('react channel')}* 》 ❐\n┃\n`;
      t     += `┣◆ ✅ *Reactions sent successfully!*\n┃\n`;
      t     += `┣◆ 🔗 *Post:* ${postLink}\n`;
      t     += `┣◆ 😎 *Emojis:* ${emojis.join('  ')}\n`;
      t     += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      return extra.reply(t);

    } catch (e) {
      const errMsg = e.response?.data?.message || e.message || 'Unknown error';
      console.error('[ReactChannel]', errMsg);
      await sock.sendMessage(extra.from, { react: { text: '❌', key: msg.key } });
      return extra.reply(`❌ Failed to send reactions.\n*Reason:* ${errMsg}`);
    }
  },
};
