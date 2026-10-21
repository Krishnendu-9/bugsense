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
import { getClientOrigins } from './utils/clientOrigins.js';
import { parseTrustProxy } from './utils/trustProxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
  const app = express();

  // Render/Railway/nginx all sit in front of this process. Without this, every
  // request looks like it came from the proxy and the rate limiters collapse
  // into a single shared bucket. nginx.conf forwards X-Forwarded-For for this.
  // Trusting more hops than really exist would let clients spoof their IP via
  // X-Forwarded-For, so set TRUST_PROXY to match the deployment (0 when the
  // server is reached directly).
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

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

  // The embeddable SDK is a public script with no credentials. It is loaded
  // with crossorigin="anonymous" so Chromium dispatches unhandled rejections
  // that pass through it, and that needs this header. Mounted before the
  // dashboard CORS policy so that policy never applies to it, and scoped to
  // /sdk so it never widens CORS for the API.
  app.use(
    '/sdk',
    (_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    },
    express.static(path.join(__dirname, 'public/sdk'))
  );

  app.use(cors({
    origin: getClientOrigins(),
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));

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

      // Both halves of the deduplication pair are scoped to SDK reports. Only
      // the telemetry pipeline groups crashes by fingerprint -- manual reports
      // never merge and always hold occurrences: 1 -- so counting them in
      // either half dilutes the rate with bugs that could not have been
      // deduplicated in the first place.
      // A bug the fingerprint migration merged into another is neither an
      // incident nor a source of crashes of its own: its survivor holds its
      // count (docs/fingerprint-eval-v2.md, Amendment 1, P33).
      const SDK = { source: 'sdk', mergedInto: null };
      const [sdkIncidents, receivedAgg] = await Promise.all([
        Bug.countDocuments(SDK),
        Bug.aggregate([{ $match: SDK }, { $group: { _id: null, total: { $sum: '$occurrences' } } }]),
      ]);

      const sdkCrashesReceived = receivedAgg[0]?.total ?? 0;
      const duplicatesMerged = Math.max(0, sdkCrashesReceived - sdkIncidents);
      // null rather than 0 when nothing has been received: "no data yet" and
      // "received crashes, none were duplicates" are different statements.
      const dedupRate = sdkCrashesReceived > 0
        ? Number(((duplicatesMerged / sdkCrashesReceived) * 100).toFixed(1))
        : null;

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
        // SDK pipeline only; see above.
        telemetry: {
          sdkCrashesReceived,
          sdkIncidents,
          duplicatesMerged,
          dedupRate,
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
