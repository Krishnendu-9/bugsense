import AuditLog from '../models/AuditLog.model.js';

/**
 * Service: Records an immutable enterprise audit log entry
 */
export const logActivity = async ({
  action,
  entityType = 'bug',
  entityId = null,
  performedBy = null,
  performedByName = 'System',
  details,
  metadata = {},
}) => {
  try {
    await AuditLog.create({
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      performedBy,
      performedByName,
      details,
      metadata,
    });
  } catch (err) {
    console.warn('AuditLog write failure (non-fatal):', err.message);
  }
};
