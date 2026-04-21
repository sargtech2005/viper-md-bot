/**
 * Global Cleanup System — VIPER BOT MD
 * Cleans up temp files, caches, and junk to prevent ENOSPC errors.
 * Interval: 25 minutes (extended from 10 to reduce disconnection risk).
 * NEVER touches session/creds files.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { getTempDir } = require('./tempManager');
const config         = require('../config');

// ── Timings ──────────────────────────────────────────────────────────────────
const CLEANUP_INTERVAL_MS   = 25 * 60 * 1000; // 25 minutes
const FILE_AGE_THRESHOLD_MS = 20 * 60 * 1000; // delete files older than 20 min

// ── Protected names — NEVER touch these ────────────────────────────────────
const SESSION_DIR_NAME = config.sessionName || 'session';
const PROTECTED = new Set(['creds.json', 'app-state-sync-key', 'session', 'keys', 'pre-key']);

function isProtected(name) {
  return PROTECTED.has(name) ||
    name.startsWith('app-state') ||
    name.startsWith('sender-key') ||
    name.startsWith('session-') ||
    name.includes('creds');
}

// ── Helper: delete files in a directory older than threshold ────────────────
function cleanDir(dir, thresholdMs, label) {
  if (!fs.existsSync(dir)) return { deleted: 0, freed: 0 };
  let deleted = 0, freed = 0;
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return { deleted, freed }; }

  for (const entry of entries) {
    if (isProtected(entry)) continue;
    const fp = path.join(dir, entry);
    try {
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        // Only clean sub-dirs that are NOT session-related
        if (!isProtected(entry)) {
          const sub = cleanDir(fp, thresholdMs, label);
          deleted += sub.deleted;
          freed   += sub.freed;
          // Remove empty dir
          try {
            if (fs.readdirSync(fp).length === 0) fs.rmdirSync(fp);
          } catch (_) {}
        }
        continue;
      }
      if (Date.now() - stat.mtimeMs > thresholdMs) {
        freed += stat.size;
        fs.unlinkSync(fp);
        deleted++;
      }
    } catch (e) {
      if (!e.message.includes('ENOENT') && !e.message.includes('EBUSY')) {
        // Silently skip in-use files
      }
    }
  }
  return { deleted, freed };
}

// ── Main cleanup function ────────────────────────────────────────────────────
function cleanupOldFiles() {
  let totalDeleted = 0;
  let totalFreed   = 0;

  try {
    // 1. Bot's own temp directory
    const tempDir = getTempDir();
    const r1 = cleanDir(tempDir, FILE_AGE_THRESHOLD_MS, 'temp');
    totalDeleted += r1.deleted;
    totalFreed   += r1.freed;

    // 2. OS temp directory — only files we likely created (common prefixes)
    const osTmp = os.tmpdir();
    if (osTmp && fs.existsSync(osTmp)) {
      const botPrefixes = ['viper_', 'wabot_', 'baileys_', 'ffmpeg_', 'sharp_', 'tmp_'];
      try {
        const entries = fs.readdirSync(osTmp);
        for (const entry of entries) {
          if (!botPrefixes.some(p => entry.startsWith(p))) continue;
          const fp = path.join(osTmp, entry);
          try {
            const stat = fs.statSync(fp);
            if (!stat.isDirectory() && Date.now() - stat.mtimeMs > FILE_AGE_THRESHOLD_MS) {
              totalFreed += stat.size;
              fs.unlinkSync(fp);
              totalDeleted++;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // 3. node_modules/.cache — safe to clear; rebuilds automatically
    const nmCache = path.join(process.cwd(), 'node_modules', '.cache');
    if (fs.existsSync(nmCache)) {
      try {
        fs.rmSync(nmCache, { recursive: true, force: true });
        totalDeleted++;
        console.log('🧹 Cleared node_modules/.cache');
      } catch (_) {}
    }

    // 4. Any .log files in the project root older than threshold
    const rootDir = process.cwd();
    try {
      const rootEntries = fs.readdirSync(rootDir);
      for (const entry of rootEntries) {
        if (!entry.endsWith('.log') && !entry.endsWith('.tmp')) continue;
        const fp = path.join(rootDir, entry);
        try {
          const stat = fs.statSync(fp);
          if (!stat.isDirectory() && Date.now() - stat.mtimeMs > FILE_AGE_THRESHOLD_MS) {
            totalFreed += stat.size;
            fs.unlinkSync(fp);
            totalDeleted++;
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (totalDeleted > 0) {
      const mb = (totalFreed / (1024 * 1024)).toFixed(2);
      console.log(`🧹 Cleanup complete: removed ${totalDeleted} file(s), freed ${mb} MB`);
    }

  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
let cleanupInterval = null;

function startCleanup() {
  console.log(`🧹 Cleanup system starting (interval: ${CLEANUP_INTERVAL_MS / 60000} min)...`);
  cleanupOldFiles(); // immediate run at boot

  cleanupInterval = setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
  console.log('✅ Cleanup system active');
}

function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Cleanup system stopped');
  }
}

process.on('SIGINT',  () => { stopCleanup(); process.exit(0); });
process.on('SIGTERM', () => { stopCleanup(); process.exit(0); });

module.exports = { cleanupOldFiles, startCleanup, stopCleanup };
