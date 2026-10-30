# OneMapan backend image
# Build context: ./backend
FROM node:20-bookworm-slim AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Generate the Prisma client before the app code is copied in.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# Build, drop dev dependencies, and sanity-check that the generated Prisma
# client still works afterwards (no dev deps needed at runtime).
RUN npm run build \
    && npm prune --omit=dev \
    && node -e "const { PrismaClient } = require('@prisma/client'); new PrismaClient(); console.log('prisma client ok')"


# --- Runtime image ---------------------------------------------------------
FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system onemapan \
    && useradd --system --gid onemapan --home-dir /app onemapan

WORKDIR /app

ENV NODE_ENV=production \
    PORT=2025

COPY --from=deps --chown=onemapan:onemapan /app/node_modules ./node_modules
COPY --from=deps --chown=onemapan:onemapan /app/dist ./dist
COPY --from=deps --chown=onemapan:onemapan /app/package.json ./package.json

# Schema + migrations are needed at runtime to apply pending migrations.
COPY --chown=onemapan:onemapan prisma ./prisma

# Uploaded posters/images. Mount a named volume on /app/public/uploads in
# production so files survive container restarts.
RUN mkdir -p /app/public/uploads \
    && chown -R onemapan:onemapan /app/public

USER onemapan
EXPOSE 2025

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||2025)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Apply pending migrations, then start the API. If you prefer manual
# migrations, override the command with: docker compose run --rm backend npx prisma migrate deploy
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
