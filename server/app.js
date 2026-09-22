import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import Bug from './models/Bug.model.js';
import authRoutes from './routes/auth.routes.js';
import bugRoutes from './routes/bug.routes.js';
import commentRoutes from './routes/comment.routes.js';
import aiRoutes from './routes/ai.routes.js';
import userRoutes from './routes/user.routes.js';
import telemetryRoutes from './routes/telemetry.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { protect, authorize } from './middleware/auth.middleware.js';
import { globalLimiter } from './middleware/rateLimit.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { UPLOADS_DIR } from './utils/uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
  const app = express();

  // Render/Railway/nginx all sit in front of this process. Without this, every
  // request looks like it came from the proxy and the rate limiters collapse
  // into a single shared bucket. nginx.conf forwards X-Forwarded-For for this.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: { action: 'deny' },
    })
  );

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // Mounted before the dashboard CORS policy and body parser: the SDK posts
  // from other origins and gets its own, much smaller, body limit.
  app.use('/api/telemetry', telemetryRoutes);

  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/sdk', express.static(path.join(__dirname, 'public/sdk')));

  // Apply global rate limiting to all API endpoints
  app.use('/api', globalLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/bugs', bugRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', auditRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'BugSense API is running' });
  });

  // Process and database details are operational data, not public information.
  app.get('/api/health/metrics', protect, authorize('developer', 'admin'), async (_req, res, next) => {
    try {
      const mem = process.memoryUsage();
      const [totalBugs, occurrencesAgg, sdkBugs] = await Promise.all([
        Bug.countDocuments(),
        Bug.aggregate([{ $group: { _id: null, totalOccurrences: { $sum: '$occurrences' } } }]),
        Bug.countDocuments({ source: 'sdk' }),
      ]);

      const totalOccurrences = occurrencesAgg[0]?.totalOccurrences || totalBugs;
      const deduplicatedEvents = Math.max(0, totalOccurrences - totalBugs);
      const savingsPercentage = totalOccurrences > 0 ? ((deduplicatedEvents / totalOccurrences) * 100).toFixed(1) : '0.0';

      res.json({
        status: mongoose.connection.readyState === 1 ? 'operational' : 'degraded',
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
      next(err);
    }
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
