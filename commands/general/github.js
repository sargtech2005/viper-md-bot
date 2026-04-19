/**
 * .github — VIPER BOT MD repo info
 */
const config = require('../../config');
const { sc }  = require('../../utils/categoryMenu');
const https   = require('https');

module.exports = {
  name: 'github',
  aliases: ['repo', 'source'],
  category: 'general',
  description: 'Show VIPER BOT MD GitHub repos',
  usage: '.github',

  async execute(sock, msg, args, extra) {
    try {
      const repos = [
        { owner: 'remzytech001', repo: 'viperbotmd' },
        { owner: 'sargtech1',   repo: 'viperbotmd'  },
      ];

      let t = `🐙 *${sc('viper bot md')} — ${sc('github')}*\n\n`;

      for (const { owner, repo } of repos) {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        try {
          const data = await new Promise((res, rej) => {
            https.get(apiUrl, {
              headers: { 'User-Agent': 'ViperBotMD/2.7' },
            }, r => {
              let body = '';
              r.on('data', d => body += d);
              r.on('end', () => {
                try { res(JSON.parse(body)); } catch { rej(new Error('parse error')); }
              });
            }).on('error', rej);
          });
          t += `┣◆ 📦 *${data.full_name || `${owner}/${repo}`}*\n`;
          t += `┣◆ ⭐ Stars: ${data.stargazers_count ?? '–'}\n`;
          t += `┣◆ 🍴 Forks: ${data.forks_count ?? '–'}\n`;
          t += `┣◆ 🔗 ${data.html_url || `https://github.com/${owner}/${repo}`}\n`;
          t += `┃\n`;
        } catch {
          t += `┣◆ 🔗 https://github.com/${owner}/${repo}\n┃\n`;
        }
      }

      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
