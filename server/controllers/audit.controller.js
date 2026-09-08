import AuditLog from '../models/AuditLog.model.js';

export const getAuditLogs = async (req, res) => {
  try {
    const { entityType, action, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    return res.json({
      logs,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
