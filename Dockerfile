FROM node:20-alpine

# ── System dependencies ───────────────────────────────────────────────────────
# Layer is cached by Docker/Depot — only rebuilds if this RUN line changes.
# python3/make/g++: native module compilation (sharp, etc.)
# vips-dev: libvips for sharp image processing
# git: npm packages sourced from GitHub
# ffmpeg: audio/video conversion for media commands
# chrony: NTP clock sync — CRITICAL for WhatsApp pairing codes
# ttf-freefont + font-noto: fonts for Sharp/librsvg SVG rendering
# tini: proper PID 1 init — handles SIGTERM/SIGCHLD correctly
RUN apk add --no-cache \
    python3 make g++ vips-dev git \
    ffmpeg chrony \
    ttf-freefont font-noto fontconfig \
    tini \
    && fc-cache -fv

# ── Node.js performance environment ──────────────────────────────────────────
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV UV_THREADPOOL_SIZE=16
ENV NODE_OPTIONS="--max-old-space-size=1536"

WORKDIR /app

# ── Install dependencies BEFORE copying code ──────────────────────────────────
# This is the key caching trick: Docker only reruns npm install when package.json
# changes. Code-only changes skip this slow layer entirely → fast redeploys.
COPY package.json ./
RUN npm install --omit=dev --prefer-offline

# ── Copy application code LAST (tiny layer — changes every deploy) ────────────
COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# ── tini as PID 1 — correct SIGTERM handling for Fly.io graceful restarts ─────
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
