FROM node:20-alpine

# Build tools for native modules + git (needed for GitHub-sourced npm packages)
# ffmpeg added: required for audio conversion in .song / .play commands
RUN apk add --no-cache python3 make g++ vips-dev git ffmpeg

WORKDIR /app

COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "web/server.js"]
