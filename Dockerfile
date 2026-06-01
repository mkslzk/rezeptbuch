# Stage 1: Build React client
FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production

WORKDIR /app

# Install better-sqlite3 (needs native build)
RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/src ./server/src/

# Copy client build from stage 1
COPY --from=client-build /app/client/dist ./client/dist/

# Create data directory for SQLite
RUN mkdir -p server/data

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server/src/index.js"]