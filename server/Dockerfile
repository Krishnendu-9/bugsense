# Node 24 LTS. The supported floor is 22.13 (package.json engines); CI tests
# both that exact version and 24.
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

# Multer writes here; the directory is gitignored so it may not exist in the
# build context. The server also creates it at startup, but this keeps the
# image correct when the path is mounted as a volume.
RUN mkdir -p uploads && chown node:node uploads

# The official image ships an unprivileged "node" user; a compromise of the
# app should not also be root inside the container.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run node directly rather than through npm so SIGTERM reaches the server and
# its graceful shutdown runs.
CMD ["node", "server.js"]
