# Rezeptbuch Dockerfile
FROM node:22-slim AS builder

WORKDIR /app

# Copy client source files
COPY client/ /app/client/

# Install dependencies and build
WORKDIR /app/client
RUN npm install && npm run build

# === Production image ===
FROM node:22-slim

WORKDIR /app

# Install Python, yt-dlp, faster-whisper, and tesseract OCR for video text extraction
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg tesseract-ocr tesseract-ocr-deu \
    && pip3 install --break-system-packages yt-dlp faster-whisper pytesseract \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend from builder
COPY --from=builder /app/client/dist /app/client/dist

# Copy server source and install deps
COPY server/package*.json server/
WORKDIR /app/server
RUN npm install

COPY server/src /app/server/src

# Install Playwright browsers (needed for scraper)
RUN npm install playwright \
    && npx playwright install --with-deps chromium firefox

WORKDIR /app/server

EXPOSE 3001

# Data directory for SQLite DB and JSON configs
VOLUME ["/app/server/src/data"]

CMD ["node", "src/index.js"]
