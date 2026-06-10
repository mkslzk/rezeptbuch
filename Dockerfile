# Rezeptbuch Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy client source files
COPY client/ /app/client/

# Install dependencies and build
WORKDIR /app/client
RUN npm install && npm run build

# === Production image ===
FROM node:22-alpine

WORKDIR /app

# Install Python and yt-dlp for video extraction
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages yt-dlp

# Copy built frontend from builder
COPY --from=builder /app/client/dist /app/client/dist

# Copy server source and install deps
COPY server/package*.json server/
WORKDIR /app/server
RUN npm install

COPY server/src /app/server/src

WORKDIR /app/server

EXPOSE 3001

# Data directory for SQLite DB and JSON configs
VOLUME ["/app/server/src/data"]

CMD ["node", "src/index.js"]
