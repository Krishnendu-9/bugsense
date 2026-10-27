import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['bug', 'user', 'comment', 'system', 'telemetry'],
      default: 'bug',
    },
    entityId: {
      type: String,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    performedByName: {
      type: String,
      default: 'System',
    },
    details: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Every request that matters writes an entry (failed sign-ins included), so
// the trail is kept for AUDIT_RETENTION_DAYS (default 365) and MongoDB's TTL
// monitor deletes older entries. 0 keeps them forever. The index serves the
// newest-first listing too. MongoDB builds it once: changing the setting
// later means dropping the "audit_retention" index (see CONFIGURATION.md).
const parsedRetention = Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? '', 10);
const retentionDays = Number.isFinite(parsedRetention) && parsedRetention >= 0 ? parsedRetention : 365;
auditLogSchema.index(
  { createdAt: 1 },
  retentionDays > 0
    ? { name: 'audit_retention', expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    : { name: 'audit_retention' }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
