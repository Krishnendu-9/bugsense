FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Multer writes here; the directory is gitignored so it may not exist in the
# build context. The server also creates it at startup, but this keeps the
# image correct when the path is mounted as a volume.
RUN mkdir -p uploads

EXPOSE 5000

CMD ["npm", "start"]
