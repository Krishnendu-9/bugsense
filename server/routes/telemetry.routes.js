import { Router } from 'express';
import { reportTelemetry } from '../controllers/telemetry.controller.js';
import { telemetryLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// Public telemetry ingestion endpoint (no user login required so external apps can report)
router.post('/report', telemetryLimiter, reportTelemetry);

export default router;
