import fs from 'fs';
import http from 'http';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { initSocket } from './config/socket.js';
import { UPLOADS_DIR } from './utils/uploads.js';
import { checkJwtSecret } from './services/token.service.js';
import { environmentWarnings } from './utils/environment.js';

dotenv.config();

const jwtCheck = checkJwtSecret();
if (jwtCheck.fatal) {
  console.error(`FATAL: ${jwtCheck.warnings.join(' ')} Generate one with: openssl rand -hex 32`);
  process.exit(1);
}
if (jwtCheck.warnings.length) {
  console.warn('='.repeat(72));
  console.warn(`WARNING: ${jwtCheck.warnings.join(' ')}`);
  console.warn('Running anyway because ALLOW_INSECURE_JWT_SECRET=true. Local demo use only.');
  console.warn('='.repeat(72));
}
for (const warning of environmentWarnings()) console.warn(`WARNING: ${warning}`);

// Routes read env vars (CORS origins, limits) when they are first imported, so
// the app is loaded only after dotenv has populated process.env.
const { createApp } = await import('./app.js');

// Multer writes here, but the directory is gitignored so a fresh clone has none.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

await connectDB();

const app = createApp();
const httpServer = http.createServer(app);

const io = initSocket(httpServer);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`BugSense server running on port ${PORT}`);
});

// Hosts and `docker stop` send SIGTERM before killing the process. Stop taking
// connections, let in-flight requests finish, then close the database, with a
// hard deadline so a stuck connection cannot block a deploy.
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);

  const deadline = setTimeout(() => {
    console.error('Shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10000);
  deadline.unref();

  // io.close() disconnects every socket and closes the HTTP server with it.
  io.close(async () => {
    try {
      await mongoose.disconnect();
    } finally {
      process.exit(0);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
