/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  .gemini — Chat with Google Gemini  (VIPER BOT MD)   ║
 * ║                                                      ║
 * ║  Keeps a short per-chat memory (last 10 turns) so    ║
 * ║  the conversation feels natural.                     ║
 * ║  Uses: GEMINI_API_KEY env var                        ║
 * ╚══════════════════════════════════════════════════════╝
 */

const axios = require('axios');

const GEMINI_KEY  = process.env.GEMINI_API_KEY || '';
const MODEL       = 'gemini-2.0-flash';
const API_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_HISTORY = 10; // turns (1 turn = 1 user + 1 model)

// ── Per-chat conversation memory: chatId → [{ role, parts }] ─────────────────
const chatHistory = new Map();

function getHistory(chatId) {
  return chatHistory.get(chatId) || [];
}

function pushHistory(chatId, role, text) {
  const hist = getHistory(chatId);
  hist.push({ role, parts: [{ text }] });
  // Keep only last MAX_HISTORY turns (2 messages per turn)
  if (hist.length > MAX_HISTORY * 2) hist.splice(0, hist.length - MAX_HISTORY * 2);
  chatHistory.set(chatId, hist);
}

function clearHistory(chatId) {
  chatHistory.delete(chatId);
}

async function askGemini(chatId, userText, botName) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY is not set in environment variables.');

  const systemPrompt =
    `You are ${botName}, a helpful and friendly WhatsApp assistant. ` +
    `Keep replies concise and conversational. Use plain text — no markdown symbols like ** or ##. ` +
    `If asked who made you, say you were built by the bot owner using Google Gemini AI.`;

  pushHistory(chatId, 'user', userText);

  const r = await axios.post(`${API_URL}?key=${GEMINI_KEY}`, {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: getHistory(chatId),
    generationConfig: {
      temperature:     0.85,
      maxOutputTokens: 1024,
      topP:            0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  }, {
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  const reply = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Gemini returned an empty response.');

  pushHistory(chatId, 'model', reply);
  return reply.trim();
}

// ── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  name: 'gemini',
  aliases: ['gem', 'google', 'ask2'],
  category: 'ai',
  description: 'Chat with Google Gemini AI',
  usage: '.gemini <question>',

  // Expose for handler autoreply use
  askGemini,
  clearHistory,

  async execute(sock, msg, args, extra) {
    const text   = args.join(' ').trim();
    const from   = extra.from;
    const chatId = from; // one memory per chat (DM or group)

    if (!text) {
      return extra.reply(
        `🤖 *Gemini AI*\n\n` +
        `Usage: ${extra.prefix || '.'}gemini <your question>\n\n` +
        `Examples:\n` +
        `• ${extra.prefix || '.'}gemini what is a black hole?\n` +
        `• ${extra.prefix || '.'}gemini write a short poem about Nigeria\n` +
        `• ${extra.prefix || '.'}gemini clear  ← reset conversation memory`
      );
    }

    // .gemini clear — wipe memory for this chat
    if (text.toLowerCase() === 'clear') {
      clearHistory(chatId);
      return extra.reply('🧹 Gemini conversation memory cleared for this chat.');
    }

    if (!GEMINI_KEY) {
      return extra.reply('❌ GEMINI_API_KEY is not configured.\n\nAsk the bot owner to set it in the environment variables.');
    }

    const database = require('../../database');
    const config   = require('../../config');
    const botName  = database.getSetting('botName', config.botName) || 'Viper Bot';

    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
    if (extra.autoTyping !== false) {
      try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}
    }

    try {
      const reply = await askGemini(chatId, text, botName);
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await extra.reply(reply);
    } catch (e) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      console.error('[Gemini] Error:', e.message);
      // 429 = rate limit (free tier is 15 req/min)
      if (e.response?.status === 429 || e.message?.includes('429')) {
        return extra.reply('⏱️ *Gemini is rate-limited right now.*\n\nThe free API allows 15 requests/min. Please wait 60 seconds and try again.');
      }
      if (e.response?.status === 503 || e.message?.includes('503')) {
        return extra.reply('🔧 Gemini is temporarily unavailable. Please try again in a moment.');
      }
      await extra.reply(`❌ Gemini error: ${e.message}`);
    }
  },
};
