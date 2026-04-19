/**
 * .delpair <number>  (VIPER BOT MD)
 * Owner-only. Fully nukes a paired session — auth keys, DB, logs, sessions.json.
 * Treats the number as completely new on next pair attempt.
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const path   = require('path');
const fs     = require('fs');

const ROOT       = path.resolve(__dirname, '../../');
const SESSIONS_F = path.join(ROOT, 'sessions.json');

function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_F, 'utf8')); }
  catch { return {}; }
}
function saveSessions(d) {
  fs.writeFileSync(SESSIONS_F, JSON.stringify(d, null, 2));
}

function nukeSession(number) {
  const results = [];

  // 1. Session folder (creds, pre-keys, signal keys, db/)
  const sd = path.join(ROOT, 'sessions', number);
  if (fs.existsSync(sd)) {
    try {
      fs.rmSync(sd, { recursive: true, force: true });
      results.push('✅ Auth & DB folder wiped');
    } catch (e) {
      results.push(`⚠️ Folder wipe partial: ${e.message}`);
    }
  } else {
    results.push('ℹ️ No session folder found');
  }

  // 2. Log file
  const logFile = path.join(ROOT, 'logs', `${number}.log`);
  if (fs.existsSync(logFile)) {
    try { fs.unlinkSync(logFile); results.push('✅ Log file removed'); }
    catch { results.push('⚠️ Log file could not be removed'); }
  }

  // 3. sessions.json entry
  const sessions = loadSessions();
  if (sessions[number]) {
    delete sessions[number];
    saveSessions(sessions);
    results.push('✅ Removed from sessions registry');
  } else {
    results.push('ℹ️ Not in sessions registry');
  }

  return results;
}

module.exports = {
  name: 'delpair',
  aliases: ['removesession', 'unpair', 'delsession'],
  category: 'general',
  description: 'Fully delete a paired session (owner only)',
  usage: '.delpair <number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const raw    = (args[0] || '').replace(/[^0-9]/g, '');
      if (!raw || raw.length < 10) {
        return extra.reply(
          `🗑️ *${sc('delete session')}*\n\n` +
          `Usage: *.delpair <number>*\n` +
          `Example: *.delpair 2348083086811*\n\n` +
          `_Completely wipes all session data — auth keys, DB, logs._`
        );
      }

      const sessions = loadSessions();
      if (!sessions[raw]) {
        return extra.reply(
          `❌ No session found for \`${raw}\`\n\n` +
          `_Maybe it was already deleted?_`
        );
      }

      await extra.reply(`🗑️ Nuking session \`${raw}\`...`);

      const results = nukeSession(raw);

      let t = `┏❐ 《 *🗑️ ${sc('session deleted')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 📱 *Number*: \`${raw}\`\n`;
      t += `┃\n`;
      results.forEach(r => { t += `┣◆ ${r}\n`; });
      t += `┃\n`;
      t += `┣◆ 🆕 *Next .pair ${raw} will start completely fresh*\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
