/**
 * ᴍᴇɴᴜ ᴄᴏᴍᴍᴀɴᴅ — VIPER BOT MD
 */
const config  = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs   = require('fs');
const path = require('path');

const sc = s => {
  const m = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',
             k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',
             u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
  return s.toLowerCase().split('').map(c => m[c]||c).join('');
};

const CAT = {
  general:   { icon:'🌐', hint:'.general'   },
  admin:     { icon:'⚙️', hint:'.admin'     },
  owner:     { icon:'👑', hint:'.owner'     },
  media:     { icon:'🎬', hint:'.media'     },
  fun:       { icon:'🎭', hint:'.fun'       },
  ai:        { icon:'🤖', hint:'.ai'        },
  utility:   { icon:'🔧', hint:'.utility'   },
  textmaker: { icon:'🖋️', hint:'.textmaker' },
  developer: { icon:'💻', hint:'.developer' },
};

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'start'],
  category: 'general',
  description: 'Show all command categories',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const cmds  = loadCommands();
      const cats  = {};
      cmds.forEach((cmd, name) => {
        if (cmd.name === name) {
          if (!cats[cmd.category]) cats[cmd.category] = [];
          cats[cmd.category].push(cmd);
        }
      });

      const total  = [...cmds.keys()].filter(k => cmds.get(k).name === k).length;
      const user   = extra.sender.split('@')[0];
      const owner  = Array.isArray(config.ownerName) ? config.ownerName.join(' & ') : config.ownerName;
      const now    = new Date().toLocaleString('en-NG',{ timeZone: config.timezone });

      let t = '';
      t += `┏❐ 《 *${sc('viper bot md')} v${config.botVersion}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 👤 ${sc('user')}: @${user}\n`;
      t += `┣◆ 🕐 ${sc('time')}: ${now}\n`;
      t += `┣◆ ⚡ ${sc('prefix')}: ${config.prefix}\n`;
      t += `┣◆ 📦 ${sc('commands')}: ${total}\n`;
      t += `┣◆ 👑 ${sc('owner')}: ${owner}\n`;
      t += `┃\n`;
      t += `┣◆ *📂 ${sc('categories')}* — ᴛʏᴘᴇ ᴛᴏ ᴏᴘᴇɴ:\n`;
      t += `┃\n`;

      for (const [key, meta] of Object.entries(CAT)) {
        const count = cats[key]?.length || 0;
        if (count > 0) {
          t += `┣◆ ${meta.icon} *${meta.hint}*  ‹ ${count} ᴄᴍᴅꜱ ›\n`;
        }
      }

      t += `┃\n`;
      t += `┣◆ 💡 ${sc('example')}: *${config.prefix}admin* → see admin cmds\n`;
      t += `┣◆ 🐍 ${sc('mode')}: *${config.selfMode ? 'ᴘʀɪᴠᴀᴛᴇ' : 'ᴘᴜʙʟɪᴄ'}*\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      // ── Robust image path: try multiple locations ──────────────────────────
      const imgCandidates = [
        path.join(__dirname, '../../utils/bot_image.jpg'),
        path.join(__dirname, '../utils/bot_image.jpg'),
        path.resolve(process.cwd(), 'utils/bot_image.jpg'),
      ];
      const imgPath = imgCandidates.find(p => fs.existsSync(p)) || null;

      const ctx = {
        mentions: [extra.sender],
        contextInfo: {
          forwardingScore: 1, isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: config.newsletterJid,
            newsletterName: config.botName,
            serverMessageId: -1,
          },
        },
      };

      if (imgPath) {
        await sock.sendMessage(extra.from, { image: fs.readFileSync(imgPath), caption: t, ...ctx }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, { text: t, ...ctx }, { quoted: msg });
      }
    } catch (err) { await extra.reply(`❌ ${err.message}`); }
  },
};
