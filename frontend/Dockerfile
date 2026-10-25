# Surajlogistic frontend: the website and every app screen, served by nginx, which also
# passes /api to the backend. Build from the repository root (it uses shared/ too):
#   docker build -f frontend/Dockerfile -t surajlogistic-frontend .
# Run with BACKEND_URL pointing at the backend, e.g. http://backend:4000 (no trailing slash).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace @suraj/frontend --workspace @suraj/shared --include-workspace-root --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared ./shared
COPY frontend ./frontend
RUN npm run build -w @suraj/frontend

FROM nginx:1.27-alpine
ENV BACKEND_URL=http://backend:4000 \
    NGINX_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_FILTER=^(BACKEND_URL|NGINX_RESOLVER)$
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY frontend/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
