/**
 * Global Cleanup System — VIPER BOT MD
 * Runs every 5 minutes using async fs — never blocks the event loop,
 * so the bot keeps replying normally during cleanup.
 * NEVER touches session/creds files.
 */

const fs     = require('fs').promises;
const fsSync = require('fs');
const path   = require('path');
const os     = require('os');
const { getTempDir } = require('./tempManager');
const config         = require('../config');

const CLEANUP_INTERVAL_MS   = 5 * 60 * 1000;  // 5 minutes
const FILE_AGE_THRESHOLD_MS = 20 * 60 * 1000; // delete files older than 20 min

const PROTECTED = new Set(['creds.json', 'app-state-sync-key', 'session', 'keys', 'pre-key']);
function isProtected(name) {
  return PROTECTED.has(name) ||
    name.startsWith('app-state') ||
    name.startsWith('sender-key') ||
    name.startsWith('session-') ||
    name.includes('creds');
}

// Async dir cleaner — yields to event loop between files
async function cleanDir(dir, thresholdMs) {
  let deleted = 0, freed = 0;
  let entries;
  try { entries = await fs.readdir(dir); } catch { return { deleted, freed }; }

  for (const entry of entries) {
    if (isProtected(entry)) continue;
    const fp = path.join(dir, entry);
    try {
      const stat = await fs.stat(fp);
      if (stat.isDirectory()) {
        const sub = await cleanDir(fp, thresholdMs);
        deleted += sub.deleted; freed += sub.freed;
        try { await fs.rmdir(fp); } catch {} // remove if now empty
        continue;
      }
      if (Date.now() - stat.mtimeMs > thresholdMs) {
        freed += stat.size;
        await fs.unlink(fp);
        deleted++;
      }
    } catch (e) {
      if (!e.message.includes('ENOENT') && !e.message.includes('EBUSY') && !e.message.includes('ENOTEMPTY')) {
        // skip silently
      }
    }
    // Yield to event loop every file so bot commands aren't delayed
    await new Promise(r => setImmediate(r));
  }
  return { deleted, freed };
}

async function cleanupOldFiles() {
  let totalDeleted = 0, totalFreed = 0;
  try {
    // 1. Bot temp dir
    const r1 = await cleanDir(getTempDir(), FILE_AGE_THRESHOLD_MS);
    totalDeleted += r1.deleted; totalFreed += r1.freed;

    // 2. OS temp — only our prefixes
    const osTmp = os.tmpdir();
    const botPrefixes = ['viper_', 'wabot_', 'baileys_', 'ffmpeg_', 'sharp_', 'tmp_'];
    try {
      const entries = await fs.readdir(osTmp);
      for (const entry of entries) {
        if (!botPrefixes.some(p => entry.startsWith(p))) continue;
        const fp = path.join(osTmp, entry);
        try {
          const stat = await fs.stat(fp);
          if (!stat.isDirectory() && Date.now() - stat.mtimeMs > FILE_AGE_THRESHOLD_MS) {
            totalFreed += stat.size;
            await fs.unlink(fp);
            totalDeleted++;
          }
        } catch {}
        await new Promise(r => setImmediate(r));
      }
    } catch {}

    // 3. node_modules/.cache
    const nmCache = path.join(process.cwd(), 'node_modules', '.cache');
    if (fsSync.existsSync(nmCache)) {
      try { await fs.rm(nmCache, { recursive: true, force: true }); totalDeleted++; } catch {}
    }

    // 4. .log / .tmp files in project root
    try {
      const rootEntries = await fs.readdir(process.cwd());
      for (const entry of rootEntries) {
        if (!entry.endsWith('.log') && !entry.endsWith('.tmp')) continue;
        const fp = path.join(process.cwd(), entry);
        try {
          const stat = await fs.stat(fp);
          if (!stat.isDirectory() && Date.now() - stat.mtimeMs > FILE_AGE_THRESHOLD_MS) {
            totalFreed += stat.size;
            await fs.unlink(fp);
            totalDeleted++;
          }
        } catch {}
      }
    } catch {}

    if (totalDeleted > 0) {
      const mb = (totalFreed / (1024 * 1024)).toFixed(2);
      console.log(`🧹 Cleanup: removed ${totalDeleted} file(s), freed ${mb} MB`);
    }
  } catch (e) {
    console.error('❌ Cleanup error:', e.message);
  }
}

let cleanupInterval = null;

function startCleanup() {
  console.log(`🧹 Cleanup system starting (interval: ${CLEANUP_INTERVAL_MS / 60000} min)...`);
  cleanupOldFiles(); // run immediately at boot (async — non-blocking)
  cleanupInterval = setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
  console.log('✅ Cleanup system active');
}

function stopCleanup() {
  if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
}

process.on('SIGINT',  () => { stopCleanup(); process.exit(0); });
process.on('SIGTERM', () => { stopCleanup(); process.exit(0); });

module.exports = { cleanupOldFiles, startCleanup, stopCleanup };
