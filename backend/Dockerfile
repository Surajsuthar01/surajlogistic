# Surajlogistic backend: the API (Fastify + PostgreSQL).
# Build from the repository root, because it uses the shared/ package too:
#   docker build -f backend/Dockerfile -t surajlogistic-backend .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace @suraj/backend --workspace @suraj/shared --include-workspace-root --omit=dev --no-audit --no-fund \
 && mkdir -p backend/node_modules shared/node_modules

FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Kolkata PORT=4000
WORKDIR /app
# Indian time for logs and dates (Node also carries its own time-zone data).
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache tzdata; fi
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY backend ./backend
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
USER node
WORKDIR /app/backend
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
