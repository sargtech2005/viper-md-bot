/**
 * .jwt <token>  (VIPER BOT MD)
 * Decodes and inspects a JWT without verifying signature.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

function b64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad    = (4 - padded.length % 4) % 4;
  return Buffer.from(padded + '='.repeat(pad), 'base64').toString('utf8');
}

function fmtDate(val) {
  try {
    const d = new Date(val * 1000);
    return `${d.toUTCString()} (${Math.round((d - Date.now()) / 60000) > 0
      ? `expires in ${Math.round((d - Date.now()) / 60000)} min`
      : `expired ${Math.round((Date.now() - d) / 60000)} min ago`})`;
  } catch { return String(val); }
}

module.exports = {
  name: 'jwt',
  aliases: ['jwtdecode', 'tokendecode'],
  category: 'developer',
  description: 'Decode & inspect a JWT token (signature NOT verified)',
  usage: '.jwt <token>',

  async execute(sock, msg, args, extra) {
    const token = (args[0] || '').trim();
    if (!token) return extra.reply(
      `🤦 Give me a JWT token!\nUsage: *.jwt <token>*`
    );

    const parts = token.split('.');
    if (parts.length !== 3) {
      return extra.reply(`❌ Invalid JWT — must have 3 parts (header.payload.signature) but got ${parts.length}`);
    }

    try {
      const header  = JSON.parse(b64url(parts[0]));
      const payload = JSON.parse(b64url(parts[1]));

      // Build readable output
      const alg  = header.alg  || '–';
      const typ  = header.typ  || '–';
      const kid  = header.kid  || null;
      const sub  = payload.sub || payload.user_id || payload.userId || null;
      const iss  = payload.iss || null;
      const aud  = payload.aud || null;
      const iat  = payload.iat ? fmtDate(payload.iat) : null;
      const exp  = payload.exp ? fmtDate(payload.exp) : null;
      const jti  = payload.jti || null;

      // Extra claims (non-standard)
      const STD  = new Set(['sub','iss','aud','iat','exp','nbf','jti']);
      const extra_claims = Object.entries(payload).filter(([k]) => !STD.has(k));

      let t = `┏❐ 《 *🪙 ${sc('jwt decoder')}* 》 ❐\n`;
      t += `┃  ⚠️ _Signature NOT verified_\n┃\n`;
      t += `┣◆ 🔑 *Algorithm*: \`${alg}\`\n`;
      t += `┣◆ 📄 *Type*: \`${typ}\`\n`;
      if (kid) t += `┣◆ 🔑 *Key ID (kid)*: \`${kid}\`\n`;
      t += `┃\n`;
      if (sub) t += `┣◆ 👤 *Subject (sub)*: \`${sub}\`\n`;
      if (iss) t += `┣◆ 🏢 *Issuer (iss)*: \`${iss}\`\n`;
      if (aud) t += `┣◆ 🎯 *Audience (aud)*: \`${Array.isArray(aud) ? aud.join(', ') : aud}\`\n`;
      if (iat) t += `┣◆ 🕐 *Issued at*: \`${iat}\`\n`;
      if (exp) t += `┣◆ ⏰ *Expires*: \`${exp}\`\n`;
      if (jti) t += `┣◆ 🆔 *JWT ID*: \`${jti}\`\n`;

      if (extra_claims.length > 0) {
        t += `┃\n┣◆ 📦 *Custom claims*:\n`;
        extra_claims.slice(0, 10).forEach(([k, v]) => {
          const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
          t += `┃    \`${k}\`: ${val.slice(0, 80)}\n`;
        });
      }

      t += `┃\n`;
      t += `┣◆ 📋 *Raw Payload*:\n`;
      const rawPayload = JSON.stringify(payload, null, 2);
      t += `\`\`\`\n${rawPayload.slice(0, 1500)}\n\`\`\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Failed to decode JWT: \`${e.message}\`\nMake sure it's a valid token.`);
    }
  },
};
