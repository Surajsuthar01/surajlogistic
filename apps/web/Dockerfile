# SurajLogistic web app — build from the repository root:
#   docker build -f apps/web/Dockerfile -t surajlogistic-web .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @suraj/web --workspace @suraj/core --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/web ./apps/web
RUN npm run build -w @suraj/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
