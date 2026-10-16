# Node 24 LTS for the build stage (supported floor: 22.13, see package.json).
FROM node:24-alpine AS builder

WORKDIR /app

# Build-time API base URL. Defaults to a relative path so the built bundle
# talks to nginx, which proxies through to the server container.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
# Public SDK key for the SDK Playground; must match the server's
# TELEMETRY_INGEST_KEY when that is set.
ARG VITE_TELEMETRY_INGEST_KEY=
ENV VITE_TELEMETRY_INGEST_KEY=$VITE_TELEMETRY_INGEST_KEY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx serving the app shell is what "healthy" means for this container; the
# API has its own healthcheck. busybox wget ships with nginx:alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
