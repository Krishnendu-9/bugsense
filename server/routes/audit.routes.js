import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', protect, getAuditLogs);

export default router;
