# OneMapan frontend (Next.js) image
# Build context: ./frontend
FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# NEXT_PUBLIC_* variables are inlined at build time and cannot be changed
# after the image is built.
ARG NEXT_PUBLIC_API_URL=http://localhost:2025
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build, then drop devDependencies (eslint, etc.) – `next start` only needs the
# production dependencies.
RUN npm run build \
    && npm prune --omit=dev


# --- Runtime image ---------------------------------------------------------
FROM node:20-bookworm-slim

RUN groupadd --system onemapan \
    && useradd --system --gid onemapan --home-dir /app onemapan

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps --chown=onemapan:onemapan /app/package.json /app/package-lock.json ./
COPY --from=deps --chown=onemapan:onemapan /app/node_modules ./node_modules
COPY --from=deps --chown=onemapan:onemapan /app/.next ./.next
COPY --from=deps --chown=onemapan:onemapan /app/next.config.mjs ./next.config.mjs
COPY --from=deps --chown=onemapan:onemapan /app/public ./public

USER onemapan
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000),r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "run", "start"]
