import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.model.js';
import Bug from '../models/Bug.model.js';
import Comment from '../models/Comment.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const seed = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/bugsense';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  await User.deleteMany({});
  await Bug.deleteMany({});
  await Comment.deleteMany({});
  console.log('Cleared existing data');

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

  const bugs = await Bug.insertMany([
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
      errorLog: `TypeError: Cannot read properties of undefined (reading 'value')
  at handleAutofill (Login.jsx:34)
  at HTMLInputElement.<anonymous> (Login.jsx:28)`,
      browserInfo: {
        browser: 'Safari',
        version: '17.0',
        os: 'macOS Sonoma',
        screenSize: '1440x900',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14) AppleWebKit/605.1.15',
      },
      aiInsights: {
        possibleCause: 'The autofill event fires before the React controlled input state is initialized, causing a null reference when accessing event.target.value.',
        suggestedFix: '1. Add a null check before accessing event.target.value in the autofill handler.\n2. Use the onChange event instead of browser autofill events.\n3. Ensure the input is fully mounted before attaching event listeners.',
        analyzedAt: new Date(),
      },
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
      statusHistory: [
        { status: 'in-progress', changedBy: developer._id, changedAt: new Date(), note: 'Picking this up today' },
      ],
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
  at analyzeError (server/utils/anthropic.js:18)
  at analyzeErrorLog (server/controllers/ai.controller.js:12)`,
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
      statusHistory: [
        { status: 'in-progress', changedBy: developer._id, changedAt: new Date(Date.now() - 86400000), note: 'Adding error handler for multer limits' },
        { status: 'resolved', changedBy: developer._id, changedAt: new Date(), note: 'Fixed — multer error now caught and returned as 413' },
      ],
    },
  ]);

  const comment = await Comment.create({
    bug: bugs[0]._id,
    author: developer._id,
    content: 'Confirmed on Safari 17.1 as well. Looks like the autofill event fires before our React state is ready. Will investigate the event handler timing.',
  });

  await Bug.findByIdAndUpdate(bugs[0]._id, { $push: { comments: comment._id } });

  console.log('\nSeed complete:');
  console.log(`  Users:    ${await User.countDocuments()}`);
  console.log(`  Bugs:     ${await Bug.countDocuments()}`);
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
