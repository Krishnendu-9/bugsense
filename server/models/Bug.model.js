import mongoose from 'mongoose';

// Sent by SDK 1.4.0 and later (docs/fingerprint-eval-v2.md, 8.1-8.2 and
// Amendment 1, P13-P16). Older SDKs send neither, and the fields stay null.
const failedRequestSchema = new mongoose.Schema(
  { method: String, url: String, status: Number },
  { _id: false }
);
const errorLocationSchema = new mongoose.Schema(
  { filename: String, lineno: Number, colno: Number },
  { _id: false }
);

const bugSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    // Required for a person's report. An SDK crash may carry none: it is then
    // stored empty, not filled with a placeholder sentence.
    description: {
      type: String,
      default: '',
      required: [
        function descriptionRequired() {
          return this.source !== 'sdk';
        },
        'Description is required',
      ],
    },
    steps: {
      type: [String],
      default: [],
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
    },
    severity: {
      type: String,
      enum: ['minor', 'major', 'blocker'],
      default: 'minor',
    },
    browserInfo: {
      browser: { type: String, default: '' },
      version: { type: String, default: '' },
      os: { type: String, default: '' },
      screenSize: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
    screenshot: {
      type: String,
      default: '',
    },
    annotatedScreenshot: {
      type: String,
      default: '',
    },
    errorLog: {
      type: String,
      default: '',
      maxlength: [20000, 'Error log cannot exceed 20,000 characters'],
    },
    aiInsights: {
      possibleCause: { type: String, default: '' },
      suggestedFix: { type: String, default: '' },
      // 'claude' for a model response, 'heuristic' for the offline fallback.
      // Unset until an analysis runs, so an unanalysed bug never claims to
      // carry model output.
      source: { type: String, enum: ['claude', 'heuristic'] },
      analyzedAt: { type: Date },
      // Set when the error log is edited after this analysis ran; a new
      // analysis replaces the whole object and so clears it.
      outdated: { type: Boolean },
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    project: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'Project cannot exceed 100 characters'],
    },
    tags: {
      type: [String],
      default: [],
    },
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
      },
    ],
    statusHistory: [
      {
        status: { type: String },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        note: { type: String, default: '' },
        // What wrote the entry: a person ('change'), the telemetry pipeline
        // re-opening a fixed bug ('regression'), or the fingerprint migration
        // ('migration'). No default on purpose: Mongoose fills defaults in on
        // read, and entries written before this field must read as unknown so
        // the client can still classify them by their old shape.
        kind: { type: String, enum: ['change', 'regression', 'migration'] },
      },
    ],
    // Telemetry and deduplication fields (fingerprinting, occurrence counts, breadcrumbs)
    fingerprint: {
      type: String,
      default: null,
    },
    // Which key produced `fingerprint`: 2 for the v2 key
    // (docs/fingerprint-eval-v2.md, 8.2). No default, on purpose (Amendment 1,
    // P29): Mongoose fills defaults in when reading, so a bug stored before v2
    // must read as missing, which the migration treats as version 1.
    fingerprintVersion: { type: Number },
    // The key a bug had before the migration re-keyed it (8.3).
    legacyFingerprint: { type: String, default: null },
    // Set on a bug the migration merged into another (8.3).
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Bug', default: null },
    occurrences: {
      type: Number,
      default: 1,
    },
    firstSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ['manual', 'sdk', 'api'],
      default: 'manual',
    },
    // From the SDK's error, request, source and componentStack fields. The
    // server sets these; no route lets a client write them.
    errorName: { type: String, default: null },
    errorMessage: { type: String, default: null },
    request: { type: failedRequestSchema, default: null },
    errorLocation: { type: errorLocationSchema, default: null },
    componentStack: { type: String, default: '' },
    breadcrumbs: [
      {
        timestamp: { type: Date, default: Date.now },
        category: {
          type: String,
          enum: ['click', 'navigation', 'xhr', 'console', 'error'],
          default: 'click',
        },
        message: { type: String, default: '' },
        data: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
    gitPatch: {
      diff: { type: String, default: '' },
      explanation: { type: String, default: '' },
      generatedAt: { type: Date },
    },
    githubIssue: {
      url: { type: String, default: '' },
      issueNumber: { type: Number },
      exportedAt: { type: Date },
    },
  },
  { timestamps: true }
);

bugSchema.index({ status: 1, priority: 1, reporter: 1 });
bugSchema.index({ fingerprint: 1 });
// SDK telemetry deduplicates by fingerprint. The unique partial index makes
// concurrent reports of a new error converge on one incident instead of racing
// to create duplicates. Manual reports are excluded: two people may file the
// same error separately and both reports must be kept.
bugSchema.index(
  { fingerprint: 1, source: 1 },
  { unique: true, partialFilterExpression: { fingerprint: { $type: 'string' }, source: 'sdk' } }
);

// A bug that flaps for years (resolved, regressed, resolved...) would grow its
// history without end, and every read of the bug carries all of it. The newest
// entries are what the page and the 7-day trend read, so writers drop the
// oldest beyond this many.
export const MAX_STATUS_HISTORY = 200;

const Bug = mongoose.model('Bug', bugSchema);
export default Bug;
