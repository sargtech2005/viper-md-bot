/**
 * AI Chat Command — ChatGPT-style responses
 * Primary: Shizo API  |  Fallback: Google Gemini
 *
 * NAME: 'chat'  (NOT 'ai' — the nav shortcut in general/ai.js owns that key)
 * ALIASES include 'ai', 'gpt', 'chatgpt', 'ask' for user convenience.
 * The general/ai.js nav shortcut was renamed to 'aimenu' so there is
 * no more collision.
 */

const axios  = require('axios');
const config = require('../../config');

// ── Primary: Shizo free API ──────────────────────────────────────────────────
async function tryShizo(question) {
  const r = await axios.get(
    `https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(question)}`,
    { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const ans = r.data?.msg || r.data?.response || r.data?.data?.msg;
  if (!ans || typeof ans !== 'string' || ans.trim().length < 2)
    throw new Error('Empty Shizo response');
  return ans.trim();
}

// ── Fallback: Gemini 2.0 Flash ───────────────────────────────────────────────
async function tryGemini(question) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const r = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      contents: [{ parts: [{ text: question }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
    },
    { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
  );

  const reply = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Empty Gemini response');
  return reply.trim();
}

// ── Fallback 2: Pollinations text ────────────────────────────────────────────
async function tryPollinations(question) {
  const r = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(question)}`,
    { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const text = typeof r.data === 'string' ? r.data.trim() : '';
  if (!text || text.length < 2) throw new Error('Empty Pollinations response');
  return text;
}

module.exports = {
  name: 'chat',
  aliases: ['ai', 'gpt', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (multi-provider with fallback)',
  usage: '.ai <question>',

  async execute(sock, msg, args, extra) {
    if (args.length === 0) {
      return extra.reply(
        '🤖 *AI Chat*\n\n' +
        `Usage: ${extra.prefix || '.'}ai <question>\n\n` +
        'Examples:\n' +
        `• ${extra.prefix || '.'}ai What is quantum physics?\n` +
        `• ${extra.prefix || '.'}gpt Write me a poem about Lagos\n` +
        `• ${extra.prefix || '.'}ask How does the internet work?`
      );
    }

    const question = args.join(' ').trim();
    const from = extra.from;

    // Typing indicator
    sock.sendPresenceUpdate('composing', from).catch(() => {}); // fire-and-forget
    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });

    const providers = [
      { name: 'Shizo',        fn: () => tryShizo(question) },
      { name: 'Gemini',       fn: () => tryGemini(question) },
      { name: 'Pollinations', fn: () => tryPollinations(question) },
    ];

    let answer = null;
    let usedProvider = '';

    for (const { name, fn } of providers) {
      try {
        answer = await fn();
        usedProvider = name;
        break;
      } catch (e) {
        console.log(`[AI] ${name} failed: ${e.message}`);
      }
    }

    sock.sendPresenceUpdate('paused', from).catch(() => {}); // fire-and-forget

    if (!answer) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return extra.reply('❌ All AI providers are currently unavailable. Please try again shortly.');
    }

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

    // Format response — wrap in WhatsApp grey code box (Meta AI 2026 style)
    // Plain text goes as-is; if the answer contains code blocks, send them boxed.
    const hasCode = /```/.test(answer);
    if (hasCode) {
      // Normalise: strip language tags from fences so WA renders grey boxes
      const normalised = answer.replace(/```[a-zA-Z0-9_+-]*\n/g, '```\n');
      await extra.reply(`🤖 *AI Response*\n\n${normalised}\n\n_via ${usedProvider}_`);
    } else {
      // Wrap entire plain response in a grey box for the Meta-AI look
      await extra.reply(`🤖 *AI Response*\n\n\`\`\`\n${answer}\n\`\`\`\n\n_via ${usedProvider}_`);
    }
  },
};
