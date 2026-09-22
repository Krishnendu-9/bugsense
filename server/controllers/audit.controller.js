import AuditLog from '../models/AuditLog.model.js';

const ENTITY_TYPES = ['bug', 'user', 'comment', 'system', 'telemetry'];

export const getAuditLogs = async (req, res, next) => {
  try {
    const { entityType, action } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));

    const filter = {};
    if (entityType) {
      if (!ENTITY_TYPES.includes(entityType)) return res.status(400).json({ message: 'Invalid entityType filter' });
      filter.entityType = entityType;
    }
    if (action) {
      if (typeof action !== 'string') return res.status(400).json({ message: 'Invalid action filter' });
      filter.action = action;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return res.json({
      logs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    return next(err);
  }
};
