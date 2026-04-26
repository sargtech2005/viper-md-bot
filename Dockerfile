FROM node:20-alpine

# ── System dependencies ───────────────────────────────────────────────────────
# python3/make/g++: native module compilation (sharp, canvas, etc.)
# vips-dev: libvips for sharp image processing
# git: npm packages sourced from GitHub
# ffmpeg: audio/video conversion for media commands
# chrony: NTP clock sync — CRITICAL for WhatsApp pairing codes (must be within 30s of real time)
# ttf-freefont + font-noto: fonts for Sharp/librsvg SVG rendering — without these ALL SVG text is blank!
# tini: proper PID 1 init — handles SIGTERM/SIGCHLD correctly, prevents zombie processes
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
# UV_THREADPOOL_SIZE: libuv thread pool for I/O — default is 4, raise for concurrent bot sessions
ENV UV_THREADPOOL_SIZE=16

WORKDIR /app

# ── Install dependencies (production only, cached layer) ─────────────────────
COPY package*.json ./
RUN npm install --omit=dev --prefer-offline

# ── Copy application code ─────────────────────────────────────────────────────
COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

# ── Health check — tighter timing matches fly.toml checks ────────────────────
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# ── Use tini as PID 1 — correct signal handling for Fly.io graceful restarts ──
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
