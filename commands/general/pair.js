/**
 * .pair <number> — pair a WhatsApp number directly from WhatsApp  (VIPER BOT MD)
 * Owner-only. Spawns a new bot session and delivers the pair code here.
 */
const config  = require('../../config');
const { sc }  = require('../../utils/categoryMenu');
const path    = require('path');
const fs      = require('fs');
const { spawn } = require('child_process');

const ROOT         = path.resolve(__dirname, '../../');
const SESSIONS_F   = path.join(ROOT, 'sessions.json');
const SETTINGS_F   = path.join(ROOT, 'settings.json');

function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_F, 'utf8')); }
  catch { return {}; }
}
function saveSessions(d) {
  fs.writeFileSync(SESSIONS_F, JSON.stringify(d, null, 2));
}
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_F, 'utf8')); }
  catch { return { max_sessions: 0 }; }
}

module.exports = {
  name: 'pair',
  aliases: ['addsession', 'newsession'],
  category: 'general',
  description: 'Pair a new WhatsApp number (owner only)',
  usage: '.pair <number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // ── Validate input ─────────────────────────────────────────────────────
      const raw    = (args[0] || '').replace(/[^0-9]/g, '');
      if (!raw || raw.length < 10 || raw.length > 15) {
        return extra.reply(
          `📱 *${sc('pair a number')}*\n\n` +
          `Usage: *.pair <number>*\n` +
          `Example: *.pair 2348083086811*\n\n` +
          `_Use full international format — no + or spaces_`
        );
      }
      const number = raw;

      // ── Max sessions check ─────────────────────────────────────────────────
      const settings   = loadSettings();
      const sessions   = loadSessions();
      const maxSessions = settings.max_sessions || 0;

      if (maxSessions > 0 && Object.keys(sessions).length >= maxSessions) {
        return extra.reply(
          `❌ *Session limit reached!*\n\n` +
          `Maximum allowed: *${maxSessions}*\n` +
          `Current sessions: *${Object.keys(sessions).length}*\n\n` +
          `Contact the owner to increase the limit.`
        );
      }

      // ── Duplicate check ────────────────────────────────────────────────────
      if (sessions[number]) {
        return extra.reply(
          `⚠️ Session \`${number}\` already exists.\n` +
          `Use *.delpair ${number}* to remove it first, then re-pair.`
        );
      }

      // ── Pre-flight: nuke any leftover session folder ────────────────────────
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }

      // ── Register session ───────────────────────────────────────────────────
      sessions[number] = {
        number,
        wa_owner:  extra.sender,
        source:    'whatsapp',
        added:     new Date().toISOString(),
      };
      saveSessions(sessions);

      await extra.reply(
        `⏳ *Starting session for \`${number}\`...*\n\n` +
        `Your pair code will appear here in a few seconds.\n` +
        `Keep this chat open! 🔑`
      );

      // ── Spawn bot process ──────────────────────────────────────────────────
      const sessionDir = path.join(ROOT, 'sessions', number);
      const logDir     = path.join(ROOT, 'logs');
      const logFile    = path.join(logDir, `${number}.log`);
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.mkdirSync(logDir,     { recursive: true });

      const proc = spawn('node', [path.join(ROOT, 'index.js')], {
        cwd: ROOT,
        env: {
          ...process.env,
          SESSION_DIR:    sessionDir,
          SESSION_NUMBER: number,
          PAIR_NUMBER:    number,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Tee output to log file
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });
      proc.stdout.pipe(logStream);
      proc.stderr.pipe(logStream);

      // ── Watch stdout for pair code ─────────────────────────────────────────
      let codeSent   = false;
      const deadline = Date.now() + 90_000;   // 90 s timeout

      const check = setInterval(() => {
        if (Date.now() > deadline && !codeSent) {
          clearInterval(check);
          // Remove the pending session so user can retry
          const s2 = loadSessions();
          delete s2[number];
          saveSessions(s2);
          try { proc.kill(); } catch (_) {}
          extra.reply(
            `⏱️ *Pair code timed out for \`${number}\`.*\n\n` +
            `The session has been removed. Please try again with *.pair ${number}*`
          );
        }
      }, 5_000);

      // Capture pair code from spawned process stdout
      let buffer = '';
      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const match = buffer.match(/PAIR_CODE:(\S+)/);
        if (match && !codeSent) {
          codeSent = true;
          clearInterval(check);
          const code = match[1];
          let t = `🔑 *ᴘᴀɪʀ ᴄᴏᴅᴇ ʀᴇᴀᴅʏ!*\n\n`;
          t += `📱 Number: \`${number}\`\n\n`;
          t += `\`\`\`\n${code}\n\`\`\`\n\n`;
          t += `*How to link:*\n`;
          t += `1️⃣  Open WhatsApp → Settings\n`;
          t += `2️⃣  Tap *Linked Devices*\n`;
          t += `3️⃣  Tap *Link a Device*\n`;
          t += `4️⃣  Tap *"Link with phone number instead"*\n`;
          t += `5️⃣  Enter the code above ☝️\n\n`;
          t += `⏳ Code expires in ~60 seconds.`;
          extra.reply(t);
        }
      });

      // Watch for successful connection
      let connectedMsgSent = false;
      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (!connectedMsgSent && /CONNECTED|connected successfully/i.test(text)) {
          connectedMsgSent = true;
          extra.reply(`✅ *Session \`${number}\` is now connected!*\n\n🐍 ${config.botName} is online.`);
        }
        if (/loggedOut|Logged out/i.test(text)) {
          extra.reply(`⚠️ Session \`${number}\` was logged out.`);
        }
      });

      proc.on('error', (err) => {
        clearInterval(check);
        extra.reply(`💀 Failed to start session for \`${number}\`: ${err.message}`);
      });

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
