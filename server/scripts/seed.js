import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.model.js';
import Bug from '../models/Bug.model.js';
import Comment from '../models/Comment.model.js';
import AuditLog from '../models/AuditLog.model.js';
import { generateFingerprintV2, manualKeyInputs } from '../utils/fingerprint.util.js';
import { getHeuristicAnalysis } from '../services/ai.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const seed = async () => {
  // The seeded accounts share a published password, admin included, so a
  // production database only gets them when the operator says it is a demo
  // (docker compose sets ALLOW_DEMO_SEED for the local stack).
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error(
      'Refusing to seed: NODE_ENV is production and the demo accounts use the published password "password123".\n' +
        'Set ALLOW_DEMO_SEED=true only for a throwaway demo deployment.'
    );
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/bugsense';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Seeding wipes every collection. Refuse on a database that already has
  // accounts unless the caller explicitly asks for a reset.
  const force = process.argv.includes('--force');
  if (!force && (await User.estimatedDocumentCount()) > 0) {
    console.error(
      'Refusing to seed: this database already contains users and seeding deletes ALL data.\n' +
        'Run `npm run seed:reset` (or `node scripts/seed.js --force`) if you really want to reset it.'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  // Even without users there can be SDK incidents or audit entries, so clear
  // everything, but only say so when something was actually removed.
  const cleared = await Promise.all([
    User.deleteMany({}),
    Bug.deleteMany({}),
    Comment.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  const removed = cleared.reduce((sum, result) => sum + result.deletedCount, 0);
  if (removed > 0) console.log(`Cleared existing data (${removed} documents)`);

  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@bugsense.dev',
    password: 'password123',
    role: 'admin',
  });

  const developer = await User.create({
    name: 'Dev User',
    email: 'dev@bugsense.dev',
    password: 'password123',
    role: 'developer',
  });

  const reporter = await User.create({
    name: 'Reporter User',
    email: 'reporter@bugsense.dev',
    password: 'password123',
    role: 'reporter',
  });

  /*
   * SYNTHETIC DATES. Everything below is demo data, and so are its timestamps:
   * the bugs are backdated across the past week so the Overview has a history
   * to show -- an open-bug trend that moves, an oldest-open age, a median time
   * to resolve. None of these dates describe real events.
   *
   * Times are fixed hours on whole days before today (UTC), never today, so
   * every timestamp is in the past whatever time the seed is run, and the
   * week's shape is the same on every run. With the SDK incidents below, open
   * bugs per day, oldest first, read 2, 3, 4, 2, 4, 3, 3; the median time to
   * resolve is 26h across 2 bugs; and the SDK pair is 50 crashes received,
   * grouped into 3 bugs.
   */
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const daysAgo = (days, hour, minute = 0) =>
    new Date(todayUtc.getTime() - days * 86400000 + (hour * 60 + minute) * 60000);

  const loginErrorLog = `TypeError: Cannot read properties of undefined (reading 'value')
  at handleAutofill (Login.jsx:34)
  at HTMLInputElement.<anonymous> (Login.jsx:28)`;

  // Manual reports carry the v2 fingerprint the API gives them (for the
  // similar-report hint), so a freshly seeded database has nothing to migrate
  // (docs/fingerprint-eval-v2.md, Amendment 1, P21).
  const withManualFingerprint = (list) =>
    list.map((bug) => ({
      ...bug,
      fingerprint: generateFingerprintV2(manualKeyInputs({ project: bug.project, title: bug.title, errorLog: bug.errorLog })),
      fingerprintVersion: 2,
    }));

  const bugs = await Bug.insertMany(withManualFingerprint([
    {
      title: 'Login page crashes on Safari 17',
      description: '<p>The login page throws a white screen on Safari 17 when autofill is triggered. Works fine on Chrome and Firefox.</p>',
      steps: [
        'Open the app in Safari 17',
        'Navigate to /login',
        'Tap on the email field — autofill suggestions appear',
        'Select any autofill suggestion',
        'Page goes white / crashes',
      ],
      priority: 'critical',
      status: 'open',
      severity: 'blocker',
      project: 'BugSense Frontend',
      tags: ['safari', 'login', 'autofill'],
      reporter: reporter._id,
      assignedTo: developer._id,
      errorLog: loginErrorLog,
      browserInfo: {
        browser: 'Safari',
        version: '17.0',
        os: 'macOS Sonoma',
        screenSize: '1440x900',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14) AppleWebKit/605.1.15',
      },
      // What a real analysis returns with no ANTHROPIC_API_KEY: the keyword
      // heuristic's own output, labelled as such (source: 'heuristic').
      aiInsights: { ...getHeuristicAnalysis(loginErrorLog), analyzedAt: daysAgo(6, 9, 2) },
      // Open all week: the oldest open bug. Last touched by the comment below.
      createdAt: daysAgo(6, 9),
      updatedAt: daysAgo(6, 15),
    },
    {
      title: 'Dashboard charts show NaN on first load',
      description: '<p>The Recharts bar chart on the dashboard briefly shows NaN labels before data loads. This only happens on the first render when stats are still fetching.</p>',
      steps: [
        'Log in to the app',
        'Navigate to /dashboard',
        'Watch the priority bar chart during load',
        'NaN appears as axis labels for ~500ms',
      ],
      priority: 'medium',
      status: 'in-progress',
      severity: 'minor',
      project: 'BugSense Frontend',
      tags: ['dashboard', 'charts', 'recharts'],
      reporter: developer._id,
      assignedTo: developer._id,
      // Open for two days, then picked up.
      statusHistory: [
        { status: 'in-progress', changedBy: developer._id, changedAt: daysAgo(3, 10), note: 'Picking this up today', kind: 'change' },
      ],
      createdAt: daysAgo(5, 11),
      updatedAt: daysAgo(3, 10),
    },
    {
      title: 'AI analyze endpoint returns 502 intermittently',
      description: '<p>The <code>/api/ai/analyze</code> endpoint occasionally returns a 502 with "AI returned malformed response". This happens roughly 1 in 10 requests, suggesting the Claude response sometimes includes extra markdown wrapping the JSON.</p>',
      steps: [
        'Go to AI Analyzer page',
        'Paste a long stack trace (500+ characters)',
        'Click "Analyze with AI"',
        'Repeat 10 times — will fail at least once',
      ],
      priority: 'high',
      status: 'open',
      severity: 'major',
      project: 'BugSense Backend',
      tags: ['ai', 'api', 'anthropic'],
      reporter: admin._id,
      errorLog: `SyntaxError: Unexpected token ` + '`' + ` in JSON at position 0
  at JSON.parse (<anonymous>)
  at analyzeError (server/services/ai.service.js:18)
  at analyzeErrorLog (server/controllers/ai.controller.js:12)`,
      // Reported two days ago, not yet triaged.
      createdAt: daysAgo(2, 13),
      updatedAt: daysAgo(2, 13),
    },
    {
      title: 'File upload fails silently when image > 4.9MB',
      description: '<p>When a user uploads a screenshot between 4.9MB and 5MB, the upload silently fails — no error toast, no feedback. The 5MB limit is enforced by Multer but the error is not surfaced to the frontend.</p>',
      steps: [
        'Go to Report Bug page',
        'Drag a PNG file that is between 4.9MB and 5MB onto the upload area',
        'Submit the form',
        'No error is shown, but screenshot field is empty in the saved bug',
      ],
      priority: 'low',
      status: 'resolved',
      severity: 'minor',
      project: 'BugSense Backend',
      tags: ['upload', 'multer', 'ux'],
      reporter: reporter._id,
      // Resolved 30 hours after it was reported -- the seeded median.
      statusHistory: [
        { status: 'in-progress', changedBy: developer._id, changedAt: daysAgo(3, 9), note: 'Adding error handler for multer limits', kind: 'change' },
        { status: 'resolved', changedBy: developer._id, changedAt: daysAgo(3, 14), note: 'Fixed — multer error now caught and returned as 413', kind: 'change' },
      ],
      createdAt: daysAgo(4, 8),
      updatedAt: daysAgo(3, 14),
    },
  ]));

  const comment = await Comment.create({
    bug: bugs[0]._id,
    author: developer._id,
    content: 'Confirmed on Safari 17.1 as well. Looks like the autofill event fires before our React state is ready. Will investigate the event handler timing.',
    createdAt: daysAgo(6, 15),
    updatedAt: daysAgo(6, 15),
  });

  // timestamps: false, or this link would stamp the bug as updated just now.
  await Bug.findByIdAndUpdate(bugs[0]._id, { $push: { comments: comment._id } }, { timestamps: false });

  /*
   * SDK-CAPTURED INCIDENTS -- synthetic, like everything above.
   *
   * These are what the BugSense SDK would have produced had it been running:
   * each is one bug standing for many crashes, grouped by fingerprint. They
   * are written with the same shape the telemetry endpoint writes (source
   * 'sdk', no reporter, occurrences, first/last seen, breadcrumbs, browser
   * info), and the fingerprint is computed by the real generateFingerprintV2()
   * from the real-looking stack trace, scoped by project as live capture
   * does -- so the fingerprint and top frame the Bugs list shows are genuine.
   * The repeat counts, dates and traces are invented.
   *
   *   41 crashes  TypeError in the storefront cart, still open
   *    3 crashes  ReferenceError at checkout, picked up yesterday
   *    6 crashes  RangeError in date formatting: fixed, then regressed
   */
  const REGRESSION_NOTE = 'Regression auto-detected: error re-occurred in production telemetry.';
  const chromeWindows = {
    browser: 'Chrome',
    version: '130.0.0.0',
    os: 'Windows 10/11',
    screenSize: '1920x1080',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };
  const safariMac = {
    browser: 'Safari',
    version: '17.6',
    os: 'macOS',
    screenSize: '1512x982',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  };
  // The last few steps before a crash, ending in the error itself.
  const trail = (at, steps) =>
    steps.map(([minutesBefore, category, message, data = {}]) => ({
      timestamp: new Date(at.getTime() - minutesBefore * 60000),
      category,
      message,
      data,
    }));

  const sdkIncident = ({ errorLog, project, createdAt, lastSeenAt, updatedAt, ...rest }) => {
    const title = errorLog.split('\n')[0];
    return {
      title,
      // The SDK sends no description for these, so none is stored.
      description: '',
      errorLog,
      project,
      source: 'sdk',
      reporter: null,
      // The key the telemetry endpoint computes for the same report.
      fingerprint: generateFingerprintV2({ project, title, errorLog, breadcrumbs: rest.breadcrumbs }),
      fingerprintVersion: 2,
      firstSeenAt: createdAt,
      lastSeenAt,
      createdAt,
      updatedAt: updatedAt || lastSeenAt,
      ...rest,
    };
  };

  const cartLastSeen = daysAgo(1, 21, 40);
  const checkoutLastSeen = daysAgo(1, 8, 30);
  const dateLastSeen = daysAgo(1, 18);

  const sdkBugs = await Bug.insertMany([
    sdkIncident({
      errorLog: [
        "TypeError: Cannot read properties of undefined (reading 'total')",
        '    at CartSummary (https://shop.example.com/assets/CartSummary-3f9a1c.js:41:18)',
        '    at renderWithHooks (https://shop.example.com/assets/react-dom-8b2e4d.js:15486:18)',
        '    at updateFunctionComponent (https://shop.example.com/assets/react-dom-8b2e4d.js:19617:20)',
        '    at beginWork (https://shop.example.com/assets/react-dom-8b2e4d.js:21640:16)',
      ].join('\n'),
      project: 'Storefront',
      priority: 'high',
      severity: 'major',
      status: 'open',
      occurrences: 41,
      createdAt: daysAgo(5, 16, 20),
      lastSeenAt: cartLastSeen,
      browserInfo: chromeWindows,
      breadcrumbs: trail(cartLastSeen, [
        [4, 'navigation', '/products/espresso-grinder -> /cart'],
        [3, 'xhr', 'GET /api/cart 200', { status: 200 }],
        [2, 'click', 'button.remove-item'],
        [1, 'xhr', 'DELETE /api/cart/items/8812 204', { status: 204 }],
        [0, 'error', "TypeError: Cannot read properties of undefined (reading 'total')"],
      ]),
    }),
    sdkIncident({
      errorLog: [
        'ReferenceError: analytics is not defined',
        '    at trackCheckoutStarted (https://shop.example.com/assets/checkout-a71c02.js:88:5)',
        '    at HTMLButtonElement.onCheckoutClick (https://shop.example.com/assets/checkout-a71c02.js:142:9)',
      ].join('\n'),
      project: 'Storefront',
      priority: 'medium',
      severity: 'minor',
      status: 'in-progress',
      occurrences: 3,
      assignedTo: developer._id,
      createdAt: daysAgo(2, 10, 5),
      lastSeenAt: checkoutLastSeen,
      updatedAt: daysAgo(1, 9),
      statusHistory: [
        { status: 'in-progress', changedBy: developer._id, changedAt: daysAgo(1, 9), note: 'Analytics script is blocked by some ad blockers; guarding the call', kind: 'change' },
      ],
      browserInfo: safariMac,
      breadcrumbs: trail(checkoutLastSeen, [
        [2, 'navigation', '/cart -> /checkout'],
        [1, 'console', 'Failed to load resource: analytics.js (blocked)'],
        [0, 'click', 'button#start-checkout'],
        [0, 'error', 'ReferenceError: analytics is not defined'],
      ]),
    }),
    sdkIncident({
      errorLog: [
        'RangeError: Invalid time value',
        '    at format (https://app.bugsense.dev/assets/date-fns-5c1d9e.js:2:31544)',
        '    at TimelineEntry (https://app.bugsense.dev/assets/BugDetail-91ab3f.js:7:10422)',
        '    at renderWithHooks (https://app.bugsense.dev/assets/react-dom-8b2e4d.js:15486:18)',
      ].join('\n'),
      project: 'BugSense Frontend',
      priority: 'high',
      severity: 'major',
      // Resolved 22 hours after it was first captured, then it came back: the
      // telemetry pipeline flips a resolved bug to in-progress when it recurs.
      status: 'in-progress',
      occurrences: 6,
      assignedTo: developer._id,
      createdAt: daysAgo(6, 12),
      lastSeenAt: dateLastSeen,
      statusHistory: [
        { status: 'resolved', changedBy: developer._id, changedAt: daysAgo(5, 10), note: 'Guarded format() against entries with no timestamp', kind: 'change' },
        { status: 'in-progress', changedAt: daysAgo(1, 15, 10), note: REGRESSION_NOTE, kind: 'regression' },
      ],
      browserInfo: chromeWindows,
      breadcrumbs: trail(dateLastSeen, [
        [3, 'navigation', '/bugs -> /bugs/6713f0c2'],
        [2, 'xhr', 'GET /api/bugs/6713f0c2 200', { status: 200 }],
        [0, 'error', 'RangeError: Invalid time value'],
      ]),
    }),
  ]);

  // The audit trail a real capture leaves: one SDK_TELEMETRY event per new
  // incident, and REGRESSION_DETECTED when a resolved one recurs.
  const [, , regressed] = sdkBugs;
  await AuditLog.insertMany([
    ...sdkBugs.map((bug) => ({
      action: 'SDK_TELEMETRY',
      entityType: 'telemetry',
      entityId: bug._id.toString(),
      performedByName: 'BugSense SDK',
      details: `SDK reported a crash: "${bug.title}" (${bug.severity})`,
      createdAt: bug.createdAt,
      updatedAt: bug.createdAt,
    })),
    {
      action: 'REGRESSION_DETECTED',
      entityType: 'telemetry',
      entityId: regressed._id.toString(),
      performedByName: 'Telemetry Pipeline',
      details: `Telemetry regression: "${regressed.title}" re-occurred (4x)`,
      createdAt: daysAgo(1, 15, 10),
      updatedAt: daysAgo(1, 15, 10),
    },
  ]);

  console.log('\nSeed complete:');
  console.log(`  Users:    ${await User.countDocuments()}`);
  console.log(`  Bugs:     ${await Bug.countDocuments()} (${sdkBugs.length} captured by the SDK)`);
  console.log(`  Comments: ${await Comment.countDocuments()}`);
  console.log('\nDemo accounts:');
  console.log('  admin@bugsense.dev    / password123  (admin)');
  console.log('  dev@bugsense.dev      / password123  (developer)');
  console.log('  reporter@bugsense.dev / password123  (reporter)');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
