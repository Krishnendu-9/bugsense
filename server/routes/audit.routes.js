import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', protect, authorize('developer', 'admin'), getAuditLogs);

export default router;
