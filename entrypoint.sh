#!/bin/sh
# Sync clock before starting — critical for WhatsApp pair codes (time-based)
# Fly.io Firecracker VMs can drift 60-120s from real UTC, making codes expire instantly
echo "⏰ Syncing system clock..."
if command -v chronyd >/dev/null 2>&1; then
  chronyd -q 'server pool.ntp.org iburst' 2>/dev/null && echo "✅ Clock synced via chrony" || echo "⚠️  Clock sync failed — codes may expire instantly"
elif command -v ntpdate >/dev/null 2>&1; then
  ntpdate -u pool.ntp.org 2>/dev/null && echo "✅ Clock synced via ntpdate" || echo "⚠️  Clock sync failed"
else
  echo "⚠️  No NTP client available — skipping clock sync"
fi

exec node web/server.js
