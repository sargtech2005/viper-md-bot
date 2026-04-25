FROM node:20-alpine

# Build tools for native modules + git (needed for GitHub-sourced npm packages)
# ffmpeg: audio conversion   chrony: NTP clock sync (critical for WhatsApp pair codes)
# ttf-freefont + font-noto: fonts for Sharp/librsvg SVG text rendering
# Without these, ALL text in generated SVG images renders blank/invisible on Alpine!
RUN apk add --no-cache python3 make g++ vips-dev git ffmpeg chrony \
    ttf-freefont font-noto fontconfig \
    && fc-cache -fv

WORKDIR /app

COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install --omit=dev

COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# entrypoint.sh syncs clock via NTP before starting the server
CMD ["/app/entrypoint.sh"]
