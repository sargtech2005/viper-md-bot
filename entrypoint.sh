#!/bin/sh
# ── Fly.io Entrypoint — VIPER BOT MD (Lightning ⚡) ──────────────────────────

# 1. Sync clock in BACKGROUND — don't block server startup
#    Fly.io Firecracker VMs can drift from real UTC, making WA pairing codes expire
echo "⏰ Syncing clock (background)..."
(
  if command -v chronyd >/dev/null 2>&1; then
    chronyd -q 'server pool.ntp.org iburst' 2>/dev/null \
      && echo "✅ Clock synced" || echo "⚠️  Clock sync failed"
  elif command -v ntpdate >/dev/null 2>&1; then
    ntpdate -u pool.ntp.org 2>/dev/null \
      && echo "✅ Clock synced" || echo "⚠️  Clock sync failed"
  fi
) &

# 2. Pre-warm session and temp directories
mkdir -p /tmp/viper-sessions /tmp/viper-tmp

# 3. V8 / Node.js tuning for 2GB Fly.io VM
#    --max-old-space-size=1536  : 1.5GB heap
#    --expose-gc                : allow manual GC calls
#    --optimize-for-size        : smaller code caches = faster startup
#    UV_THREADPOOL_SIZE already set to 16 in Dockerfile
export NODE_OPTIONS="--max-old-space-size=1536 --expose-gc --optimize-for-size"

echo "🐍 Starting VIPER BOT MD web server..."
exec node web/server.js
