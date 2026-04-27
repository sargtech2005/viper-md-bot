/**
 * 🔤 WCG — Word Chain Game — VIPER BOT MD
 *
 * Rules:
 *   • Bot says a word.
 *   • You reply with a word that STARTS with the LAST LETTER of the bot's word.
 *   • Words cannot be reused.
 *   • You have 30 seconds per turn.
 *   • Game ends when you run out of time, repeat a word, or use an invalid word.
 *
 * Commands:
 *   .wcg          — start a game
 *   .wcg quit     — end current game
 *   .wcg score    — check your all-time score
 *   .wcg top      — group leaderboard
 *
 * Validation: Datamuse API (free, no key needed) — checks if word exists in English.
 * Bot replies: also Datamuse — finds a real word starting with required letter.
 */

const axios    = require('axios');
const database = require('../../database');
const config   = require('../../config');

// ── Active games: key = "groupId:userId" ────────────────────────────────────
const GAMES     = new Map();
const TURN_MS   = 30_000;  // 30 seconds per turn

// ── Starter words (bot always opens with one of these) ────────────────────────
const STARTERS = [
  'snake','tiger','eagle','flame','stone','cloud','ocean','blade','crown',
  'forest','river','magic','night','storm','prize','quest','royal','power',
  'viper','nexus','cyber','ghost','spark','angel','swift','brave','sharp',
];

// ── Datamuse helpers ──────────────────────────────────────────────────────────
async function isValidWord(word) {
  try {
    const r = await axios.get(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=1`,
      { timeout: 6000 }
    );
    return r.data?.some(w => w.word.toLowerCase() === word.toLowerCase());
  } catch { return true; } // on API failure, allow the word
}

async function getBotWord(startLetter) {
  try {
    // Get words that start with required letter, prefer common words (high score)
    const r = await axios.get(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(startLetter)}*&md=f&max=200`,
      { timeout: 8000 }
    );
    const words = (r.data || [])
      .filter(w => w.word.length >= 3 && w.word.length <= 10 && /^[a-z]+$/i.test(w.word))
      .map(w => w.word.toLowerCase());

    if (!words.length) return null;
    // Pick a random word from top 50 (common words)
    const pool = words.slice(0, 50);
    return pool[Math.floor(Math.random() * pool.length)];
  } catch { return null; }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function getWcgStats(userId) {
  const u = database.getUser(userId) || {};
  return {
    best:  u.wcgBest  || 0,
    total: u.wcgTotal || 0,
    games: u.wcgGames || 0,
  };
}

function saveWcgRound(userId, score) {
  const s = getWcgStats(userId);
  database.updateUser(userId, {
    wcgBest:  Math.max(s.best, score),
    wcgTotal: s.total + score,
    wcgGames: s.games + 1,
  });
}

// ── Kill a game (timeout or quit) ────────────────────────────────────────────
function endGame(gameKey) {
  const g = GAMES.get(gameKey);
  if (!g) return;
  if (g.timer) clearTimeout(g.timer);
  GAMES.delete(gameKey);
  return g;
}

// ── Reset the 30s turn timer ──────────────────────────────────────────────────
function resetTimer(gameKey, sock, from) {
  const g = GAMES.get(gameKey);
  if (!g) return;
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(async () => {
    const game = endGame(gameKey);
    if (!game) return;
    saveWcgRound(game.userId, game.score);
    await sock.sendMessage(from, {
      text:
        `⏰ *Time's up!*\n\n` +
        `⚡ The word was: *${game.lastWord}*\n` +
        `📊 Your score: *${game.score} words*\n` +
        `🏆 Best: *${Math.max(getWcgStats(game.userId).best, game.score)} words*\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`,
    });
  }, TURN_MS);
}

// ── Command ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'wcg',
  aliases: ['wordchain', 'wordgame', 'wordchallenge'],
  category: 'fun',
  description: '🔤 Word Chain Game — chain words by last letter, beat your score!',
  usage: '.wcg | .wcg quit | .wcg score | .wcg top',

  // Expose so handler.js can route free-text replies back into the game
  GAMES,

  async execute(sock, msg, args, extra) {
    const B      = database.getSetting('botName', config.botName);
    const userId = extra.sender.split('@')[0];
    const from   = extra.from;
    const gameKey = `${from}:${userId}`;
    const sub    = (args[0] || '').toLowerCase();

    // ── SCORE ───────────────────────────────────────────────────────────────
    if (sub === 'score' || sub === 'stats') {
      const s = getWcgStats(userId);
      return extra.reply(
        `┏❐ 《 *🔤 WCG STATS* 》 ❐\n┃\n` +
        `┣◆ 👤 *${extra.pushName || userId}*\n` +
        `┣◆ 🏆 Best streak: *${s.best} words*\n` +
        `┣◆ 📊 Total words: *${s.total}*\n` +
        `┣◆ 🎮 Games played: *${s.games}*\n` +
        `┃\n┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
      );
    }

    // ── LEADERBOARD ─────────────────────────────────────────────────────────
    if (sub === 'top' || sub === 'leaderboard') {
      const fs   = require('fs'), path = require('path');
      let all = {};
      try { all = JSON.parse(fs.readFileSync(path.join(database.DB_PATH, 'users.json'), 'utf8')); } catch {}
      const entries = Object.entries(all)
        .map(([id, u]) => ({ id, best: u.wcgBest || 0, name: u.displayName || id }))
        .filter(e => e.best > 0)
        .sort((a, b) => b.best - a.best)
        .slice(0, 10);

      if (!entries.length) return extra.reply(`🔤 No WCG scores yet!\nPlay *.wcg* to start!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      const medals = ['🥇','🥈','🥉'];
      let t = `┏❐ 《 *🔤 WCG LEADERBOARD* 》 ❐\n┃\n`;
      entries.forEach(({ name, best }, i) => {
        t += `┣◆ ${medals[i] || `${i+1}.`} *${name}* — *${best} words*\n`;
      });
      t += `┃\n┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
      return extra.reply(t);
    }

    // ── QUIT ────────────────────────────────────────────────────────────────
    if (sub === 'quit' || sub === 'stop' || sub === 'end') {
      const g = endGame(gameKey);
      if (!g) return extra.reply(`❌ No active WCG game.\nType *.wcg* to start one!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      saveWcgRound(g.userId, g.score);
      return extra.reply(
        `🔤 *Game Ended!*\n\n📊 Score: *${g.score} words*\n🏆 Best: *${Math.max(getWcgStats(userId).best, g.score)} words*\n\n_Type .wcg to play again!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
      );
    }

    // ── START ────────────────────────────────────────────────────────────────
    if (GAMES.has(gameKey)) {
      return extra.reply(`🔤 You already have an active game!\nJust type your next word.\n_Type *.wcg quit* to end it._\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
    }

    const startWord = STARTERS[Math.floor(Math.random() * STARTERS.length)];
    const nextLetter = startWord.slice(-1).toUpperCase();

    GAMES.set(gameKey, {
      userId,
      lastWord: startWord,
      used: new Set([startWord]),
      score: 0,
      timer: null,
    });

    resetTimer(gameKey, sock, from);

    return extra.reply(
      `┏❐ 《 *🔤 WORD CHAIN GAME* 》 ❐\n┃\n` +
      `┣◆ I start with: *${startWord.toUpperCase()}*\n` +
      `┣◆ Your word must start with: *${nextLetter}*\n┃\n` +
      `┣◆ 📌 Rules:\n` +
      `┃   • Start with letter *${nextLetter}*\n` +
      `┃   • No repeating words\n` +
      `┃   • Must be a real English word\n` +
      `┃   • 30 seconds per turn\n` +
      `┃   • Just type your word (no prefix)\n┃\n` +
      `┣◆ ⏰ You have *30 seconds!*\n` +
      `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
    );
  },

  // ── Called by handler.js when a free-text message matches an active game ──
  async handleReply(sock, msg, extra) {
    const userId  = extra.sender.split('@')[0];
    const from    = extra.from;
    const gameKey = `${from}:${userId}`;
    const B       = database.getSetting('botName', config.botName);

    const g = GAMES.get(gameKey);
    if (!g) return false; // not in a game

    // Extract raw text from all message types
    const rawText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      extra.body || '';

    const word = rawText.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!word || word.length < 2) return false; // ignore empty or command-like input
    // Don't intercept commands (prefix check)
    const prefix = database.getSetting('prefix', config.prefix) || '.';
    if (rawText.trim().startsWith(prefix)) return false;

    const requiredLetter = g.lastWord.slice(-1);

    // ── Wrong starting letter ─────────────────────────────────────────────
    if (word[0] !== requiredLetter) {
      return await sock.sendMessage(from, {
        text: `❌ *Wrong letter!*\nYour word must start with *${requiredLetter.toUpperCase()}*\n⏰ You still have time!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,
      }, { quoted: msg });
    }

    // ── Already used ──────────────────────────────────────────────────────
    if (g.used.has(word)) {
      endGame(gameKey);
      saveWcgRound(userId, g.score);
      return await sock.sendMessage(from, {
        text:
          `🚫 *"${word.toUpperCase()}"* was already used!\n\n` +
          `📊 Game over! Score: *${g.score} words*\n` +
          `🏆 Best: *${Math.max(getWcgStats(userId).best, g.score)} words*\n\n` +
          `_Type .wcg to play again!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,
      }, { quoted: msg });
    }

    // ── Validate word via Datamuse ────────────────────────────────────────
    const valid = await isValidWord(word);
    if (!valid) {
      return await sock.sendMessage(from, {
        text: `❓ *"${word.toUpperCase()}"* is not a valid English word!\n⏰ Try another word starting with *${requiredLetter.toUpperCase()}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,
      }, { quoted: msg });
    }

    // ── Valid word — get bot's reply ──────────────────────────────────────
    g.used.add(word);
    g.score++;
    const botStartLetter = word.slice(-1);
    let botWord = null;

    // Try up to 3 times to find a bot word not already used
    for (let i = 0; i < 3; i++) {
      const candidate = await getBotWord(botStartLetter);
      if (candidate && !g.used.has(candidate)) { botWord = candidate; break; }
    }

    // ── Bot has no word — player wins! ────────────────────────────────────
    if (!botWord) {
      endGame(gameKey);
      saveWcgRound(userId, g.score);
      return await sock.sendMessage(from, {
        text:
          `🎉 *YOU WIN!* I couldn't find a word starting with *${botStartLetter.toUpperCase()}*!\n\n` +
          `📊 Final Score: *${g.score} words*\n` +
          `🏆 Best: *${Math.max(getWcgStats(userId).best, g.score)} words*\n\n` +
          `_Type .wcg to play again!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,
      }, { quoted: msg });
    }

    // ── Continue game ─────────────────────────────────────────────────────
    g.used.add(botWord);
    g.lastWord = botWord;
    resetTimer(gameKey, sock, from);

    const nextLetter = botWord.slice(-1).toUpperCase();
    return await sock.sendMessage(from, {
      text:
        `✅ *${word.toUpperCase()}* — good!\n\n` +
        `🤖 My word: *${botWord.toUpperCase()}*\n` +
        `📝 Your turn — start with: *${nextLetter}*\n` +
        `📊 Score so far: *${g.score} words* | ⏰ 30s\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,
    }, { quoted: msg });
  },
};
