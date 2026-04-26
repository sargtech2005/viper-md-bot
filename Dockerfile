FROM node:20-alpine AS deps

# ── System dependencies (cached — only rebuilds when apk packages change) ────
# python3/make/g++: native module compilation (sharp, etc.)
# vips-dev: libvips for sharp image processing
# git: npm packages sourced from GitHub
# ffmpeg: audio/video conversion
# chrony: NTP clock sync — CRITICAL for WhatsApp pairing codes
# ttf-freefont + font-noto: fonts for Sharp/librsvg SVG rendering
# tini: proper PID 1 init — handles SIGTERM/SIGCHLD correctly
RUN apk add --no-cache \
    python3 make g++ vips-dev git \
    ffmpeg chrony \
    ttf-freefont font-noto fontconfig \
    tini \
    && fc-cache -fv

WORKDIR /app

# ── Install dependencies — separate layer, only rebuilds when package.json changes
# npm ci is faster & more reliable than npm install (uses lockfile exactly)
COPY package.json ./
RUN npm install --omit=dev --prefer-offline

# ── Final image — copy deps then code (code changes skip the npm layer) ───────
FROM node:20-alpine AS final

# Copy system tools from deps stage
COPY --from=deps /usr/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=deps /usr/bin/ffprobe /usr/bin/ffprobe
COPY --from=deps /usr/sbin/chronyd /usr/sbin/chronyd
COPY --from=deps /sbin/tini /sbin/tini
COPY --from=deps /usr/share/fonts /usr/share/fonts
COPY --from=deps /etc/fonts /etc/fonts

# Copy apk-installed libs needed by sharp / vips
COPY --from=deps /usr/lib /usr/lib
COPY --from=deps /usr/local/lib /usr/local/lib

# ── Node.js performance environment ──────────────────────────────────────────
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# UV_THREADPOOL_SIZE: libuv thread pool for I/O — raise for concurrent bot sessions
ENV UV_THREADPOOL_SIZE=16
# V8 flags: expose GC, optimize startup time, use all available cores for JIT
ENV NODE_OPTIONS="--max-old-space-size=1536 --expose-gc --optimize-for-size"

WORKDIR /app

# ── Copy installed node_modules from deps stage ───────────────────────────────
COPY --from=deps /app/node_modules ./node_modules

# ── Copy application code LAST — so code-only changes are a tiny top layer ───
COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

# ── Health check — tighter timing matches fly.toml checks ────────────────────
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# ── Use tini as PID 1 — correct signal handling for Fly.io graceful restarts ──
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
