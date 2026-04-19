/**
 * .stats — server resource stats  (VIPER BOT MD)
 * RAM, CPU, Disk, Uptime, Node version, Platform
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');
const os   = require('os');
const fs   = require('fs');
const { execSync } = require('child_process');

function fmtBytes(b) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

function fmtUptime(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600)  / 60);
  const s = Math.floor(secs % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function getDisk() {
  try {
    const out = execSync('df -k / 2>/dev/null', { timeout: 3000 }).toString().trim();
    const lines = out.split('\n');
    // "Filesystem 1K-blocks Used Available Use% Mounted"
    const parts = lines[1].trim().split(/\s+/);
    const total    = parseInt(parts[1]) * 1024;
    const used     = parseInt(parts[2]) * 1024;
    const pct      = parts[4];
    return { total, used, pct };
  } catch {
    return null;
  }
}

function getCpuModel() {
  const cpus = os.cpus();
  if (!cpus.length) return 'Unknown';
  return cpus[0].model.trim();
}

function getCpuUsage() {
  // Sum user+sys times across all cores and compute % vs total
  const cpus = os.cpus();
  let user = 0, sys = 0, idle = 0;
  for (const c of cpus) {
    user += c.times.user;
    sys  += c.times.sys;
    idle += c.times.idle;
  }
  const total  = user + sys + idle;
  const active = user + sys;
  return total > 0 ? ((active / total) * 100).toFixed(1) : '0.0';
}

module.exports = {
  name: 'stats',
  aliases: ['serverstats', 'sysinfo', 'resources', 'sys'],
  category: 'general',
  description: 'Show server RAM, CPU, disk and uptime',
  usage: '.stats',

  async execute(sock, msg, args, extra) {
    try {
      // ── Memory ─────────────────────────────────────────────────────────────
      const totalMem  = os.totalmem();
      const freeMem   = os.freemem();
      const usedMem   = totalMem - freeMem;
      const memPct    = ((usedMem / totalMem) * 100).toFixed(1);
      const memBar    = buildBar(parseFloat(memPct));

      // ── CPU ────────────────────────────────────────────────────────────────
      const cpuModel  = getCpuModel();
      const cpuCores  = os.cpus().length;
      const cpuPct    = getCpuUsage();
      const cpuBar    = buildBar(parseFloat(cpuPct));
      const loadAvg   = os.loadavg().map(v => v.toFixed(2)).join(' | ');

      // ── Disk ───────────────────────────────────────────────────────────────
      const disk = getDisk();
      const diskLine = disk
        ? `${fmtBytes(disk.used)} / ${fmtBytes(disk.total)} (${disk.pct})`
        : '–';
      const diskBar = disk
        ? buildBar(parseInt(disk.pct))
        : '░░░░░░░░░░';

      // ── Uptime ─────────────────────────────────────────────────────────────
      const sysUptime  = fmtUptime(os.uptime());
      const procUptime = fmtUptime(Math.floor(process.uptime()));

      // ── Node / Platform ────────────────────────────────────────────────────
      const nodeVer  = process.version;
      const platform = `${os.platform()} ${os.arch()}`;

      let t = `┏❐ 《 *📊 ${sc('server stats')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🧠 *RAM*\n`;
      t += `┃    ${fmtBytes(usedMem)} / ${fmtBytes(totalMem)} (${memPct}%)\n`;
      t += `┃    ${memBar}\n`;
      t += `┃\n`;
      t += `┣◆ ⚙️ *CPU* — ${cpuCores} core(s)\n`;
      t += `┃    ${cpuModel.length > 35 ? cpuModel.slice(0, 35) + '…' : cpuModel}\n`;
      t += `┃    Usage: ${cpuPct}%\n`;
      t += `┃    ${cpuBar}\n`;
      t += `┃    Load avg: ${loadAvg}\n`;
      t += `┃\n`;
      t += `┣◆ 💾 *Disk*\n`;
      t += `┃    ${diskLine}\n`;
      t += `┃    ${diskBar}\n`;
      t += `┃\n`;
      t += `┣◆ ⏱️ *System Uptime*: ${sysUptime}\n`;
      t += `┣◆ 🤖 *Bot Uptime*: ${procUptime}\n`;
      t += `┣◆ 🟢 *Node.js*: ${nodeVer}\n`;
      t += `┣◆ 🖥️ *Platform*: ${platform}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
    }
  },
};

function buildBar(pct, len = 10) {
  const filled = Math.round((pct / 100) * len);
  const empty  = len - filled;
  const color  = pct >= 85 ? '🟥' : pct >= 60 ? '🟨' : '🟩';
  return color.repeat(filled) + '⬜'.repeat(empty) + ` ${pct}%`;
}
