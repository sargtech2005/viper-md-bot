/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  metaai.js — AI Autoreply Engine  (VIPER BOT)                ║
 * ║                                                               ║
 * ║  Providers (in order, all free):                             ║
 * ║   1. Groq → Llama 3.3 70B      (needs free GROQ_API_KEY)    ║
 * ║   2. Pollinations → GPT-4o      (no key)                     ║
 * ║   3. DeepSeek R1                (no key, best for code)      ║
 * ║   4. DeepSeek V3                (no key, fast)               ║
 * ║   5. Mistral Large              (no key)                     ║
 * ║   6. Qwen 72B                   (no key, multilingual)       ║
 * ║   7. o3-mini reasoning          (no key)                     ║
 * ║   8. Pollinations GET fallback  (no key)                     ║
 * ║   9. Shizo                      (no key, last resort)        ║
 * ║                                                               ║
 * ║  Features:                                                    ║
 * ║   • PostgreSQL history (survives restarts)                   ║
 * ║   • 20-message memory per chat, namespaced per session       ║
 * ║   • WhatsApp correct code sandbox (``` no lang tag)          ║
 * ║   • Auto-sends code as ZIP document alongside text           ║
 * ║   • Auto-continuation when response is truncated             ║
 * ║   • Markdown normalizer (**bold** → *bold*)                  ║
 * ║   • Coding rate-limit: 10 req/hr per user                    ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

'use strict';

const axios = require('axios');
const zlib  = require('zlib');
const path  = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const MAX_HISTORY      = 20;    // messages kept in memory + DB (per chat)
const MAX_TOKENS       = 16384; // max tokens per AI response
const CHUNK_SIZE       = 15000; // chars before splitting a WA message
const CODE_RATE_LIMIT  = 10;    // coding requests per hour per user
const CODE_RATE_WINDOW = 3600 * 1000;
const DB_WRITE_DELAY   = 3000;  // ms — batch DB writes to avoid hammering Postgres

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY — RAM cache + PostgreSQL persistence
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// HISTORY STORE — RAM cache backed by PostgreSQL (or JSON file in dev mode)
//
// All chats stored under ONE key 'ai_history' as { chatId: [messages] }
// so we only need ONE Postgres row per session — clean and efficient.
//
// Write strategy:
//   • In-memory map is updated immediately (sync speed for read path)
//   • DB writes are batched — a single flush 3s after the last change
//     so rapid back-and-forth doesn't hammer Postgres
// ─────────────────────────────────────────────────────────────────────────────
const historyCache = new Map();   // scopedChatId → [{ role, content }]
let   historyStore = null;        // full { chatId: messages[] } loaded from DB
let   historyDirty = false;
let   dbFlushTimer = null;

async function ensureHistoryLoaded() {
  if (historyStore !== null) return;
  try {
    const db = require('../../database');
    const raw = await db.readAsync('ai_history');
    historyStore = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    // Warm RAM cache from DB
    for (const [id, msgs] of Object.entries(historyStore)) {
      if (Array.isArray(msgs)) historyCache.set(id, msgs);
    }
    console.log(`[MetaAI/DB] Loaded history for ${Object.keys(historyStore).length} chats`);
  } catch (e) {
    console.error('[MetaAI/DB] Failed to load history:', e.message);
    historyStore = {};
  }
}

function scheduleDbFlush() {
  if (dbFlushTimer) return;
  dbFlushTimer = setTimeout(async () => {
    dbFlushTimer = null;
    if (!historyDirty || !historyStore) return;
    historyDirty = false;
    try {
      const db = require('../../database');
      await db.writeAsync('ai_history', historyStore);
    } catch (e) {
      console.error('[MetaAI/DB] Flush error:', e.message);
    }
  }, DB_WRITE_DELAY);
}

async function getHistory(chatId) {
  await ensureHistoryLoaded();
  return historyCache.get(chatId) || [];
}

async function pushHistory(chatId, role, content) {
  await ensureHistoryLoaded();
  const hist = historyCache.get(chatId) || [];
  hist.push({ role, content });
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  historyCache.set(chatId, hist);
  historyStore[chatId] = hist;  // keep in-memory store in sync
  historyDirty = true;
  scheduleDbFlush();
}

async function clearHistory(chatId) {
  await ensureHistoryLoaded();
  historyCache.set(chatId, []);
  if (historyStore) delete historyStore[chatId];
  historyDirty = true;
  scheduleDbFlush();
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
// LANGUAGE MAPS
// ─────────────────────────────────────────────────────────────────────────────
const LANG_EMOJI = {
  python:'🐍', javascript:'🌐', js:'🌐', typescript:'🔷', ts:'🔷',
  php:'🐘', java:'☕', 'c++':'⚡', cpp:'⚡', 'c#':'💎', csharp:'💎',
  rust:'🦀', go:'🐹', ruby:'💎', swift:'🍎', kotlin:'🟣',
  bash:'🖥️', sh:'🖥️', shell:'🖥️', sql:'🗄️', html:'🌍', css:'🎨',
  json:'📋', xml:'📄', yaml:'📝', yml:'📝', dockerfile:'🐳',
  react:'⚛️', vue:'💚', scss:'🎨', default:'📦',
};

const LANG_EXT = {
  python:'py', javascript:'js', js:'js', typescript:'ts', ts:'ts',
  php:'php', java:'java', 'c++':'cpp', cpp:'cpp', 'c#':'cs', csharp:'cs',
  rust:'rs', go:'go', ruby:'rb', swift:'swift', kotlin:'kt',
  bash:'sh', sh:'sh', shell:'sh', sql:'sql', html:'html', css:'css',
  json:'json', xml:'xml', yaml:'yaml', yml:'yml', dockerfile:'Dockerfile',
  react:'jsx', vue:'vue', scss:'scss', default:'txt',
};

function getLangEmoji(lang) { return LANG_EMOJI[(lang||'').toLowerCase()] || LANG_EMOJI.default; }
function getLangExt(lang)   { return LANG_EXT[(lang||'').toLowerCase()]   || LANG_EXT.default;   }

// ─────────────────────────────────────────────────────────────────────────────
// PURE-JS ZIP CREATOR (no external deps — uses built-in zlib)
// ─────────────────────────────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipBuffer(files) {
  // files: [{ name: string, content: Buffer|string }]
  const localParts    = [];
  const centralParts  = [];
  let   offset        = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf-8');
    const raw       = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf-8');
    const deflated  = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = deflated.length < raw.length;
    const compData  = useDeflate ? deflated : raw;
    const method    = useDeflate ? 8 : 0;
    const crc       = crc32(raw);

    // Local file header (30 bytes + name)
    const lh = Buffer.alloc(30 + nameBytes.length);
    lh.writeUInt32LE(0x04034B50, 0);         // signature
    lh.writeUInt16LE(20,         4);          // version needed
    lh.writeUInt16LE(0x0800,     6);          // UTF-8 flag
    lh.writeUInt16LE(method,     8);          // compression
    lh.writeUInt16LE(0,          10);         // mod time
    lh.writeUInt16LE(0,          12);         // mod date
    lh.writeUInt32LE(crc,        14);         // crc32
    lh.writeUInt32LE(compData.length, 18);    // compressed size
    lh.writeUInt32LE(raw.length, 22);         // uncompressed size
    lh.writeUInt16LE(nameBytes.length, 26);   // name length
    lh.writeUInt16LE(0,          28);         // extra length
    nameBytes.copy(lh, 30);

    // Central directory entry (46 bytes + name)
    const ce = Buffer.alloc(46 + nameBytes.length);
    ce.writeUInt32LE(0x02014B50, 0);          // signature
    ce.writeUInt16LE(20,         4);           // version made by
    ce.writeUInt16LE(20,         6);           // version needed
    ce.writeUInt16LE(0x0800,     8);           // UTF-8 flag
    ce.writeUInt16LE(method,     10);          // compression
    ce.writeUInt16LE(0,          12);          // mod time
    ce.writeUInt16LE(0,          14);          // mod date
    ce.writeUInt32LE(crc,        16);          // crc32
    ce.writeUInt32LE(compData.length, 20);     // compressed size
    ce.writeUInt32LE(raw.length, 24);          // uncompressed size
    ce.writeUInt16LE(nameBytes.length, 28);    // name length
    ce.writeUInt16LE(0,          30);          // extra length
    ce.writeUInt16LE(0,          32);          // comment length
    ce.writeUInt16LE(0,          34);          // disk start
    ce.writeUInt16LE(0,          36);          // internal attr
    ce.writeUInt32LE(0,          38);          // external attr
    ce.writeUInt32LE(offset,     42);          // local header offset
    nameBytes.copy(ce, 46);

    const localEntry = Buffer.concat([lh, compData]);
    localParts.push(localEntry);
    centralParts.push(ce);
    offset += localEntry.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054B50,      0);   // signature
  eocd.writeUInt16LE(0,               4);   // disk number
  eocd.writeUInt16LE(0,               6);   // start disk
  eocd.writeUInt16LE(files.length,    8);   // entries on disk
  eocd.writeUInt16LE(files.length,   10);   // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // central dir size
  eocd.writeUInt32LE(offset,         16);   // central dir offset
  eocd.writeUInt16LE(0,              20);   // comment length

  return Buffer.concat([...localParts, centralDir, eocd]);
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN NORMALIZER — AI markdown → WhatsApp formatting
// ─────────────────────────────────────────────────────────────────────────────
function normalizeMarkdown(text) {
  if (!text) return text;

  // Protect code blocks — extract them first so formatting rules
  // never touch content inside ``` fences.
  const savedBlocks = [];
  const MARKER = 'BLOCK';
  let safe = text.replace(/```[\s\S]*?```/g, (match) => {
    savedBlocks.push(match);
    return MARKER + (savedBlocks.length - 1) + '';
  });

  // Apply WA formatting only to non-code portions
  safe = safe
    .replace(/\*\*([^*
]+?)\*\*/g, '*$1*')       // **bold** → *bold*
    .replace(/__([^_
]+?)__/g, '_$1_')             // __italic__ → _italic_
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')           // # Heading → *Heading*
    .replace(/^[ 	]*[-*]\s+/gm, '• ')              // - item / * item → • item
    // Markdown tables → simple readable text (WA doesn't render tables)
    .replace(/\|(.+)\|/g, (row) => {
      if (/^\|[\s\-:|]+\|$/.test(row.trim())) return ''; // skip |---|---| separator
      return row.split('|').map(s => s.trim()).filter(Boolean).join('  •  ');
    })
    .replace(/
{3,}/g, '

');                    // max 2 blank lines

  // Restore saved code blocks
  safe = safe.replace(/BLOCK(\d+)/g,
    (_, i) => savedBlocks[parseInt(i)] || '');

  return safe;
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY FIXER — prevent AI from leaking provider name
// ─────────────────────────────────────────────────────────────────────────────
function fixIdentity(text, botName) {
  if (!text) return text;
  text = normalizeMarkdown(text);
  return text
    .replace(/(?:I(?:'m| am)(?: called)?|[Mm]y name is)\s+(?:ChatGPT|GPT-?\d*|Gemini|Claude|Kaitlyn|LLaMA|Llama\s*\d*|an?\s+AI\s+(?:assistant|language\s+model))/gi,
             `My name is ${botName}`)
    .replace(/\bChatGPT\b/g, botName)
    .replace(/\bGPT-4\b|\bGPT-3\.5\b/g, botName)
    .replace(/\bKaitlyn\b/gi, botName);
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE BLOCK EXTRACTOR
// Returns: { textOnly: string, codeBlocks: [{lang, code, index}] }
// ─────────────────────────────────────────────────────────────────────────────
function extractCodeBlocks(rawText) {
  const codeBlocks = [];
  const codeBlockRgx = /```[ \t]*(\w*)[ \t]*\r?\n([\s\S]*?)```/g;
  let   lastIndex    = 0;
  let   match;
  const textParts    = [];
  let   codeIndex    = 1;

  while ((match = codeBlockRgx.exec(rawText)) !== null) {
    textParts.push(rawText.slice(lastIndex, match.index).trim());
    const lang = match[1] || 'code';
    codeBlocks.push({ lang, code: match[2].trim(), index: codeIndex++ });
    lastIndex = match.index + match[0].length;
  }

  // Handle unclosed code block (AI cut off before closing ```)
  const tail = rawText.slice(lastIndex).trim();
  if (tail) {
    const openFenceIdx = tail.search(/```[ \t]*\w*[ \t]*\r?\n/);
    if (openFenceIdx !== -1) {
      const textBefore = tail.slice(0, openFenceIdx).trim();
      if (textBefore) textParts.push(textBefore);
      const fenceMatch = tail.slice(openFenceIdx).match(/```[ \t]*(\w*)[ \t]*\r?\n([\s\S]+)$/);
      if (fenceMatch) {
        codeBlocks.push({ lang: fenceMatch[1] || 'code', code: fenceMatch[2].trim(), index: codeIndex++, truncated: true });
      }
    } else {
      textParts.push(tail);
    }
  }

  return { textParts, codeBlocks };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE CHUNKER — split text and produce sandbox-formatted code chunks
// WhatsApp monospace: ```text``` (no language tag on the fence)
// ─────────────────────────────────────────────────────────────────────────────
function splitText(text, chunks) {
  if (!text.trim()) return;
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
          } else { current = current ? current + '\n' + line : line; }
        }
      } else { current = para; }
    } else { current = candidate; }
  }
  if (current.trim()) chunks.push(current.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// parseIntoChunks — returns array of typed message objects:
//   { type: 'text', content }
//   { type: 'code', header, code, truncated? }
//
// WHY TYPED OBJECTS:
//  WhatsApp ONLY renders the grey code box when ``` is the ENTIRE message.
//  If text is mixed with code in the same message, it shows as plain text.
//  sendChunks() sends header + code as TWO SEPARATE messages for correct rendering.
// ─────────────────────────────────────────────────────────────────────────────
function parseIntoChunks(rawText) {
  const items        = [];  // {type:'text'|'code', ...}
  const codeBlockRgx = /```[ \t]*(\w*)[ \t]*\r?\n([\s\S]*?)```/g;
  let   lastIndex    = 0;
  let   match;

  while ((match = codeBlockRgx.exec(rawText)) !== null) {
    // Text before this code block
    const before = rawText.slice(lastIndex, match.index).trim();
    if (before) {
      const textChunks = [];
      splitText(before, textChunks);
      textChunks.forEach(t => items.push({ type: 'text', content: t }));
    }

    const lang   = match[1] || 'code';
    const code   = match[2].trim();
    const emoji  = getLangEmoji(lang);
    const header = `${emoji} *${lang.toUpperCase()}*`;

    // Big code → split into parts (each is still its own code item)
    if (code.length > CHUNK_SIZE) {
      const lines = code.split('\n');
      let buffer = '', part = 1;
      for (const line of lines) {
        if ((buffer + '\n' + line).length > CHUNK_SIZE - 80) {
          items.push({ type: 'code', header: `${header} _(part ${part})_`, code: buffer.trim() });
          buffer = ''; part++;
        }
        buffer += (buffer ? '\n' : '') + line;
      }
      if (buffer.trim()) items.push({ type: 'code', header: `${header} _(part ${part})_`, code: buffer.trim() });
    } else {
      items.push({ type: 'code', header, code });
    }

    lastIndex = match.index + match[0].length;
  }

  // Tail — text or unclosed fence
  const tail = rawText.slice(lastIndex).trim();
  if (tail) {
    const openFenceIdx = tail.search(/```[ \t]*\w*[ \t]*\r?\n/);
    if (openFenceIdx !== -1) {
      const textBefore = tail.slice(0, openFenceIdx).trim();
      if (textBefore) {
        const tc = [];
        splitText(textBefore, tc);
        tc.forEach(t => items.push({ type: 'text', content: t }));
      }
      const fenceMatch = tail.slice(openFenceIdx).match(/```[ \t]*(\w*)[ \t]*\r?\n([\s\S]+)$/);
      if (fenceMatch) {
        const lang = fenceMatch[1] || 'code', code = fenceMatch[2].trim();
        items.push({ type: 'code', header: `${getLangEmoji(lang)} *${lang.toUpperCase()}* _[continues...]_`, code, truncated: true });
      }
    } else {
      const tc = [];
      splitText(tail, tc);
      tc.forEach(t => items.push({ type: 'text', content: t }));
    }
  }

  return items.filter(i => i.content || i.code);
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP BUILDER — extract all code blocks → zip buffer + summary text
// ─────────────────────────────────────────────────────────────────────────────
function buildCodeZip(rawText, botName) {
  const { codeBlocks } = extractCodeBlocks(rawText);
  if (codeBlocks.length === 0) return null;

  // Smart filenames: give sequential names per language
  const langCount = {};
  const files = codeBlocks.map(({ lang, code }) => {
    const ext   = getLangExt(lang);
    const base  = lang === 'code' || !lang ? 'code' : lang;
    langCount[base] = (langCount[base] || 0) + 1;
    const count = langCount[base];
    const name  = count === 1 && Object.keys(langCount).filter(k => k===base).length <= 1
      ? `${base}.${ext}`
      : `${base}_${count}.${ext}`;
    return { name, content: code };
  });

  // Add a README.txt
  const fileList = files.map(f => `  • ${f.name}`).join('\n');
  files.unshift({
    name: 'README.txt',
    content: `Code files from ${botName}\nGenerated: ${new Date().toISOString()}\n\nFiles:\n${fileList}\n`,
  });

  const zipBuf  = createZipBuffer(files);
  const caption = `📦 *Code files* (${codeBlocks.length} file${codeBlocks.length > 1 ? 's' : ''})\n` +
                  files.filter(f => f.name !== 'README.txt').map(f => `  • ${f.name}`).join('\n') +
                  `\n\n> _Powered by ${botName}_`;

  return { zipBuf, caption, fileCount: codeBlocks.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(botName) {
  return `You are ${botName}, an advanced AI assistant on WhatsApp — similar to Claude or Lovable AI.

IDENTITY:
- Your name is ONLY "${botName}". Always refer to yourself as ${botName}.
- If asked your name: "I am ${botName}".
- NEVER say you are ChatGPT, GPT, Gemini, Kaitlyn, Claude, Meta AI, Llama, or any other name.
- If asked who built you: "${botName} was created by your owner / Viper Tech."

RESPONSE QUALITY:
- Give thorough, complete answers — NEVER truncate or cut off.
- For code: ALWAYS write the FULL, complete, runnable code. No "..." or skipping.
- Be as detailed as a senior developer/engineer when needed.
- For casual chat: be friendly and conversational.
- Match the user's language (English, Pidgin, Yoruba, Hausa, Igbo, etc.).

FORMATTING FOR WHATSAPP:
- Use *bold* for emphasis — SINGLE asterisk ONLY: *word* — NEVER use **word** (double asterisks break WhatsApp).
- Use _italic_ for titles — single underscore: _word_ — NEVER __word__.
- Use numbered lists (1. 2. 3.) for steps.
- Use • for bullet points.
- Wrap ALL code in fences: \`\`\`python ... \`\`\`
- Keep paragraphs short — WhatsApp reads better in small blocks.

CODE RULES:
- Always write complete, working code — no skipping.
- Add inline comments on complex parts.
- Warn about security issues when relevant (eval(), SQL injection, etc.).
- Suggest best practices and improvements.
- Include a usage example after each code block.

MEMORY:
- You remember the last ${MAX_HISTORY} messages in this conversation.
- Reference earlier context naturally when relevant.

CAPABILITIES: Full-stack dev, system design, debugging, algorithms, APIs, databases,
cloud, DevOps, math, logic, research, writing, Nigerian tech knowledge.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────────────────────────
async function tryGroqMeta(chatId, userText, botName) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  await pushHistory(chatId, 'user', userText);
  const r = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'llama-3.3-70b-versatile',
      messages:    [{ role: 'system', content: buildSystemPrompt(botName) }, ...await getHistory(chatId)],
      temperature: 0.75,
      max_tokens:  MAX_TOKENS,
      stream:      false,
    },
    { timeout: 40000, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` } }
  );
  const reply = r.data?.choices?.[0]?.message?.content;
  if (!reply?.trim()) throw new Error('Empty Groq response');
  await pushHistory(chatId, 'assistant', reply.trim());
  return reply.trim();
}

// Generic Pollinations POST — supports any model name
async function tryPollinationsModel(chatId, userText, botName, model) {
  await pushHistory(chatId, 'user', userText);
  const r = await axios.post(
    'https://text.pollinations.ai/openai',
    {
      model,
      messages:   [{ role: 'system', content: buildSystemPrompt(botName) }, ...await getHistory(chatId)],
      max_tokens: MAX_TOKENS,
      seed:       42,
    },
    { timeout: 60000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
  );
  const text = r.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Empty response from ${model}`);
  await pushHistory(chatId, 'assistant', text);
  return text;
}

// Pollinations GET (plain text endpoint — last Pollinations fallback)
async function tryPollinationsGet(chatId, userText, botName) {
  const hist   = (await getHistory(chatId)).slice(-6);
  const ctx    = hist.map(m => `${m.role === 'user' ? 'User' : botName}: ${m.content}`).join('\n');
  const prompt = `${buildSystemPrompt(botName)}\n\n${ctx ? ctx + '\n' : ''}User: ${userText}\n${botName}:`;
  const r = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-large&seed=42`,
    { timeout: 35000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const text = typeof r.data === 'string' ? r.data.trim() : '';
  if (!text) throw new Error('Empty Pollinations GET response');
  await pushHistory(chatId, 'user', userText);
  await pushHistory(chatId, 'assistant', text);
  return text;
}

// Shizo (dead last — unreliable, ignores system prompt, leaks training data)
async function tryShizo(chatId, userText, botName) {
  const hist   = (await getHistory(chatId)).slice(-4);
  const ctx    = hist.map(m => `${m.role === 'user' ? 'User' : botName}: ${m.content}`).join('\n');
  const prompt = ctx ? `${ctx}\nUser: ${userText}\n${botName}:` : userText;
  const r = await axios.get(
    `https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(prompt)}`,
    { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const ans = r.data?.msg || r.data?.response || r.data?.data?.msg;
  if (!ans || typeof ans !== 'string' || ans.trim().length < 2) throw new Error('Empty Shizo response');
  await pushHistory(chatId, 'user', userText);
  await pushHistory(chatId, 'assistant', ans.trim());
  return ans.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ASK — returns array of WA message chunks + optional zip data
// ─────────────────────────────────────────────────────────────────────────────
async function askMetaAI(chatId, userText, botName, sessionId) {
  // Namespace chatId by session so multi-session bots don't share history
  const sid  = sessionId || 'default';
  const scid = `${sid}:${chatId}`;

  const providers = [
    { name: 'Groq/Llama-3.3',    fn: () => tryGroqMeta(scid, userText, botName) },
    { name: 'Pollinations/GPT4o', fn: () => tryPollinationsModel(scid, userText, botName, 'openai') },
    { name: 'DeepSeek-R1',        fn: () => tryPollinationsModel(scid, userText, botName, 'deepseek-r1') },
    { name: 'DeepSeek-V3',        fn: () => tryPollinationsModel(scid, userText, botName, 'deepseek') },
    { name: 'Mistral-Large',      fn: () => tryPollinationsModel(scid, userText, botName, 'mistral-large') },
    { name: 'Qwen-72B',           fn: () => tryPollinationsModel(scid, userText, botName, 'qwen') },
    { name: 'o3-mini',            fn: () => tryPollinationsModel(scid, userText, botName, 'openai-reasoning') },
    { name: 'Pollinations-GET',   fn: () => tryPollinationsGet(scid, userText, botName) },
    { name: 'Shizo',              fn: () => tryShizo(scid, userText, botName) },
  ];

  // Quality check — Shizo leaks raw training data
  function isGarbageResponse(text) {
    if (!text || text.length < 3) return true;
    const firstLine = (text.split('\n')[0] || '');
    if (firstLine.length > 80 && !firstLine.includes(' ')) return true;
    return false;
  }

  let rawReply = null;
  let usedProvider = '';
  for (const { name, fn } of providers) {
    try {
      const candidate = await fn();
      if (isGarbageResponse(candidate)) {
        console.log(`[${botName}/AI] ${name} → garbage, trying next`);
        continue;
      }
      rawReply = candidate;
      usedProvider = name;
      console.log(`[${botName}/AI] ${name} → ${rawReply.length} chars`);
      break;
    } catch (e) {
      console.log(`[${botName}/AI] ${name} failed: ${e.message}`);
    }
  }

  if (!rawReply) throw new Error('All AI providers unavailable');

  // Auto-continuation: if response ends mid-code (odd number of ``` fences or ends with =, (, etc.)
  const isTruncated = (t) => {
    const trimmed = t.trimEnd();
    const fences  = (trimmed.match(/```/g) || []).length;
    if (fences % 2 !== 0) return true;
    if (/[=(,{[\s]$/.test(trimmed)) return true;
    return false;
  };

  if (isTruncated(rawReply)) {
    console.log(`[${botName}/AI] Truncated response — fetching continuation`);
    const contProviders = [
      { name: 'Groq-cont', fn: () => tryGroqMeta(scid, 'Please continue from exactly where you left off. Do not repeat anything already written, just continue the code/text from where it stopped.', botName) },
      { name: 'Poll-cont', fn: () => tryPollinationsModel(scid, 'Please continue from exactly where you left off. Do not repeat anything.', botName, 'openai') },
    ];
    for (const { name, fn } of contProviders) {
      try {
        const cont = await fn();
        if (cont && cont.length > 10 && !isGarbageResponse(cont)) {
          rawReply = rawReply + '\n' + cont;
          console.log(`[${botName}/AI] ${name} continuation added (${cont.length} chars)`);
          break;
        }
      } catch (e) { console.log(`[${botName}/AI] ${name} cont failed: ${e.message}`); }
    }
  }

  const cleanReply = fixIdentity(rawReply, botName);
  const chunks     = parseIntoChunks(cleanReply);

  // Build ZIP if there are code blocks
  const zipData = buildCodeZip(cleanReply, botName);

  return { chunks, zipData, provider: usedProvider };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND HELPER — sends all text chunks then the ZIP if present
// ─────────────────────────────────────────────────────────────────────────────
async function sendChunks(sock, from, result, quotedMsg) {
  const { chunks, zipData } = typeof result === 'object' && result.chunks
    ? result
    : { chunks: Array.isArray(result) ? result : [], zipData: null };

  const qOpts = quotedMsg ? { quoted: quotedMsg } : {};
  let   first = true;

  for (const item of chunks) {
    try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}
    if (!first) await new Promise(r => setTimeout(r, 650));
    first = false;

    if (item.type === 'code') {
      // ── WhatsApp grey code box ─────────────────────────────────────────────
      // Format confirmed working in WhatsApp 2024+:
      //   Line 1: emoji + language label (plain text — NOT bold/italic)
      //   Line 2: ``` (opening fence — must be on its own line)
      //   Lines 3–N: code content
      //   Last line: ``` (closing fence — must be on its own line)
      //
      // The header must NOT use *bold* markers — text before the ``` fence
      // in the SAME message is allowed and WhatsApp still renders the grey box.
      // Using *bold* in the header line can confuse the WA renderer on some clients.
      const langLabel = item.header.replace(/\*/g, '');  // strip * bold markers from header
      const codeMsg   = langLabel + '\n```\n' + item.code + '\n```';
      await sock.sendMessage(from, {
        text: codeMsg,
        // Suppress link preview — prevents WA from treating ``` as a URL in some edge cases
        contextInfo: { externalAdReply: undefined },
      }, qOpts);
    } else {
      // Regular text chunk
      await sock.sendMessage(from, { text: item.content }, qOpts);
    }
  }

  // ZIP as document (always send after all text/code)
  if (zipData) {
    try {
      await new Promise(r => setTimeout(r, 500));
      await sock.sendMessage(from, {
        document: zipData.zipBuf,
        fileName: `code_${Date.now()}.zip`,
        mimetype: 'application/zip',
        caption:  zipData.caption,
      }, qOpts);
    } catch (e) {
      console.error('[MetaAI] ZIP send failed:', e.message);
    }
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

  // Exposed for handler.js
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
        `Usage: ${extra.prefix||'.'}metaai <question>\n\n` +
        `*Examples:*\n` +
        `• ${extra.prefix||'.'}metaai explain async/await in JS\n` +
        `• ${extra.prefix||'.'}metaai code a REST API with Express\n` +
        `• ${extra.prefix||'.'}metaai what is recursion\n` +
        `• ${extra.prefix||'.'}metaai clear  ← reset my chat memory\n\n` +
        `_Coding limit: ${CODE_RATE_LIMIT} requests/hr_`
      );
    }

    if (text.toLowerCase() === 'clear') {
      const sid   = (sock.user?.id || '').split(':')[0].split('@')[0];
      await clearHistory(`${sid}:${chatId}`);
      return extra.reply('🧹 Conversation memory cleared.');
    }

    const database = require('../../database');
    const config   = require('../../config');
    const botName  = database.getSetting('botName', config.botName) || 'Viper Bot';
    const userId   = (extra.sender || msg.key?.participant || '').split('@')[0];
    const sid      = (sock.user?.id || '').split(':')[0].split('@')[0];

    if (isCodingRequest(text)) {
      const rl = checkCodeRateLimit(userId);
      if (!rl.allowed)
        return extra.reply(`⏱️ *Coding limit reached*\n\nTry again in ~${rl.waitMins} min(s).\n_Normal chat is unlimited._`);
    }

    await sock.sendMessage(from, { react: { text: '🤔', key: msg.key } });
    try { await sock.sendPresenceUpdate('composing', from); } catch (_) {}

    try {
      const result = await askMetaAI(chatId, text, botName, sid);
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sendChunks(sock, from, result, msg);
    } catch (e) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      if (e.response?.status === 429) return extra.reply('⏱️ AI is rate-limited. Try again shortly.');
      await extra.reply(`❌ AI error: ${e.message}`);
    }
  },
};
