import fs from 'fs';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { initSocket } from './config/socket.js';
import Bug from './models/Bug.model.js';
import authRoutes from './routes/auth.routes.js';
import bugRoutes from './routes/bug.routes.js';
import commentRoutes from './routes/comment.routes.js';
import aiRoutes from './routes/ai.routes.js';
import userRoutes from './routes/user.routes.js';
import telemetryRoutes from './routes/telemetry.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { globalLimiter } from './middleware/rateLimit.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in production. Refusing to start with the development fallback.');
  process.exit(1);
}

// Multer writes here, but the directory is gitignored so a fresh clone has none.
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

connectDB();

const app = express();

// Render/Railway/nginx all sit in front of this process. Without this, every
// request looks like it came from the proxy and the rate limiters collapse
// into a single shared bucket.
app.set('trust proxy', 1);
const httpServer = http.createServer(app);

initSocket(httpServer);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(morgan('dev'));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(uploadsDir));
app.use('/sdk', express.static(path.join(__dirname, 'public/sdk')));

// Apply global rate limiting to all API endpoints
app.use('/api', globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/bugs', bugRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'BugSense API is running' });
});

app.get('/api/health/metrics', async (_req, res) => {
  try {
    const mem = process.memoryUsage();
    const [totalBugs, occurrencesAgg, sdkBugs] = await Promise.all([
      Bug.countDocuments(),
      Bug.aggregate([{ $group: { _id: null, totalOccurrences: { $sum: '$occurrences' } } }]),
      Bug.countDocuments({ source: 'sdk' }),
    ]);

    const totalOccurrences = occurrencesAgg[0]?.totalOccurrences || totalBugs || 1;
    const deduplicatedEvents = Math.max(0, totalOccurrences - totalBugs);
    const savingsPercentage = totalOccurrences > 0 ? ((deduplicatedEvents / totalOccurrences) * 100).toFixed(1) : 0;

    res.json({
      status: 'operational',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        host: mongoose.connection.host || 'localhost',
        name: mongoose.connection.name || 'bugsense',
      },
      memory: {
        rssMb: (mem.rss / (1024 * 1024)).toFixed(1),
        heapUsedMb: (mem.heapUsed / (1024 * 1024)).toFixed(1),
        heapTotalMb: (mem.heapTotal / (1024 * 1024)).toFixed(1),
      },
      telemetry: {
        totalUniqueBugs: totalBugs,
        totalRawIncidents: totalOccurrences,
        deduplicatedEvents,
        savingsPercentage: `${savingsPercentage}%`,
        sdkReportedBugs: sdkBugs,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`BugSense server running on port ${PORT}`);
});
