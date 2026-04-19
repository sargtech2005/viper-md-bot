/**
 * .ssl <domain>  (VIPER BOT MD)
 * SSL/TLS certificate details — no external API needed.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const tls    = require('tls');

function getCert(host, port = 443) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = sock.getPeerCertificate(true);
      sock.end();
      resolve(cert);
    });
    sock.setTimeout(8000);
    sock.on('timeout', () => { sock.destroy(); reject(new Error('Timed out')); });
    sock.on('error',   (e) => reject(e));
  });
}

function fmtDate(d) {
  if (!d) return '–';
  const date = new Date(d);
  const diff = Math.round((date - Date.now()) / 86400000);
  const label = diff > 0 ? `expires in ${diff}d` : `⚠️ expired ${Math.abs(diff)}d ago`;
  return `${date.toDateString()} (${label})`;
}

module.exports = {
  name: 'ssl',
  aliases: ['cert', 'tlscheck', 'sslinfo'],
  category: 'developer',
  description: 'SSL/TLS certificate details & expiry',
  usage: '.ssl <domain>',

  async execute(sock, msg, args, extra) {
    let host = (args[0] || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!host) return extra.reply(
      `🤦 Give me a domain!\nUsage: *.ssl <domain>*\nExample: *.ssl google.com*`
    );

    await extra.reply(`🔒 Checking SSL cert for *${host}*...`);

    try {
      const cert    = await getCert(host);
      if (!cert || !Object.keys(cert).length) {
        return extra.reply(`😅 No certificate found for *${host}*. It might not support HTTPS.`);
      }

      const subject = cert.subject || {};
      const issuer  = cert.issuer  || {};
      const valid   = cert.valid_from;
      const expiry  = cert.valid_to;
      const san     = cert.subjectaltname || '–';
      const serial  = cert.serialNumber   || '–';
      const bits    = cert.bits           || '–';
      const fingerprint = cert.fingerprint256 || cert.fingerprint || '–';

      // Days until expiry
      const expDate = new Date(expiry);
      const daysLeft = Math.round((expDate - Date.now()) / 86400000);
      const expiryEmoji = daysLeft > 30 ? '🟢' : daysLeft > 7 ? '🟡' : '🔴';

      let t = `┏❐ 《 *🔒 ${sc('ssl certificate')} — ${host}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🏷️ *Common Name*: \`${subject.CN || '–'}\`\n`;
      t += `┣◆ 🏢 *Organisation*: \`${subject.O || '–'}\`\n`;
      t += `┣◆ 🌍 *Country*: \`${subject.C || '–'}\`\n`;
      t += `┃\n`;
      t += `┣◆ 🏛️ *Issued by*: \`${issuer.O || issuer.CN || '–'}\`\n`;
      t += `┣◆ 📅 *Valid from*: \`${fmtDate(valid)}\`\n`;
      t += `┣◆ ${expiryEmoji} *Expires*: \`${fmtDate(expiry)}\`\n`;
      t += `┣◆ ⏳ *Days left*: \`${daysLeft > 0 ? daysLeft : '⚠️ EXPIRED'}\`\n`;
      t += `┃\n`;
      t += `┣◆ 🔢 *Key bits*: \`${bits}\`\n`;
      t += `┣◆ 🔑 *Serial*: \`${serial.slice(0, 30)}\`\n`;
      t += `┣◆ 🌐 *SANs*: \`${san.slice(0, 200)}\`\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`💀 SSL check failed for *${host}*: \`${e.message}\``);
    }
  },
};
