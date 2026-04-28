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

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY FIXER  — strip any provider name leaks from response
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN NORMALIZER — convert AI markdown to WhatsApp formatting
// WhatsApp: *bold*, _italic_, ~strike~, ```mono```
// AI returns: **bold**, __italic__, # Heading, etc.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeMarkdown(text) {
  if (!text) return text;
  return text
    // **bold** → *bold* (must do before single-asterisk rules)
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
    // __italic__ → _italic_
    .replace(/__([^_\n]+?)__/g, '_$1_')
    // ### Heading / ## Heading / # Heading → *Heading*
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // - item or * item bullet → • item (WhatsApp style)
    .replace(/^[\-\*]\s+/gm, '• ')
    // Extra blank lines (3+ → 2)
    .replace(/\n{3,}/g, '\n\n');
}

function fixIdentity(text, botName) {
  if (!text) return text;
  text = normalizeMarkdown(text);
  return text
    // "I'm called ChatGPT" / "I am ChatGPT" / "My name is GPT-4" etc.
    .replace(/(?:I(?:'m| am)(?: called)?|[Mm]y name is)\s+(?:ChatGPT|GPT-?\d*|Gemini|Claude|Kaitlyn|LLaMA|Llama\s*\d*|an?\s+AI\s+(?:assistant|language\s+model))/gi,
             `My name is ${botName}`)
    // Standalone "ChatGPT" → botName (but not inside URLs or code)
    .replace(/\bChatGPT\b/g, botName)
    .replace(/\bGPT-4\b|\bGPT-3\.5\b|\bGPT\b(?!\s*[=:(])/g, botName)
    .replace(/\bKaitlyn\b/gi, botName);
}

function parseIntoChunks(rawText) {
  const chunks       = [];
  // Handles: ```python, ``` python, ```\ncode, and plain ``` without language tag
  const codeBlockRgx = /```[ \t]*(\w*)[ \t]*\r?\n([\s\S]*?)```/g;
  let lastIndex      = 0;
  let match;

  while ((match = codeBlockRgx.exec(rawText)) !== null) {
    const before = rawText.slice(lastIndex, match.index).trim();
    if (before) splitText(before, chunks);

    const lang   = match[1] || 'code';
    const code   = match[2].trim();
    const emoji  = getLangEmoji(lang);
    const header = `${emoji} *${lang.toUpperCase()}*`;
    // Include lang on the ``` fence so WhatsApp renders it as a proper code block
    // WhatsApp monospace = ```text``` — language tag in fence shows as literal text
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

  // Handle tail — may be: plain text, unclosed block at start, or text + unclosed block
  const tail = rawText.slice(lastIndex).trim();
  if (tail) {
    // Find the LAST opening ``` in tail that has no matching closing ```
    // This covers: "Sure! Here is the code:\n```python\ndef add..."
    const openFenceIdx = tail.search(/```[ \t]*\w*[ \t]*\r?\n/);
    if (openFenceIdx !== -1) {
      // Check if this fence is closed
      const afterFence = tail.slice(openFenceIdx);
      const closingIdx = afterFence.indexOf('\n```', 3); // look for \n``` after opening
      if (closingIdx === -1) {
        // Unclosed fence — text before it is normal, code after it is a sandbox
        const textBefore = tail.slice(0, openFenceIdx).trim();
        if (textBefore) splitText(textBefore, chunks);

        const fenceMatch = afterFence.match(/```[ \t]*(\w*)[ \t]*\r?\n([\s\S]+)$/);
        if (fenceMatch) {
          const lang   = fenceMatch[1] || 'code';
          const code   = fenceMatch[2].trim();
          const emoji  = getLangEmoji(lang);
          const header = `${emoji} *${lang.toUpperCase()}*`;
          chunks.push(`${header} _[continues...]_\n\`\`\`\n${code}\n\`\`\``);
        }
      } else {
        // Fence IS closed — this is a complete block the regex missed (edge case)
        splitText(tail, chunks);
      }
    } else {
      splitText(tail, chunks);
    }
  }

  return chunks.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA FREE MODELS — all via Pollinations (no API key needed)
// Useful models: deepseek-r1 (complex reasoning/coding), mistral-large, qwen-72b
// ─────────────────────────────────────────────────────────────────────────────

// Generic Pollinations POST builder — pass any supported model name
async function tryPollinationsModel(chatId, userText, botName, model) {
  pushHistory(chatId, 'user', userText);
  const r = await axios.post(
    'https://text.pollinations.ai/openai',
    {
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(botName) },
        ...getHistory(chatId),
      ],
      max_tokens: MAX_TOKENS,
      seed: 42,
    },
    {
      timeout: 60000, // reasoning models are slower
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    }
  );
  const text = r.data?.choices?.[0]?.message?.content?.trim();
  if (!text || text.length < 2) throw new Error(`Empty response from ${model}`);
  pushHistory(chatId, 'assistant', text);
  return text;
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
- Use *bold* for emphasis — SINGLE asterisk: *word* NOT **word** (double asterisks break WhatsApp).
- Use _italic_ for titles — single underscore ONLY: _word_ NOT __word__.
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
  // Use Pollinations OpenAI-compatible endpoint — supports system prompts + full history
  pushHistory(chatId, 'user', userText);
  const r = await axios.post(
    'https://text.pollinations.ai/openai',
    {
      model:      'openai',       // routes to GPT-4o-mini via Pollinations proxy
      messages:   [
        { role: 'system', content: buildSystemPrompt(botName) },
        ...getHistory(chatId),
      ],
      max_tokens: MAX_TOKENS,
      seed:       42,             // deterministic enough for consistent identity
    },
    {
      timeout: 35000,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    }
  );
  const text = r.data?.choices?.[0]?.message?.content?.trim();
  if (!text || text.length < 2) throw new Error('Empty Pollinations response');
  pushHistory(chatId, 'assistant', text);
  return text;
}

// ── Provider 3b: Pollinations GET (plain text fallback if POST fails) ─────────
async function tryPollinationsGet(chatId, userText, botName) {
  const hist   = getHistory(chatId).slice(-4);
  const ctx    = hist.map(m => `${m.role === 'user' ? 'User' : botName}: ${m.content}`).join('\n');
  const prompt = `${buildSystemPrompt(botName)}\n\n${ctx ? ctx + '\n' : ''}User: ${userText}\n${botName}:`;
  // model param forces a stronger model; jsonMode off for plain text
  const r = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-large&seed=42`,
    { timeout: 35000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const text = typeof r.data === 'string' ? r.data.trim() : '';
  if (!text || text.length < 2) throw new Error('Empty Pollinations GET response');
  pushHistory(chatId, 'user', userText);
  pushHistory(chatId, 'assistant', text);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ASK  — returns array of WA message chunks
// ─────────────────────────────────────────────────────────────────────────────
async function askMetaAI(chatId, userText, botName, sessionId) {
  // Namespace chatId by session so multi-session bots don't share history
  const scopedChatId = sessionId ? `${sessionId}:${chatId}` : chatId;
  const providers = [
    // ── Tier 1: Key-based (fastest, most reliable) ──────────────────────────
    { name: 'Groq/Llama-3.3',    fn: () => tryGroqMeta(scopedChatId, userText, botName) },
    // ── Tier 2: Pollinations free models (no key needed) ────────────────────
    { name: 'Pollinations/GPT4o', fn: () => tryPollinations(scopedChatId, userText, botName) },         // GPT-4o via Pollinations
    { name: 'DeepSeek-R1',        fn: () => tryPollinationsModel(scopedChatId, userText, botName, 'deepseek-r1') },  // Best for complex reasoning & code
    { name: 'DeepSeek-V3',        fn: () => tryPollinationsModel(scopedChatId, userText, botName, 'deepseek') },    // Fast, great at code
    { name: 'Mistral-Large',      fn: () => tryPollinationsModel(scopedChatId, userText, botName, 'mistral-large') }, // Strong general model
    { name: 'Qwen-72B',           fn: () => tryPollinationsModel(scopedChatId, userText, botName, 'qwen') },         // Good at multilingual + code
    { name: 'o3-mini',            fn: () => tryPollinationsModel(scopedChatId, userText, botName, 'openai-reasoning') }, // OpenAI reasoning model
    { name: 'Pollinations-GET',   fn: () => tryPollinationsGet(scopedChatId, userText, botName) },
    { name: 'Shizo',              fn: () => tryShizo(scopedChatId, userText, botName) }, // last resort — unreliable
  ];

  // Quality heuristic: Shizo leaks random training data as very short lines with no spaces
  function isGarbageResponse(text) {
    if (!text || text.length < 3) return true;
    // Detect Shizo data-leak pattern: long line, no spaces, looks like concatenated code
    const lines = text.split('\n');
    const firstLine = lines[0] || '';
    if (firstLine.length > 80 && !firstLine.includes(' ')) return true;
    // Detect truncated/incomplete responses (ends with assignment or open paren)
    const trimmed = text.trimEnd();
    if (/[=(,{[\s]$/.test(trimmed)) return true;
    return false;
  }

  let rawReply = null;
  for (const { name, fn } of providers) {
    try {
      const candidate = await fn();
      if (isGarbageResponse(candidate)) {
        console.log(`[${botName}/AI] ${name} → garbage response, trying next`);
        continue;
      }
      rawReply = candidate;
      console.log(`[${botName}/AI] ${name} → ${rawReply.length} chars`);
      break;
    } catch (e) {
      console.log(`[${botName}/AI] ${name} failed: ${e.message}`);
    }
  }

  if (!rawReply) throw new Error('All AI providers unavailable');

  // Auto-continuation: if response ends with an unclosed code block, fetch the rest
  const isTruncated = (text) => {
    const t = text.trimEnd();
    // Ends mid-code: open fence with no closing fence
    const fenceCount = (t.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) return true;
    // Ends mid-sentence/mid-expression (heuristic)
    if (/[=(,{\[\s]$/.test(t)) return true;
    return false;
  };

  if (isTruncated(rawReply)) {
    console.log(`[${botName}/AI] Response looks truncated — fetching continuation`);
    // Push the truncated reply into history then ask to continue
    // History was already updated by the provider, just ask for continuation
    const continuationProviders = [
      { name: 'Groq-cont',       fn: () => tryGroqMeta(scopedChatId, 'Please continue from exactly where you left off. Do not repeat anything, just continue the code/answer.', botName) },
      { name: 'Pollinations-cont', fn: () => tryPollinations(scopedChatId, 'Please continue from exactly where you left off. Do not repeat anything.', botName) },
    ];
    for (const { name, fn } of continuationProviders) {
      try {
        const cont = await fn();
        if (cont && cont.length > 10) {
          console.log(`[${botName}/AI] ${name} continuation → ${cont.length} chars`);
          rawReply = rawReply + '\n' + cont;
          break;
        }
      } catch (e) {
        console.log(`[${botName}/AI] ${name} continuation failed: ${e.message}`);
      }
    }
  }

  const cleanReply = fixIdentity(rawReply, botName);
  return parseIntoChunks(cleanReply);
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
      const _sid = (sock.user?.id || "").split(":")[0].split("@")[0];
      const chunks = await askMetaAI(chatId, text, botName, _sid);
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
