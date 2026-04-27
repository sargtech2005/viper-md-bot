/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  .metaai — Chat with Meta AI / Llama 3  (VIPER BOT) ║
 * ║                                                      ║
 * ║  Primary:   Groq API → Meta Llama 3.3 70B (free)    ║
 * ║  Fallback:  Shizo free API (no key needed)           ║
 * ║  Fallback2: Pollinations text (no key needed)        ║
 * ║                                                      ║
 * ║  Per-chat conversation memory (last 10 turns)        ║
 * ║  Set GROQ_API_KEY in .env for the Meta Llama model.  ║
 * ║  Without it, Shizo/Pollinations fallback kicks in.   ║
 * ╚══════════════════════════════════════════════════════╝
 */

const axios = require('axios');

const MAX_HISTORY = 10; // turns (1 user + 1 assistant per turn)

// ── Per-chat conversation memory ─────────────────────────────────────────────
const chatHistory = new Map();  // chatId → [{ role, content }]

function getHistory(chatId) {
  return chatHistory.get(chatId) || [];
}

function pushHistory(chatId, role, content) {
  const hist = getHistory(chatId);
  hist.push({ role, content });
  if (hist.length > MAX_HISTORY * 2) hist.splice(0, hist.length - MAX_HISTORY * 2);
  chatHistory.set(chatId, hist);
}

function clearHistory(chatId) {
  chatHistory.delete(chatId);
}

// ── Provider 1: Groq → Meta Llama 3.3 70B (free tier, ~14,400 req/day) ───────
async function tryGroqMeta(chatId, userText, botName) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const systemPrompt =
    `You are ${botName}, a helpful and friendly WhatsApp assistant powered by Meta AI. ` +
    `Keep replies short and conversational — this is WhatsApp, not an essay. ` +
    `Use plain text only, no markdown asterisks or hashes. ` +
    `If asked who made you, say you are ${botName} built by the owner using Meta AI (Llama).`;

  pushHistory(chatId, 'user', userText);

  const r = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...getHistory(chatId),
      ],
      temperature:  0.8,
      max_tokens:   1024,
      stream:       false,
    },
    {
      timeout: 25000,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
    }
  );

  const reply = r.data?.choices?.[0]?.message?.content;
  if (!reply || reply.trim().length < 2) throw new Error('Empty Groq response');

  pushHistory(chatId, 'assistant', reply.trim());
  return reply.trim();
}

// ── Provider 2: Shizo free API (no key needed) ────────────────────────────────
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

// ── Provider 3: Pollinations text (no key needed) ─────────────────────────────
async function tryPollinations(question) {
  const r = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(question)}`,
    { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const text = typeof r.data === 'string' ? r.data.trim() : '';
  if (!text || text.length < 2) throw new Error('Empty Pollinations response');
  return text;
}

// ── Main ask function — used by handler.js autoreply ──────────────────────────
async function askMetaAI(chatId, userText, botName) {
  const providers = [
    { name: 'Groq/Meta',    fn: () => tryGroqMeta(chatId, userText, botName) },
    { name: 'Shizo',        fn: () => tryShizo(userText) },
    { name: 'Pollinations', fn: () => tryPollinations(userText) },
  ];

  for (const { name, fn } of providers) {
    try {
      const reply = await fn();
      console.log(`[MetaAI] Answered via ${name}`);
      return reply;
    } catch (e) {
      console.log(`[MetaAI] ${name} failed: ${e.message}`);
    }
  }
  throw new Error('All Meta AI providers unavailable');
}

// ── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  name: 'metaai',
  aliases: ['meta', 'llama', 'metalama'],
  category: 'ai',
  description: 'Chat with Meta AI (Llama 3)',
  usage: '.metaai <question>',

  // Expose for handler autoreply
  askMetaAI,
  clearHistory,

  async execute(sock, msg, args, extra) {
    const text   = args.join(' ').trim();
    const from   = extra.from;
    const chatId = from;

    if (!text) {
      return extra.reply(
        `🤖 *Meta AI (Llama 3)*\n\n` +
        `Usage: ${extra.prefix || '.'}metaai <your question>\n\n` +
        `Examples:\n` +
        `• ${extra.prefix || '.'}metaai explain quantum physics\n` +
        `• ${extra.prefix || '.'}metaai write a poem about Lagos\n` +
        `• ${extra.prefix || '.'}metaai clear  ← reset conversation memory`
      );
    }

    if (text.toLowerCase() === 'clear') {
      clearHistory(chatId);
      return extra.reply('🧹 Meta AI conversation memory cleared for this chat.');
    }

    const database = require('../../database');
    const config   = require('../../config');
    const botName  = database.getSetting('botName', config.botName) || 'Viper Bot';

    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
    try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}

    try {
      const reply = await askMetaAI(chatId, text, botName);
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await extra.reply(reply);
    } catch (e) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      console.error('[MetaAI] Error:', e.message);
      if (e.response?.status === 429) {
        return extra.reply('⏱️ Meta AI is rate-limited right now. Please wait a minute and try again.');
      }
      await extra.reply(`❌ Meta AI error: ${e.message}`);
    }
  },
};
