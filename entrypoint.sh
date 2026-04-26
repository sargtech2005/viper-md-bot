#!/bin/sh
# ── Fly.io Entrypoint — VIPER BOT MD ─────────────────────────────────────────

# 1. Sync clock — CRITICAL for WhatsApp pairing codes
#    Fly.io Firecracker VMs can drift 60-120s from real UTC, making codes expire instantly
echo "⏰ Syncing system clock..."
if command -v chronyd >/dev/null 2>&1; then
  chronyd -q 'server pool.ntp.org iburst' 2>/dev/null \
    && echo "✅ Clock synced via chrony" \
    || echo "⚠️  Clock sync failed — codes may expire instantly"
elif command -v ntpdate >/dev/null 2>&1; then
  ntpdate -u pool.ntp.org 2>/dev/null \
    && echo "✅ Clock synced via ntpdate" \
    || echo "⚠️  Clock sync failed"
else
  echo "⚠️  No NTP client — skipping clock sync"
fi

# 2. Pre-warm the tmp directory for sessions
mkdir -p /tmp/viper-sessions

# 3. Set Node.js GC flags for high-performance bot operation on 2GB RAM
#    --max-old-space-size=1536 : 1.5GB heap for the web server + all spawned bots
#    If bot children are spawned by bot-manager, their own --max-old-space-size=1024 applies
export NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=1536"

echo "🐍 Starting VIPER BOT MD web server..."
exec node web/server.js
