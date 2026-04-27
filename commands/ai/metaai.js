/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  metaai.js — AI Autoreply Engine  (VIPER BOT)                ║
 * ║                                                               ║
 * ║  Primary:   Groq API → Meta Llama 3.3 70B (free)             ║
 * ║  Fallback:  Shizo free API (no key needed)                    ║
 * ║  Fallback2: Pollinations text (no key needed)                 ║
 * ║                                                               ║
 * ║  Features:                                                    ║
 * ║   • 20-message per-chat memory (RAM, ~3MB per 1000 chats)    ║
 * ║   • Splits long replies into multiple WA messages             ║
 * ║   • Code sent in WhatsApp sandbox blocks with language tag    ║
 * ║   • Coding rate-limit: 10 req/hr per user (separate bucket)  ║
 * ║   • Multi-session: uses owner-set botName per session         ║
 * ║   • Claude/Lovable-style detailed technical responses         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const MAX_HISTORY      = 20;
const MAX_TOKENS       = 16384; // Groq llama-3.3-70b supports up to 32k output tokens
const CHUNK_SIZE       = 15000; // ~4x the old 3800 — WhatsApp limit is 65k so this is safe
const CODE_RATE_LIMIT  = 10;
const CODE_RATE_WINDOW = 3600 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY
// ─────────────────────────────────────────────────────────────────────────────
const chatHistory = new Map();

function getHistory(chatId) {
  return chatHistory.get(chatId) || [];
}

function pushHistory(chatId, role, content) {
  const hist = getHistory(chatId);
  hist.push({ role, content });
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  chatHistory.set(chatId, hist);
}

function clearHistory(chatId) {
  chatHistory.delete(chatId);
}

// ─────────────────────────────────────────────────────────────────────────────
// CODING RATE LIMITER
// ─────────────────────────────────────────────────────────────────────────────
const codeRateMap = new Map();

function isCodingRequest(text) {
  const t = text.toLowerCase();
  return /(code|program|script|function|class|implement|write|create|build|make|fix|debug|refactor|optimize)\s.*(in\s)?(python|js|javascript|typescript|php|java|c\+\+|c#|rust|go|ruby|swift|kotlin|bash|sql|html|css|react|node|express|next|flutter)|```|(algorithm|api\s+endpoint|component|snippet|regex|schema|query)/.test(t);
}

function checkCodeRateLimit(userId) {
  const now   = Date.now();
  const times = (codeRateMap.get(userId) || []).filter(t => now - t < CODE_RATE_WINDOW);
  if (times.length >= CODE_RATE_LIMIT) {
    const waitMins = Math.ceil((CODE_RATE_WINDOW - (now - times[0])) / 60000);
    return { allowed: false, waitMins };
  }
  times.push(now);
  codeRateMap.set(userId, times);
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE SANDBOX FORMATTER
// ─────────────────────────────────────────────────────────────────────────────
const LANG_EMOJI = {
  python:'🐍',javascript:'🌐',js:'🌐',typescript:'🔷',ts:'🔷',
  php:'🐘',java:'☕','c++':'⚡',cpp:'⚡','c#':'💎',csharp:'💎',
  rust:'🦀',go:'🐹',ruby:'💎',swift:'🍎',kotlin:'🟣',
  bash:'🖥️',sh:'🖥️',shell:'🖥️',sql:'🗄️',html:'🌍',css:'🎨',
  json:'📋',xml:'📄',yaml:'📝',dockerfile:'🐳',default:'📦',
};

function getLangEmoji(lang) {
  return LANG_EMOJI[(lang||'').toLowerCase()] || LANG_EMOJI.default;
}

function splitText(text, chunks) {
  if (text.length <= CHUNK_SIZE) { chunks.push(text); return; }
  const paras = text.split('\n\n');
  let current = '';
  for (const para of paras) {
    const candidate = current ? current + '\n\n' + para : para;
    if (candidate.length > CHUNK_SIZE) {
      if (current) chunks.push(current.trim());
      if (para.length > CHUNK_SIZE) {
        const lines = para.split('\n');
        current = '';
        for (const line of lines) {
          if ((current + '\n' + line).length > CHUNK_SIZE) {
            if (current) chunks.push(current.trim());
            current = line;
          } else {
            current = current ? current + '\n' + line : line;
          }
        }
      } else {
        current = para;
      }
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
}

function parseIntoChunks(rawText) {
  const chunks       = [];
  const codeBlockRgx = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex      = 0;
  let match;

  while ((match = codeBlockRgx.exec(rawText)) !== null) {
    const before = rawText.slice(lastIndex, match.index).trim();
    if (before) splitText(before, chunks);

    const lang   = match[1] || 'code';
    const code   = match[2].trim();
    const emoji  = getLangEmoji(lang);
    const header = `${emoji} *${lang.toUpperCase()}*`;
    const box    = `${header}\n\`\`\`\n${code}\n\`\`\``;

    if (box.length > CHUNK_SIZE) {
      const lines = code.split('\n');
      let buffer = '', part = 1;
      for (const line of lines) {
        if ((buffer + '\n' + line).length > CHUNK_SIZE - 80) {
          chunks.push(`${header} _(part ${part})_\n\`\`\`\n${buffer.trim()}\n\`\`\``);
          buffer = ''; part++;
        }
        buffer += (buffer ? '\n' : '') + line;
      }
      if (buffer.trim()) chunks.push(`${header} _(part ${part})_\n\`\`\`\n${buffer.trim()}\n\`\`\``);
    } else {
      chunks.push(box);
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = rawText.slice(lastIndex).trim();
  if (tail) splitText(tail, chunks);

  return chunks.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT  (Claude / Lovable-style)
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(botName) {
  return `You are ${botName}, an advanced AI assistant on WhatsApp — similar to Claude or Lovable AI in capability and depth.

IDENTITY:
- Your name is ONLY "${botName}". Always refer to yourself as ${botName}.
- If asked who you are or what your name is, say: "I am ${botName}".
- NEVER call yourself ChatGPT, GPT, Gemini, Kaitlyn, Claude, Meta AI, Llama, or any other AI name.
- If asked who built you, say: "${botName} was created by your owner / Viper Tech."

RESPONSE QUALITY:
- Give thorough, complete answers — never cut off or truncate.
- For code: ALWAYS write the FULL, complete, runnable code. Never use "..." or skip sections.
- For technical questions: be as detailed as needed, like a senior developer/engineer.
- For casual chat: be friendly and conversational.
- Match the user's language (English, Nigerian Pidgin, Yoruba, Hausa, Igbo, etc.).

FORMATTING FOR WHATSAPP:
- Use *bold* for headers and important terms.
- Use numbered lists for steps.
- Use bullet points (•) for options.
- Wrap ALL code in markdown fences with language: \`\`\`python ... \`\`\`
- Keep paragraphs short — WhatsApp reads better in small blocks.

CODE RULES:
- Always write complete, working code — no skipping.
- Add inline comments on complex lines.
- Warn about security issues when relevant (e.g., eval(), SQL injection).
- Suggest best practices and improvements.
- Include usage examples after code.

MEMORY:
- You remember the last ${MAX_HISTORY} messages in this conversation.
- Reference previous context naturally when relevant.

CAPABILITIES (use all of them):
- Full-stack software development
- System design and architecture  
- Debugging, code review, optimization
- Data structures and algorithms
- APIs, databases, cloud, DevOps
- Math, logic, research, writing
- Nigerian tech scene knowledge`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────────────────────────
async function tryGroqMeta(chatId, userText, botName) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  pushHistory(chatId, 'user', userText);

  const r = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'llama-3.3-70b-versatile',
      messages:    [
        { role: 'system', content: buildSystemPrompt(botName) },
        ...getHistory(chatId),
      ],
      temperature: 0.75,
      max_tokens:  MAX_TOKENS,
      stream:      false,
    },
    {
      timeout: 40000,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    }
  );

  const reply = r.data?.choices?.[0]?.message?.content;
  if (!reply || reply.trim().length < 2) throw new Error('Empty Groq response');
  pushHistory(chatId, 'assistant', reply.trim());
  return reply.trim();
}

async function tryShizo(chatId, userText, botName) {
  const hist   = getHistory(chatId).slice(-6);
  const ctx    = hist.map(m => `${m.role === 'user' ? 'User' : botName}: ${m.content}`).join('\n');
  const prompt = ctx ? `${ctx}\nUser: ${userText}\n${botName}:` : userText;

  const r = await axios.get(
    `https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(prompt)}`,
    { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const ans = r.data?.msg || r.data?.response || r.data?.data?.msg;
  if (!ans || typeof ans !== 'string' || ans.trim().length < 2)
    throw new Error('Empty Shizo response');
  pushHistory(chatId, 'user', userText);
  pushHistory(chatId, 'assistant', ans.trim());
  return ans.trim();
}

async function tryPollinations(chatId, userText, botName) {
  const prompt = `${buildSystemPrompt(botName)}\n\nUser: ${userText}\n${botName}:`;
  const r = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
    { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const text = typeof r.data === 'string' ? r.data.trim() : '';
  if (!text || text.length < 2) throw new Error('Empty Pollinations response');
  pushHistory(chatId, 'user', userText);
  pushHistory(chatId, 'assistant', text);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ASK  — returns array of WA message chunks
// ─────────────────────────────────────────────────────────────────────────────
async function askMetaAI(chatId, userText, botName) {
  const providers = [
    { name: 'Groq/Llama',   fn: () => tryGroqMeta(chatId, userText, botName) },
    { name: 'Shizo',        fn: () => tryShizo(chatId, userText, botName) },
    { name: 'Pollinations', fn: () => tryPollinations(chatId, userText, botName) },
  ];

  let rawReply = null;
  for (const { name, fn } of providers) {
    try {
      rawReply = await fn();
      console.log(`[${botName}/AI] ${name} → ${rawReply.length} chars`);
      break;
    } catch (e) {
      console.log(`[${botName}/AI] ${name} failed: ${e.message}`);
    }
  }

  if (!rawReply) throw new Error('All AI providers unavailable');
  return parseIntoChunks(rawReply);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function sendChunks(sock, from, chunks, quotedMsg) {
  for (let i = 0; i < chunks.length; i++) {
    try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}
    if (i > 0) await new Promise(r => setTimeout(r, 700));
    await sock.sendMessage(from, { text: chunks[i] }, quotedMsg ? { quoted: quotedMsg } : {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  name:        'metaai',
  aliases:     ['meta', 'llama', 'ai2'],
  category:    'ai',
  description: 'Chat with the bot AI (Llama 3 / Groq)',
  usage:       '.metaai <question>',

  askMetaAI,
  sendChunks,
  clearHistory,
  isCodingRequest,
  checkCodeRateLimit,

  async execute(sock, msg, args, extra) {
    const text   = args.join(' ').trim();
    const from   = extra.from;
    const chatId = from;

    if (!text || text.toLowerCase() === 'help') {
      return extra.reply(
        `🤖 *AI Assistant*\n\n` +
        `Usage: ${extra.prefix || '.'}metaai <question>\n\n` +
        `*Examples:*\n` +
        `• ${extra.prefix || '.'}metaai explain async/await in JS\n` +
        `• ${extra.prefix || '.'}metaai code a REST API with Express\n` +
        `• ${extra.prefix || '.'}metaai what is recursion\n` +
        `• ${extra.prefix || '.'}metaai clear  ← reset chat memory\n\n` +
        `_Coding limit: ${CODE_RATE_LIMIT} requests/hr_`
      );
    }

    if (text.toLowerCase() === 'clear') {
      clearHistory(chatId);
      return extra.reply('🧹 Conversation memory cleared.');
    }

    const database = require('../../database');
    const config   = require('../../config');
    const botName  = database.getSetting('botName', config.botName) || 'Viper Bot';
    const userId   = (extra.sender || msg.key?.participant || '').split('@')[0];

    if (isCodingRequest(text)) {
      const rl = checkCodeRateLimit(userId);
      if (!rl.allowed) {
        return extra.reply(
          `⏱️ *Coding limit reached*\n\n` +
          `You've used ${CODE_RATE_LIMIT} coding requests this hour.\n` +
          `Try again in ~${rl.waitMins} min(s).\n\n` +
          `_Normal chat is unlimited._`
        );
      }
    }

    await sock.sendMessage(from, { react: { text: '🤔', key: msg.key } });
    try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}

    try {
      const chunks = await askMetaAI(chatId, text, botName);
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sendChunks(sock, from, chunks, msg);
    } catch (e) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      if (e.response?.status === 429)
        return extra.reply('⏱️ AI is rate-limited. Please wait a minute.');
      await extra.reply(`❌ AI error: ${e.message}`);
    }
  },
};
