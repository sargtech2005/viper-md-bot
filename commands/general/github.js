/**
 * .github — bot repo info
 */
const config = require('../../config');
const { sc }  = require('../../utils/categoryMenu');
const https   = require('https');

module.exports = {
  name: 'github',
  aliases: ['repo', 'source'],
  category: 'general',
  description: 'Show bot GitHub repo info',
  usage: '.github',

  async execute(sock, msg, args, extra) {
    try {
      const repoUrl = process.env.GITHUB_REPO_URL || '';
      const botName = config.botName;

      if (!repoUrl) {
        return extra.reply(`🐙 *${sc(botName)} — GitHub*\n\nNo repository configured for this bot.`);
      }

      // Parse owner/repo from URL
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return extra.reply(`🔗 Repo: ${repoUrl}`);

      const [, owner, repo] = match;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

      let t = `🐙 *${sc(botName)} — ${sc('github')}*\n\n`;
      try {
        const data = await new Promise((res, rej) => {
          https.get(apiUrl, { headers: { 'User-Agent': 'BotMD/2.7' } }, r => {
            let body = '';
            r.on('data', d => body += d);
            r.on('end', () => { try { res(JSON.parse(body)); } catch { rej(new Error('parse error')); } });
          }).on('error', rej);
        });
        t += `┣◆ 📦 *${data.full_name || `${owner}/${repo}`}*\n`;
        t += `┣◆ ⭐ Stars: ${data.stargazers_count ?? '–'}\n`;
        t += `┣◆ 🍴 Forks: ${data.forks_count ?? '–'}\n`;
        t += `┣◆ 🔗 ${data.html_url || repoUrl}\n`;
      } catch {
        t += `┣◆ 🔗 ${repoUrl}\n`;
      }
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}* 🐍`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ Error: ${e.message}`); }
  },
};
