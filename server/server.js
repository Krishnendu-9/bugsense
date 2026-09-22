import fs from 'fs';
import http from 'http';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { initSocket } from './config/socket.js';
import { UPLOADS_DIR } from './utils/uploads.js';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in production. Refusing to start with the development fallback.');
  process.exit(1);
}

// Routes read env vars (CORS origins, limits) when they are first imported, so
// the app is loaded only after dotenv has populated process.env.
const { createApp } = await import('./app.js');

// Multer writes here, but the directory is gitignored so a fresh clone has none.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

await connectDB();

const app = createApp();
const httpServer = http.createServer(app);

initSocket(httpServer);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`BugSense server running on port ${PORT}`);
});
