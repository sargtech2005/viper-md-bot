/**
 * .google — Web search via DuckDuckGo (free, no key)
 */
const axios = require('axios');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

module.exports = {
  name: 'google',
  aliases: ['search', 'web', 'find'],
  category: 'search',
  description: 'Search the web using Google/DuckDuckGo',
  usage: '.google <query>',

  async execute(sock, msg, args, extra) {
    try {
      const query = args.join(' ').trim();
      if (!query) return extra.reply(
        `🔍 *${sc('web search')}*\n\nUsage: \`.google <query>\`\nExample: \`.google best phones 2025\``
      );

      await sock.sendMessage(extra.from, { react: { text: '🔍', key: msg.key } });

      // DuckDuckGo Instant Answer API
      const { data } = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_redirect: 1, no_html: 1, skip_disambig: 1 },
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      // Also fetch DuckDuckGo HTML for organic results
      const html = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      }).then(r => r.data).catch(() => '');

      const results = [];

      // 1. Instant answer
      if (data.AbstractText) {
        results.push({ title: data.Heading || query, snippet: data.AbstractText.slice(0, 300), url: data.AbstractURL || '' });
      }
      if (data.Answer) {
        results.push({ title: '💡 Quick Answer', snippet: data.Answer, url: '' });
      }

      // 2. Related topics
      if (data.RelatedTopics?.length) {
        for (const t of data.RelatedTopics.slice(0, 3)) {
          if (t.Text && t.FirstURL) {
            results.push({ title: t.Text.split(' - ')[0] || t.Text.slice(0, 60), snippet: t.Text.slice(0, 200), url: t.FirstURL });
          }
        }
      }

      // 3. Parse organic results from HTML
      if (results.length < 5) {
        const titleRe = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g;
        const snippetRe = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
        const titles = [...html.matchAll(titleRe)];
        const snippets = [...html.matchAll(snippetRe)];

        for (let i = 0; i < Math.min(titles.length, 5); i++) {
          const url     = titles[i][1] || '';
          const title   = titles[i][2]?.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim() || '';
          const snippet = snippets[i]?.[1]?.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim() || '';
          if (title && !results.find(r => r.title === title)) {
            results.push({ title, snippet, url });
          }
        }
      }

      if (!results.length) {
        return extra.reply(`🔍 No results found for *${query}*\n\nTry a different search term.`);
      }

      let t = `┏❐ 《 *🔍 ${sc('search results')}* 》 ❐\n`;
      t += `┃ 🔎 *${query}*\n┃\n`;

      results.slice(0, 5).forEach((r, i) => {
        t += `┣◆ *${i + 1}. ${r.title.slice(0, 60)}*\n`;
        if (r.snippet) t += `┃  ${r.snippet.slice(0, 180)}\n`;
        if (r.url)     t += `┃  🔗 ${r.url.slice(0, 80)}\n`;
        t += '┃\n';
      });

      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Search failed: ${e.message}`);
    }
  }
};
