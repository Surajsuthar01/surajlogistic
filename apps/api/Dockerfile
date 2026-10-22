# SurajLogistic API — build from the repository root:
#   docker build -f apps/api/Dockerfile -t surajlogistic-api .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @suraj/api --workspace @suraj/core --include-workspace-root --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Kolkata PORT=4000
RUN apk add --no-cache tzdata && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/core ./packages/core
COPY apps/api ./apps/api
USER app
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
