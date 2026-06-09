# Rezeptbuch Dockerfile
FROM node:22-alpine

WORKDIR /app

# Build frontend
COPY client/package*.json client/
RUN cd client && npm install && npm run build

# Install backend dependencies
COPY server/package*.json server/
RUN cd server && npm install

# Copy application code
COPY --from=0 /app/client/dist /app/client/dist
COPY server/src /app/server/src
COPY server/package*.json /app/server/

WORKDIR /app/server

EXPOSE 3001

# Data directory for SQLite DB and JSON configs
VOLUME ["/app/server/src/data"]

CMD ["node", "src/index.js"]