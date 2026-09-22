import { Router } from 'express';
import express from 'express';
import cors from 'cors';
import { reportTelemetry, requireIngestKey } from '../controllers/telemetry.controller.js';
import { telemetryLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// The SDK runs inside other websites, so this router has its own CORS policy
// instead of the dashboard-only one. TELEMETRY_ALLOWED_ORIGINS narrows it to a
// comma-separated list; unset, any origin may report.
const allowedOrigins = (process.env.TELEMETRY_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

router.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'X-BugSense-Key'],
  })
);

// Reports are small; a tight body limit bounds what one request can store.
router.use(express.json({ limit: '64kb' }));

// Public telemetry ingestion endpoint (no user login required so external apps can report)
router.post('/report', telemetryLimiter, requireIngestKey, reportTelemetry);

export default router;
