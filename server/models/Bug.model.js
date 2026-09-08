import mongoose from 'mongoose';

const bugSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
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
    },
    aiInsights: {
      possibleCause: { type: String, default: '' },
      suggestedFix: { type: String, default: '' },
      analyzedAt: { type: Date },
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
      },
    ],
    // Enterprise Observability fields
    fingerprint: {
      type: String,
      default: null,
      index: true,
    },
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

const Bug = mongoose.model('Bug', bugSchema);
export default Bug;
