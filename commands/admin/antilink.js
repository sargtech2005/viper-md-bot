/**
 * .antilink — Antilink protection for groups (VIPER BOT MD)
 *
 * Modes:
 *   .antilink on delete  — delete link, notify
 *   .antilink on kick    — delete link, kick sender
 *   .antilink on warn    — delete link, add warning (auto-kick at max warns)
 *   .antilink off        — disable antilink
 *   .antilink            — show current status
 */

const database = require('../../database');
const config   = require('../../config');
const { sc }   = require('../../utils/categoryMenu');

module.exports = {
  name: 'antilink',
  aliases: ['al'],
  category: 'admin',
  description: 'Antilink protection — delete/kick/warn',
  usage: '.antilink on delete | kick | warn  |  .antilink off',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const B        = database.getSetting('botName', config.botName);
      const settings = database.getGroupSettings(extra.from);
      const opt      = (args[0] || '').toLowerCase();
      const sub      = (args[1] || 'delete').toLowerCase();

      // ── STATUS (no args) ──────────────────────────────────────────────
      if (!opt) {
        const on  = settings.antilink;
        const act = settings.antilinkAction || 'delete';
        const icon = act === 'kick' ? '👢' : act === 'warn' ? '⚠️' : '🗑️';
        let t  = `┏❐ 《 *🔗 ${sc('antilink')}* 》 ❐\n┃\n`;
        t += `┣◆ Status: ${on ? '🟢 *ON*' : '🔴 *OFF*'}\n`;
        if (on) t += `┣◆ Action: ${icon} *${act.toUpperCase()}*\n`;
        t += `┃\n`;
        t += `┣◆ 📖 *Usage:*\n`;
        t += `┣◆ *.antilink on delete* — 🗑️ Delete link\n`;
        t += `┣◆ *.antilink on kick*   — 👢 Delete + kick\n`;
        t += `┣◆ *.antilink on warn*   — ⚠️ Delete + warn\n`;
        t += `┣◆ *.antilink off*       — Turn off\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // ── OFF ───────────────────────────────────────────────────────────
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antilink: false });
        return extra.reply(
          `┏❐ 《 *🔗 ${sc('antilink')}* 》 ❐\n┃\n` +
          `┣◆ 🔴 *Antilink DISABLED*\n` +
          `┣◆ Members can now share links freely\n` +
          `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
        );
      }

      // ── ON <action> ───────────────────────────────────────────────────
      if (opt === 'on') {
        const validActions = ['delete', 'kick', 'warn'];
        if (!validActions.includes(sub)) {
          return extra.reply(
            `❌ Invalid action: *${sub}*\n\n` +
            `Valid: *delete* | *kick* | *warn*\n` +
            `Example: *.antilink on kick*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
          );
        }

        database.updateGroupSettings(extra.from, {
          antilink:       true,
          antilinkAction: sub,
        });

        const icon = sub === 'kick' ? '👢' : sub === 'warn' ? '⚠️' : '🗑️';
        const desc = sub === 'kick'
          ? 'Links will be *deleted* and sender *kicked*'
          : sub === 'warn'
          ? `Links will be *deleted* and sender *warned* (auto-kick at ${config.maxWarnings || 3} warnings)`
          : 'Links will be *deleted* and sender *notified*';

        return extra.reply(
          `┏❐ 《 *🔗 ${sc('antilink')}* 》 ❐\n┃\n` +
          `┣◆ 🟢 *Antilink ENABLED*\n` +
          `┣◆ ${icon} Action: *${sub.toUpperCase()}*\n┃\n` +
          `┣◆ ${desc}\n` +
          `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
        );
      }

      // ── Unknown arg ───────────────────────────────────────────────────
      return extra.reply(
        `❌ Unknown option: *${opt}*\n\nUse *.antilink on delete|kick|warn* or *.antilink off*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
      );

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
