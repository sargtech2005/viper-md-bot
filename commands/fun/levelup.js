/**
 * 🎮 Level Up System — VIPER BOT MD
 *
 * .levelup / .level / .rank  — check your level & EXP
 * .levelup top               — group leaderboard
 * .levelup @user             — check someone else's level
 *
 * EXP is earned automatically by chatting (every message = +2-5 EXP).
 * The handler hooks into every incoming message to award EXP passively.
 */

const database = require('../../database');
const config   = require('../../config');

// ── EXP Config ───────────────────────────────────────────────────────────────
const EXP_PER_MSG     = () => Math.floor(Math.random() * 4) + 2; // 2-5 EXP per message
const MSG_COOLDOWN_MS = 30 * 1000; // 30s cooldown so spamming doesn't farm EXP
const lastMsgTime     = new Map(); // userId → timestamp

// ── Level thresholds ─────────────────────────────────────────────────────────
// Each entry: [minEXP, levelName, emoji]
const LEVELS = [
  [0,      'Rookie',       '🐣'],
  [100,    'Novice',       '🌱'],
  [250,    'Apprentice',   '⚔️'],
  [500,    'Warrior',      '🛡️'],
  [1000,   'Knight',       '🏇'],
  [2000,   'Champion',     '🥇'],
  [3500,   'Expert',       '🔥'],
  [5500,   'Master',       '💎'],
  [8000,   'Grandmaster',  '👑'],
  [12000,  'Legend',       '🌟'],
  [18000,  'Mythic',       '🚀'],
  [25000,  'Immortal',     '⚡'],
  [35000,  'Viper Elite',  '🐍'],
];

function getLevelInfo(exp) {
  let level = 0, info = LEVELS[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (exp >= LEVELS[i][0]) { level = i + 1; info = LEVELS[i]; }
    else break;
  }
  const next = LEVELS[level] || null; // next level threshold
  const progress = next
    ? Math.floor(((exp - info[0]) / (next[0] - info[0])) * 100)
    : 100;
  return { level, name: info[1], emoji: info[2], nextExp: next?.[0] || null, progress };
}

function progressBar(pct, len = 12) {
  const filled = Math.round((pct / 100) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function getExp(userId) {
  const u = database.getUser(userId) || {};
  return typeof u.exp === 'number' ? u.exp : 0;
}

function addExp(userId, amount) {
  const current = getExp(userId);
  database.updateUser(userId, { exp: current + amount });
  return current + amount;
}

// ── Passive EXP hook — call this from handler.js on every message ────────────
function awardPassiveExp(userId, groupId) {
  const key = `${userId}:${groupId}`;
  const now  = Date.now();
  if (lastMsgTime.has(key) && now - lastMsgTime.get(key) < MSG_COOLDOWN_MS) return null;
  lastMsgTime.set(key, now);

  const prevExp   = getExp(userId);
  const prevLevel = getLevelInfo(prevExp).level;
  const earned    = EXP_PER_MSG();
  const newExp    = addExp(userId, earned);
  const newLevel  = getLevelInfo(newExp).level;

  return { earned, newExp, prevLevel, newLevel, leveledUp: newLevel > prevLevel };
}

module.exports = {
  name: 'levelup',
  aliases: ['level', 'rank', 'exp', 'xp'],
  category: 'fun',
  description: '🎮 XP & level system — earn EXP by chatting, level up, climb ranks',
  usage: '.levelup | .levelup top | .levelup @user',
  groupOnly: false,

  // Expose passive award function for handler
  awardPassiveExp,
  getLevelInfo,
  getExp,

  async execute(sock, msg, args, extra) {
    try {
      const B   = config.botName;
      const ctx = msg.message?.extendedTextMessage?.contextInfo || msg.message?.contextInfo || {};
      const mentions = ctx.mentionedJid || [];

      const sub = (args[0] || '').toLowerCase();

      // ── LEADERBOARD ─────────────────────────────────────────────────────
      if (sub === 'top' || sub === 'leaderboard' || sub === 'lb') {
        // Read all users directly from the users.json file
        const fs = require('fs');
        const path = require('path');
        let allUsers = {};
        try {
          const usersFile = path.join(database.DB_PATH, 'users.json');
          allUsers = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        } catch { allUsers = {}; }

        const entries  = Object.entries(allUsers)
          .map(([id, u]) => ({ id, exp: u.exp || 0 }))
          .filter(u => u.exp > 0)
          .sort((a, b) => b.exp - a.exp)
          .slice(0, 10);

        if (!entries.length) return extra.reply(`📊 No ranked users yet!\nStart chatting to earn EXP 💬\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);

        const medals = ['🥇','🥈','🥉'];
        let t = `┏❐ 《 *🏆 TOP RANKERS* 》 ❐\n┃\n`;
        entries.forEach(({ id, exp }, i) => {
          const { level, name, emoji } = getLevelInfo(exp);
          const badge = medals[i] || `${i+1}.`;
          t += `┣◆ ${badge} *${id}*\n┃    ${emoji} Lvl ${level} — ${name} | ${exp.toLocaleString()} EXP\n`;
        });
        t += `┃\n┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // ── CHECK ANOTHER USER ───────────────────────────────────────────────
      if (mentions.length) {
        const targetJid = mentions[0];
        const targetId  = targetJid.split('@')[0];
        const exp       = getExp(targetId);
        const { level, name, emoji, nextExp, progress } = getLevelInfo(exp);
        const bar = progressBar(progress);

        let t = `┏❐ 《 *🎮 RANK CARD* 》 ❐\n┃\n`;
        t += `┣◆ 👤 *@${targetId}*\n`;
        t += `┣◆ ${emoji} Level *${level}* — *${name}*\n`;
        t += `┣◆ ⭐ EXP: *${exp.toLocaleString()}*\n`;
        t += `┣◆ 📊 Progress: [${bar}] ${progress}%\n`;
        if (nextExp) t += `┣◆ 🎯 Next level at: *${nextExp.toLocaleString()} EXP*\n`;
        else t += `┣◆ 🏆 *MAX LEVEL REACHED!*\n`;
        t += `┃\n┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return await sock.sendMessage(extra.from, { text: t, mentions: [targetJid] }, { quoted: msg });
      }

      // ── OWN RANK ─────────────────────────────────────────────────────────
      const userId = extra.sender.split('@')[0];
      const exp    = getExp(userId);
      const { level, name, emoji, nextExp, progress } = getLevelInfo(exp);
      const bar    = progressBar(progress);
      const toNext = nextExp ? nextExp - exp : 0;

      let t = `┏❐ 《 *🎮 YOUR RANK CARD* 》 ❐\n┃\n`;
      t += `┣◆ 👤 *${userId}*\n`;
      t += `┣◆ ${emoji} Level *${level}* — *${name}*\n`;
      t += `┣◆ ⭐ EXP: *${exp.toLocaleString()}*\n`;
      t += `┣◆ 📊 Progress: [${bar}] ${progress}%\n`;
      if (nextExp) {
        t += `┣◆ 🎯 Next level: *${nextExp.toLocaleString()} EXP*\n`;
        t += `┣◆ 💬 Need: *${toNext.toLocaleString()} more EXP*\n`;
      } else {
        t += `┣◆ 🏆 *MAX LEVEL — Viper Elite!*\n`;
      }
      t += `┣◆ 💡 _Chat to earn EXP passively!_\n`;
      t += `┃\n┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
      return extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
