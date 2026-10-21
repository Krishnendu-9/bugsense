import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer, stopTestServer, createUser, Bug } from './helpers.js';
import { getPrimaryClientUrl } from '../utils/clientOrigins.js';

let server;
let port;
let request;
let reporter;
let otherReporter;
let developer;
let admin;

const auth = (session) => ({ Authorization: `Bearer ${session.token}` });

const createBug = (session, body = {}) =>
  request
    .post('/api/bugs')
    .set(auth(session))
    .send({ title: 'Checkout button broken', description: '<p>Nothing happens</p>', ...body });

before(async () => {
  ({ server, port } = await startTestServer());
  request = supertest(server);
  reporter = await createUser(request, { role: 'reporter' });
  otherReporter = await createUser(request, { role: 'reporter' });
  developer = await createUser(request, { role: 'developer' });
  admin = await createUser(request, { role: 'admin' });
});

after(async () => {
  await stopTestServer(server);
});

describe('auth', () => {
  it('never grants admin through self-registration', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'mallory@test.dev', password: 'password123', role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'reporter');
  });

  it('reports a duplicate email as 409', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'MALLORY@test.dev', password: 'password123' });
    assert.equal(res.status, 409);
  });

  it('invalidates existing sessions when the password changes', async () => {
    const session = await createUser(request);
    const res = await request
      .put('/api/users/profile')
      .set(auth(session))
      .send({ currentPassword: session.password, newPassword: 'new-password-1' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'a fresh token is returned');

    const stale = await request.get('/api/auth/me').set(auth(session));
    assert.equal(stale.status, 401);

    const fresh = await request.get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
    assert.equal(fresh.status, 200);
  });
});

describe('developer sign-up and roles', () => {
  const signUp = (role, suffix) =>
    request
      .post('/api/auth/register')
      .send({ name: 'New Dev', email: `newdev-${suffix}@test.dev`, password: 'password123', role });

  it('allows developer sign-up outside production by default', async () => {
    const config = await request.get('/api/auth/config');
    assert.equal(config.body.developerSignup, true);

    const res = await signUp('developer', 'a');
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'developer');
  });

  it('refuses developer sign-up when ALLOW_DEVELOPER_SIGNUP=false', async () => {
    process.env.ALLOW_DEVELOPER_SIGNUP = 'false';
    try {
      const config = await request.get('/api/auth/config');
      assert.equal(config.body.developerSignup, false);

      assert.equal((await signUp('developer', 'b')).status, 403);
      assert.equal((await signUp('reporter', 'c')).body.user.role, 'reporter');
    } finally {
      delete process.env.ALLOW_DEVELOPER_SIGNUP;
    }
  });

  it('lets only admins change roles, never their own', async () => {
    const target = await createUser(request, { role: 'reporter' });
    const url = `/api/users/${target.user._id}/role`;

    assert.equal((await request.put(url).set(auth(developer)).send({ role: 'developer' })).status, 403);
    assert.equal((await request.put(url).set(auth(admin)).send({ role: 'superuser' })).status, 400);
    assert.equal(
      (await request.put(`/api/users/${admin.user._id}/role`).set(auth(admin)).send({ role: 'reporter' })).status,
      400
    );

    const promoted = await request.put(url).set(auth(admin)).send({ role: 'developer' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.role, 'developer');

    // The same token now carries staff rights, because roles are read per request.
    assert.equal((await request.get('/api/audit').set(auth(target))).status, 200);
  });

  it('lists users for admins only', async () => {
    assert.equal((await request.get('/api/users').set(auth(developer))).status, 403);
    const res = await request.get('/api/users').set(auth(admin));
    assert.equal(res.status, 200);
    assert.ok(res.body.every((u) => !('password' in u) && !('webhooks' in u)));
  });
});

describe('stored XSS', () => {
  it('strips scripts and event handlers from bug descriptions', async () => {
    const res = await createBug(reporter, {
      description: '<p>Hi</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>',
    });
    assert.equal(res.status, 201);
    assert.doesNotMatch(res.body.description, /onerror|<script|javascript:/i);
    assert.match(res.body.description, /<p>Hi<\/p>/);
  });

  it('stores telemetry descriptions as plain text', async () => {
    const res = await request
      .post('/api/telemetry/report')
      .send({ title: 'XSS probe', description: '<img src=x onerror=alert(1)>hello' });
    assert.equal(res.status, 201);
    const bug = await Bug.findById(res.body.bugId);
    assert.doesNotMatch(bug.description, /<img/i);
  });

  it('stores an SDK crash with no description as empty, not a placeholder sentence', async () => {
    const res = await request.post('/api/telemetry/report').send({ errorLog: 'Error: no description sent\n at x (a.js:1:1)' });
    assert.equal(res.status, 201);
    const bug = await Bug.findById(res.body.bugId);
    assert.equal(bug.description, '');
  });

  it('still requires a description on a person’s report', async () => {
    const res = await createBug(reporter, { description: '' });
    assert.equal(res.status, 400);
  });
});

describe('bug permissions and validation', () => {
  it('rejects operator objects in list filters', async () => {
    const res = await request.get('/api/bugs?status[$ne]=open').set(auth(reporter));
    assert.equal(res.status, 400);
  });

  it('caps the page size', async () => {
    const res = await request.get('/api/bugs?limit=100000').set(auth(reporter));
    assert.equal(res.status, 200);
    assert.equal(res.body.limit, 100);
  });

  it('returns 404 for a malformed id instead of a 500', async () => {
    const res = await request.get('/api/bugs/not-an-id').set(auth(reporter));
    assert.equal(res.status, 404);
  });

  it('forces reporter-created bugs to start open and unassigned', async () => {
    const res = await createBug(reporter, { status: 'resolved', assignedTo: developer.user._id });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'open');
    assert.equal(res.body.assignedTo, null);
  });

  it('does not let a reporter change another reporter\'s screenshot', async () => {
    const bug = (await createBug(reporter)).body;
    const res = await request
      .post(`/api/bugs/${bug._id}/screenshot`)
      .set(auth(otherReporter))
      .attach('screenshot', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'x.png', contentType: 'image/png' });
    assert.equal(res.status, 403);
  });

  it('rejects non-image uploads with 400', async () => {
    const bug = (await createBug(reporter)).body;
    const res = await request
      .post(`/api/bugs/${bug._id}/screenshot`)
      .set(auth(reporter))
      .attach('screenshot', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    assert.equal(res.status, 400);
  });

  it('does not let a reporter overwrite AI insights on someone else\'s bug', async () => {
    const bug = (await createBug(reporter)).body;
    const res = await request
      .post('/api/ai/analyze')
      .set(auth(otherReporter))
      .send({ errorLog: 'TypeError: x is undefined', bugId: bug._id });
    assert.equal(res.status, 403);
  });

  it('labels offline analysis as heuristic', async () => {
    const res = await request
      .post('/api/ai/analyze')
      .set(auth(reporter))
      .send({ errorLog: 'TypeError: Cannot read properties of undefined' });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'heuristic');
  });

  it('never invents a patch when the AI is unavailable', async () => {
    const res = await request
      .post('/api/ai/generate-patch')
      .set(auth(developer))
      .send({ errorLog: 'TypeError: boom\n    at run (src/app.js:10:5)' });
    assert.equal(res.status, 200);
    assert.equal(res.body.diff, '');
    assert.equal(res.body.source, 'unavailable');
  });

  it('only lets staff assign bugs, and only to staff', async () => {
    const bug = (await createBug(reporter)).body;

    const byReporter = await request.put(`/api/bugs/${bug._id}`).set(auth(reporter)).send({ assignedTo: developer.user._id });
    assert.equal(byReporter.status, 403);

    const toReporter = await request.put(`/api/bugs/${bug._id}`).set(auth(developer)).send({ assignedTo: reporter.user._id });
    assert.equal(toReporter.status, 400);

    const ok = await request.put(`/api/bugs/${bug._id}`).set(auth(developer)).send({ assignedTo: developer.user._id });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.assignedTo._id, developer.user._id);
  });

  it('only lets admins delete bugs', async () => {
    const bug = (await createBug(reporter)).body;
    assert.equal((await request.delete(`/api/bugs/${bug._id}`).set(auth(developer))).status, 403);
    assert.equal((await request.delete(`/api/bugs/${bug._id}`).set(auth(admin))).status, 200);
    assert.equal(await Bug.exists({ _id: bug._id }), null);
  });

  it('restricts GitHub export to staff and validates the repository', async () => {
    const bug = (await createBug(reporter)).body;

    const byReporter = await request
      .post(`/api/bugs/${bug._id}/github`)
      .set(auth(reporter))
      .send({ repoOwner: 'octo', repoName: 'repo', githubToken: 'x' });
    assert.equal(byReporter.status, 403);

    const traversal = await request
      .post(`/api/bugs/${bug._id}/github`)
      .set(auth(developer))
      .send({ repoOwner: '../../user', repoName: 'repo', githubToken: 'x' });
    assert.equal(traversal.status, 400);
  });

  it('uses the server GitHub token only for allowlisted repositories', async () => {
    const bug = (await createBug(reporter)).body;
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, authorization: init.headers.Authorization });
      return new Response(JSON.stringify({ html_url: 'https://github.com/octo/allowed/issues/7', number: 7 }), { status: 201 });
    };
    process.env.GITHUB_TOKEN = 'server-token';
    process.env.GITHUB_ALLOWED_REPOS = 'Octo/Allowed';

    try {
      const exportTo = (body) => request.post(`/api/bugs/${bug._id}/github`).set(auth(developer)).send(body);

      const denied = await exportTo({ repoOwner: 'octo', repoName: 'other' });
      assert.equal(denied.status, 400);
      assert.equal(calls.length, 0, 'GitHub is never called for a repo outside the allowlist');

      const ownToken = await exportTo({ repoOwner: 'octo', repoName: 'other', githubToken: 'user-token' });
      assert.equal(ownToken.status, 200);
      assert.equal(calls.at(-1).authorization, 'Bearer user-token');

      const allowed = await exportTo({ repoOwner: 'octo', repoName: 'allowed' });
      assert.equal(allowed.status, 200);
      assert.equal(calls.at(-1).authorization, 'Bearer server-token');

      const config = await request.get('/api/bugs/github-config').set(auth(developer));
      assert.deepEqual(config.body.repos, ['Octo/Allowed']);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_ALLOWED_REPOS;
    }
  });
});

describe('editing bugs', () => {
  const update = (session, bugId, body) => request.put(`/api/bugs/${bugId}`).set(auth(session)).send(body);

  it('lets the reporter edit the content of their own bug, normalised and sanitised', async () => {
    const bug = (await createBug(reporter)).body;
    const res = await update(reporter, bug._id, {
      title: '  Checkout total shows NaN  ',
      description: '<p>Updated</p><img src=x onerror=alert(1)>',
      steps: ['  Add item ', '', 42, { evil: true }],
      tags: ['Checkout', 'checkout', ' UI '],
      severity: 'major',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Checkout total shows NaN');
    assert.equal(res.body.description, '<p>Updated</p>');
    assert.deepEqual(res.body.steps, ['Add item', '42']);
    assert.deepEqual(res.body.tags, ['checkout', 'ui']);
    assert.equal(res.body.severity, 'major');
  });

  it('rejects malformed or empty content', async () => {
    const bug = (await createBug(reporter)).body;
    assert.equal((await update(reporter, bug._id, { steps: 'not a list' })).status, 400);
    assert.equal((await update(reporter, bug._id, { title: '   ' })).status, 400);
    assert.equal((await update(reporter, bug._id, { description: '<script>x</script>' })).status, 400);
    assert.equal((await update(reporter, bug._id, { title: { $ne: 1 } })).status, 400);
  });

  it('does not let a reporter edit someone else\'s bug', async () => {
    const bug = (await createBug(reporter)).body;
    assert.equal((await update(otherReporter, bug._id, { title: 'Hijacked' })).status, 403);
  });

  it('lets a reporter close and reopen their bug, but not triage it', async () => {
    const bug = (await createBug(reporter)).body;

    assert.equal((await update(reporter, bug._id, { status: 'in-progress' })).status, 403);
    assert.equal((await update(reporter, bug._id, { status: 'resolved' })).status, 403);
    assert.equal((await update(reporter, bug._id, { priority: 'critical' })).status, 403);

    const closed = await update(reporter, bug._id, { status: 'closed', statusNote: 'Works after the update' });
    assert.equal(closed.status, 200);

    const reopened = await update(reporter, bug._id, { status: 'open' });
    assert.equal(reopened.status, 200);

    const history = reopened.body.statusHistory;
    assert.deepEqual(history.map((h) => h.status), ['closed', 'open']);
    assert.equal(history[0].note, 'Works after the update');
    assert.equal(history[0].changedBy._id, reporter.user._id);
  });

  it('lets staff move a bug through the whole workflow and change priority', async () => {
    const bug = (await createBug(reporter)).body;
    for (const status of ['in-progress', 'resolved', 'closed', 'open']) {
      assert.equal((await update(developer, bug._id, { status })).status, 200);
    }
    const res = await update(developer, bug._id, { priority: 'critical' });
    assert.equal(res.body.priority, 'critical');
    assert.equal(res.body.statusHistory.length, 4);
  });

  it('accepts an unchanged priority and status from a reporter (full-form saves)', async () => {
    const bug = (await createBug(reporter, { priority: 'high' })).body;
    const res = await update(reporter, bug._id, { priority: 'high', status: 'open', title: 'Renamed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.statusHistory.length, 0);
  });
});

describe('automatic analysis of new reports', () => {
  const waitFor = async (check, timeoutMs = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = await check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  };

  it('analyses the error log in the background and stores a labelled result', async () => {
    const res = await createBug(reporter, { errorLog: "TypeError: Cannot read properties of undefined (reading 'id')" });
    assert.equal(res.status, 201);
    assert.equal(res.body.analysisQueued, true);

    const analysed = await waitFor(async () => {
      const bug = await Bug.findById(res.body._id);
      return bug.aiInsights?.possibleCause ? bug : null;
    });
    assert.ok(analysed, 'insights were saved');
    assert.equal(analysed.aiInsights.source, 'heuristic');
  });

  it('skips analysis without an error log or once the hourly budget is spent', async () => {
    assert.equal((await createBug(reporter)).body.analysisQueued, false);

    process.env.REPORT_AI_HOURLY_BUDGET = '0';
    try {
      const res = await createBug(reporter, { errorLog: 'Error: over budget' });
      assert.equal(res.body.analysisQueued, false);
    } finally {
      delete process.env.REPORT_AI_HOURLY_BUDGET;
    }
  });
});

describe('comments', () => {
  const addComment = (session, bugId, content = 'Seeing this too') =>
    request.post('/api/comments').set(auth(session)).send({ bugId, content });

  it('adds a comment to a bug and links it', async () => {
    const bug = (await createBug(reporter)).body;
    const res = await addComment(otherReporter, bug._id);
    assert.equal(res.status, 201);
    assert.equal(res.body.author.name, otherReporter.user.name);
    assert.deepEqual((await Bug.findById(bug._id)).comments.map(String), [res.body._id]);
  });

  it('rejects comments on missing bugs, empty and oversized comments', async () => {
    const bug = (await createBug(reporter)).body;
    assert.equal((await addComment(reporter, '64b000000000000000000000')).status, 404);
    assert.equal((await addComment(reporter, 'not-an-id')).status, 404);
    assert.equal((await addComment(reporter, bug._id, '   ')).status, 400);
    assert.equal((await addComment(reporter, bug._id, 'x'.repeat(2001))).status, 400);
  });

  it('lets only the author or an admin delete a comment', async () => {
    const bug = (await createBug(reporter)).body;
    const comment = (await addComment(otherReporter, bug._id)).body;
    const remove = (session) => request.delete(`/api/comments/${comment._id}`).set(auth(session));

    assert.equal((await remove(reporter)).status, 403, 'the bug reporter is not the comment author');
    assert.equal((await remove(developer)).status, 403, 'developers cannot delete other people\'s comments');
    assert.equal((await remove(otherReporter)).status, 200);
    assert.deepEqual((await Bug.findById(bug._id)).comments, []);

    const another = (await addComment(otherReporter, bug._id)).body;
    assert.equal((await request.delete(`/api/comments/${another._id}`).set(auth(admin))).status, 200);
  });
});

describe('profile', () => {
  it('updates the display name and rejects a blank one', async () => {
    const session = await createUser(request);
    const renamed = await request.put('/api/users/profile').set(auth(session)).send({ name: '  Grace Hopper ' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, 'Grace Hopper');
    assert.equal(renamed.body.token, undefined, 'no new token without a password change');

    assert.equal((await request.put('/api/users/profile').set(auth(session)).send({ name: '   ' })).status, 400);
  });

  it('requires the correct current password to change it', async () => {
    const session = await createUser(request);
    const put = (body) => request.put('/api/users/profile').set(auth(session)).send(body);

    assert.equal((await put({ newPassword: 'another-pass' })).status, 400);
    assert.equal((await put({ currentPassword: 'wrong-pass', newPassword: 'another-pass' })).status, 400);
    assert.equal((await put({ currentPassword: session.password, newPassword: '123' })).status, 400);

    const login = await request.post('/api/auth/login').send({ email: session.email, password: session.password });
    assert.equal(login.status, 200, 'failed attempts left the password unchanged');
  });

  it('replaces the avatar and deletes the previous file', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { UPLOADS_DIR } = await import('../utils/uploads.js');
    const session = await createUser(request);
    const upload = () => request.post('/api/users/avatar').set(auth(session))
      .attach('avatar', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'me.png', contentType: 'image/png' });

    const first = await upload();
    assert.equal(first.status, 200);
    const firstFile = path.join(UPLOADS_DIR, path.basename(first.body.avatar));
    assert.ok(fs.existsSync(firstFile));

    const second = await upload();
    assert.notEqual(second.body.avatar, first.body.avatar);
    assert.ok(!fs.existsSync(firstFile), 'the replaced avatar is removed from disk');
  });
});

describe('audit trail', () => {
  const findLog = async (query) => {
    const { default: AuditLog } = await import('../models/AuditLog.model.js');
    // logActivity is fire-and-forget, so give the write a moment to land.
    for (let i = 0; i < 40; i += 1) {
      const log = await AuditLog.findOne(query).sort({ createdAt: -1 });
      if (log) return log;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  };

  it('records sign-ups, failed sign-ins and password changes, never the password', async () => {
    const email = 'audited@test.dev';
    const registered = await request.post('/api/auth/register').send({ name: 'Audited', email, password: 'password123' });
    assert.ok(await findLog({ action: 'USER_REGISTERED', entityId: registered.body.user._id }));

    await request.post('/api/auth/login').send({ email, password: 'guess-attempt-9' });
    const failed = await findLog({ action: 'LOGIN_FAILED', entityId: registered.body.user._id });
    assert.ok(failed);
    assert.ok(!JSON.stringify(failed).includes('guess-attempt-9'));

    const session = { token: registered.body.token };
    await request.put('/api/users/profile').set(auth(session)).send({ currentPassword: 'password123', newPassword: 'password456' });
    assert.ok(await findLog({ action: 'PASSWORD_CHANGED', entityId: registered.body.user._id }));
  });

  it('records comments against the bug they belong to', async () => {
    const bug = (await createBug(reporter)).body;
    const comment = (await request.post('/api/comments').set(auth(developer)).send({ bugId: bug._id, content: 'On it' })).body;
    const added = await findLog({ action: 'COMMENT_ADDED', entityId: bug._id });
    assert.equal(added.entityType, 'comment');
    assert.equal(added.metadata.commentId, comment._id);

    await request.delete(`/api/comments/${comment._id}`).set(auth(developer));
    assert.ok(await findLog({ action: 'COMMENT_DELETED', entityId: bug._id }));
  });

  it('does not label an unanalysed bug as model output', async () => {
    const bug = (await createBug(reporter)).body;
    assert.equal((await Bug.findById(bug._id)).aiInsights?.source, undefined);
  });
});

describe('manual reports', () => {
  it('never merges a manual report into an existing incident', async () => {
    const errorLog = 'RangeError: Maximum call stack size exceeded\n    at loop (src/loop.js:3:1)';
    const first = await createBug(reporter, { title: 'Stack overflow A', errorLog });
    const second = await createBug(otherReporter, { title: 'Stack overflow B', errorLog, description: '<p>Mine</p>' });

    assert.equal(second.status, 201);
    assert.notEqual(second.body._id, first.body._id);
    assert.equal(second.body.description, '<p>Mine</p>');
    assert.equal(second.body.possibleDuplicateOf._id, first.body._id);
  });
});

describe('staff-only endpoints', () => {
  for (const path of ['/api/audit', '/api/health/metrics', '/api/users/assignable']) {
    it(`${path} is closed to reporters and open to developers`, async () => {
      assert.equal((await request.get(path)).status, 401);
      assert.equal((await request.get(path).set(auth(reporter))).status, 403);
      assert.equal((await request.get(path).set(auth(developer))).status, 200);
    });
  }
});

describe('trend statistics', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const trends = async () => (await request.get('/api/bugs/stats/trends').set(auth(reporter))).body;

  it("ends the open-by-day series on the dashboard's live open count", async () => {
    const [series, stats] = await Promise.all([
      trends(),
      request.get('/api/bugs/stats').set(auth(reporter)).then((r) => r.body),
    ]);
    assert.equal(series.openByDay.timezone, 'UTC');
    assert.equal(series.openByDay.days.length, 7);
    assert.equal(series.openByDay.days.at(-1).open, stats.open);
  });

  it('places a backdated bug on exactly the days it was open', async () => {
    const start = await trends();

    // Created five days ago, picked up three days ago. createdAt is immutable
    // through Mongoose, so the history is written with the raw driver.
    const created = await createBug(reporter, { title: 'Backdated trend fixture' });
    const now = Date.now();
    await Bug.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(created.body._id) },
      {
        $set: {
          createdAt: new Date(now - 5 * DAY),
          status: 'in-progress',
          statusHistory: [{ status: 'in-progress', changedAt: new Date(now - 3 * DAY), note: '' }],
        },
      }
    );

    const end = await trends();
    const delta = end.openByDay.days.map((day, i) => day.open - start.openByDay.days[i].open);
    // Oldest first: six days ago (not yet created), five and four days ago
    // (open), then in progress from three days ago onward.
    assert.deepEqual(delta, [0, 1, 1, 0, 0, 0, 0]);
  });

  it('counts a bug once by its first resolution, and never counts a closure', async () => {
    const setStatus = (id, status) =>
      request.put(`/api/bugs/${id}`).set(auth(developer)).send({ status });
    const before = await trends();
    const start = before.timeToResolve;

    const fixed = (await createBug(reporter, { title: 'Resolved, regressed, resolved again' })).body._id;
    for (const status of ['resolved', 'open', 'resolved']) {
      assert.equal((await setStatus(fixed, status)).status, 200);
    }
    const dismissed = (await createBug(reporter, { title: 'Closed without a fix' })).body._id;
    assert.equal((await setStatus(dismissed, 'closed')).status, 200);

    const after = await trends();
    const end = after.timeToResolve;
    assert.equal(end.sampleSize - start.sampleSize, 1);
    // Resolved twice this week is one bug resolved; the closure is none.
    assert.equal(after.resolvedInWindow.count - before.resolvedInWindow.count, 1);
    assert.equal(typeof end.medianMs, 'number');
  });
});

describe('dashboard statistics', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const stats = async () => (await request.get('/api/bugs/stats').set(auth(reporter))).body;

  it('counts named projects, not bugs and not the empty default', async () => {
    const start = await stats();
    const project = `Overview fixture ${Date.now()}`;
    assert.equal((await createBug(reporter, { project })).status, 201);
    assert.equal((await createBug(reporter, { project })).status, 201);
    assert.equal((await createBug(reporter, {})).status, 201);
    const end = await stats();
    assert.equal(end.projects - start.projects, 1);
    assert.equal(end.total - start.total, 3);
    // The delta alone cannot see the empty default being counted: earlier
    // tests already left project-less bugs behind, so it would be counted at
    // both ends and cancel out. Compare the absolute figure as well.
    const named = (await Bug.distinct('project')).filter((name) => name !== '' && name !== null);
    assert.equal(end.projects, named.length);

    // The names come too, sorted, with the empty default left out.
    assert.ok(end.projectNames.includes(project));
    assert.equal(end.projectNames.length, end.projects);
    assert.ok(!end.projectNames.includes(''));
    assert.deepEqual(end.projectNames, [...end.projectNames].sort((a, b) => a.localeCompare(b)));
  });

  it('lists project names alphabetically, not in byte order', async () => {
    // MongoDB's distinct returns byte order, which puts every capitalised name
    // before every lower-case one; a person scanning a dropdown expects A-Z.
    const tag = Date.now();
    await createBug(reporter, { project: `Zebra ${tag}` });
    await createBug(reporter, { project: `apple ${tag}` });
    const names = (await stats()).projectNames;
    assert.ok(names.indexOf(`apple ${tag}`) < names.indexOf(`Zebra ${tag}`), names.join(' | '));
  });

  it('reports when the longest-waiting open bug was created', async () => {
    const created = await createBug(reporter, { title: 'Oldest open fixture' });
    const longAgo = new Date(Date.now() - 40 * DAY);
    await Bug.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(created.body._id) },
      { $set: { createdAt: longAgo } }
    );
    assert.equal((await stats()).oldestOpenAt, longAgo.toISOString());
  });

  it('lists recent bugs by latest activity, with the fields the table needs', async () => {
    const first = (await createBug(reporter, { title: 'Recent fixture A', project: 'Recent fixtures' })).body._id;
    const second = (await createBug(reporter, { title: 'Recent fixture B' })).body._id;
    // Touch the older bug: it must move above the newer one.
    const touched = await request
      .put(`/api/bugs/${first}`)
      .set(auth(developer))
      .send({ priority: 'high', assignedTo: developer.user._id });
    assert.equal(touched.status, 200);

    const { recent } = await stats();
    assert.deepEqual(recent.slice(0, 2).map((bug) => bug._id), [first, second]);
    const row = recent[0];
    assert.equal(row.project, 'Recent fixtures');
    assert.equal(row.assignedTo.name, developer.user.name);
    assert.equal(row.source, 'manual');
    assert.equal(row.occurrences, 1);
    assert.ok(row.updatedAt);
  });
});

describe('bug list', () => {
  const sdkReport = (body) => request.post('/api/telemetry/report').send(body);
  const list = async (query) => (await request.get(`/api/bugs?${query}`).set(auth(reporter))).body;

  it('filters by source: a person or the SDK', async () => {
    const tag = `src${Date.now()}`;
    assert.equal((await createBug(reporter, { title: `Typed by a person ${tag}` })).status, 201);
    assert.equal((await sdkReport({ title: `Thrown in a browser ${tag}`, errorLog: `Error: ${tag}\n    at boom (x.js:1:1)` })).status, 201);

    const sdk = await list(`source=sdk&search=${tag}`);
    const manual = await list(`source=manual&search=${tag}`);
    assert.deepEqual(sdk.bugs.map((b) => b.source), ['sdk']);
    assert.deepEqual(manual.bugs.map((b) => b.source), ['manual']);
    assert.equal((await list(`search=${tag}`)).total, 2);

    const bad = await request.get('/api/bugs?source=robot').set(auth(reporter));
    assert.equal(bad.status, 400);
  });

  it('orders the list by last activity, so the Updated column reads in order', async () => {
    const tag = `order${Date.now()}`;
    const older = (await createBug(reporter, { title: `Older ${tag}` })).body._id;
    const newer = (await createBug(reporter, { title: `Newer ${tag}` })).body._id;
    // Activity on the older bug moves it above the newer one.
    assert.equal((await request.put(`/api/bugs/${older}`).set(auth(developer)).send({ priority: 'high' })).status, 200);

    const { bugs } = await list(`search=${tag}`);
    assert.deepEqual(bugs.map((b) => b._id), [older, newer]);

    const page = (await list('limit=50')).bugs.map((b) => new Date(b.updatedAt).getTime());
    assert.deepEqual(page, [...page].sort((a, b) => b - a));
  });

  it('gives SDK rows their top frame and never sends an error log to a list', async () => {
    const tag = `frame${Date.now()}`;
    await sdkReport({
      title: `Frame fixture ${tag}`,
      errorLog: `TypeError: ${tag}\n    at handleClick (app.js:10:5)\n    at dispatch (react.js:2:2)`,
    });
    await createBug(reporter, { title: `Manual frame fixture ${tag}`, errorLog: 'Error: pasted\n    at somewhere (z.js:1:1)' });

    const { bugs } = await list(`search=${tag}`);
    const sdkRow = bugs.find((b) => b.source === 'sdk');
    const manualRow = bugs.find((b) => b.source === 'manual');
    assert.equal(sdkRow.topFrame, 'at handleClick (app.js:10:5)');
    assert.equal(manualRow.topFrame, null);
    for (const row of bugs) assert.equal('errorLog' in row, false, 'a list row carried its error log');
  });

  it('leaves the SDK 1.4.0 message and component stack out of list rows', async () => {
    const tag = `slim${Date.now()}`;
    await sdkReport({
      title: `Slim fixture ${tag}`,
      errorLog: `TypeError: ${tag}\n    at render (app.js:3:3)`,
      error: { name: 'TypeError', message: tag },
      componentStack: '\n    at Table\n    at Page',
    });
    const { bugs } = await list(`search=${tag}`);
    assert.equal(bugs.length, 1);
    assert.equal('componentStack' in bugs[0], false, 'a list row carried its component stack');
    assert.equal('errorMessage' in bugs[0], false, 'a list row carried its error message');
  });
});

describe('webhooks', () => {
  it('refuses to call arbitrary URLs (SSRF)', async () => {
    for (const url of ['http://169.254.169.254/latest/meta-data', 'https://discord.com.evil.test/api/webhooks/1', 'http://localhost:5000']) {
      const res = await request.post('/api/users/webhooks/test').set(auth(reporter)).send({ type: 'discord', url });
      assert.equal(res.status, 400, url);
    }
  });

  it('refuses to save non-Slack/Discord URLs', async () => {
    const res = await request
      .put('/api/users/webhooks')
      .set(auth(reporter))
      .send({ slackUrl: 'http://10.0.0.1/hook' });
    assert.equal(res.status, 400);
  });
});

describe('telemetry', () => {
  const report = (body) => request.post('/api/telemetry/report').send(body);

  it('deduplicates concurrent reports into one incident without losing counts', async () => {
    const payload = { title: 'Concurrent failure', errorLog: 'Error: race\n    at a (a.js:1:1)', project: 'race-test' };
    const results = await Promise.all(Array.from({ length: 8 }, () => report(payload)));
    assert.ok(results.every((r) => r.status === 200 || r.status === 201));

    const bugs = await Bug.find({ project: 'race-test' });
    assert.equal(bugs.length, 1);
    assert.equal(bugs[0].occurrences, 8);
  });

  it('measures deduplication over SDK reports only, as one population', async () => {
    // The database is shared across this file, so this works in deltas.
    const telemetry = async () =>
      (await request.get('/api/health/metrics').set(auth(developer))).body.telemetry;

    const start = await telemetry();
    const payload = { title: 'Metrics pair', errorLog: 'Error: pair\n    at m (m.js:1:1)', project: 'metrics-pair' };
    for (let i = 0; i < 3; i += 1) await report(payload);
    // A manual report in the same window must move neither half of the pair.
    assert.equal((await createBug(reporter, { title: 'Manual report, never grouped' })).status, 201);
    const end = await telemetry();

    assert.equal(end.sdkCrashesReceived - start.sdkCrashesReceived, 3);
    assert.equal(end.sdkIncidents - start.sdkIncidents, 1);
    assert.equal(end.duplicatesMerged - start.duplicatesMerged, 2);
    assert.equal(end.duplicatesMerged, end.sdkCrashesReceived - end.sdkIncidents);
    assert.equal(typeof end.dedupRate, 'number');
  });

  it('reopens a resolved incident as a regression', async () => {
    const payload = { title: 'Regressing failure', errorLog: 'Error: back again\n    at b (b.js:1:1)', project: 'regress-test' };
    const created = await report(payload);
    await Bug.updateOne({ _id: created.body.bugId }, { status: 'resolved' });

    await report(payload);
    const bug = await Bug.findById(created.body.bugId);
    assert.equal(bug.status, 'in-progress');
    assert.match(bug.statusHistory.at(-1).note, /Regression/);
  });

  it('clamps oversized fields and coerces invalid enums instead of failing', async () => {
    const res = await report({
      title: 'x'.repeat(500),
      errorLog: 'Error: big',
      priority: 'urgent!!',
      severity: 'catastrophic',
      breadcrumbs: Array.from({ length: 100 }, (_, i) => ({ category: 'bogus', message: `crumb ${i}`, data: { $where: 1 } })),
    });
    assert.equal(res.status, 201);

    const bug = await Bug.findById(res.body.bugId);
    assert.equal(bug.title.length, 200);
    assert.equal(bug.priority, 'high');
    assert.equal(bug.severity, 'major');
    assert.equal(bug.breadcrumbs.length, 30);
    assert.equal(bug.breadcrumbs[0].category, 'console');
    assert.deepEqual(bug.breadcrumbs[0].data, {});
  });

  // SDK 1.4.0 fields: docs/fingerprint-eval-v2.md, Amendment 1, P15-P16.
  it('stores the SDK 1.4.0 fields, clamped to their caps', async () => {
    const res = await report({
      title: 'v2 SDK report',
      errorLog: 'TypeError: big\n    at f (https://shop.example/app.js:1:1)',
      sdkVersion: '1.4.0'.repeat(20),
      error: { name: 'N'.repeat(500), message: 'm'.repeat(5000) },
      request: { method: 'G'.repeat(40), url: `/api/${'u'.repeat(3000)}`, status: 404 },
      source: { filename: `https://cdn.example/${'f'.repeat(3000)}.js`, lineno: 12, colno: 5 },
      componentStack: 'c'.repeat(10000),
    });
    assert.equal(res.status, 201);

    const bug = await Bug.findById(res.body.bugId);
    assert.equal(bug.source, 'sdk');
    assert.equal(bug.errorName.length, 100);
    assert.equal(bug.errorMessage.length, 1000);
    assert.equal(bug.request.method.length, 16);
    assert.equal(bug.request.url.length, 2000);
    assert.equal(bug.request.status, 404);
    assert.equal(bug.errorLocation.filename.length, 2000);
    assert.equal(bug.errorLocation.lineno, 12);
    assert.equal(bug.errorLocation.colno, 5);
    assert.equal(bug.componentStack.length, 5000);
    assert.equal('sdkVersion' in bug.toObject(), false);
  });

  it('turns SDK 1.4.0 fields of the wrong shape into nulls instead of failing', async () => {
    const res = await report({
      title: 'Hostile v2 fields',
      errorLog: 'Error: hostile',
      error: { name: 7, message: 'kept' },
      request: { method: ['GET'], url: '/api/x', status: '404' },
      source: { filename: { $gt: '' }, lineno: -1, colno: 1.5 },
      componentStack: { $where: 'sleep(1000)' },
    });
    assert.equal(res.status, 201);

    const bug = await Bug.findById(res.body.bugId);
    assert.equal(bug.errorName, null);
    assert.equal(bug.errorMessage, 'kept');
    assert.deepEqual(bug.request.toObject(), { method: '', url: '/api/x', status: null });
    assert.deepEqual(bug.errorLocation.toObject(), { filename: '', lineno: null, colno: null });
    assert.equal(bug.componentStack, '');

    const shapes = [{ error: 'boom' }, { error: { message: 42 } }, { request: ['x'] }, { request: { url: 5 } }, { source: 42 }];
    for (const [i, body] of shapes.entries()) {
      // A distinct error each time, so none is grouped as a repeat of another
      // (in letters: the key in use normalises digits away).
      const name = 'abcde'[i];
      const r = await report({ title: `Wrong shape ${name}`, errorLog: `Error: shape ${name}`, ...body });
      assert.equal(r.status, 201, JSON.stringify(body));
      const b = await Bug.findById(r.body.bugId);
      assert.equal(b.errorMessage, null);
      assert.equal(b.request, null);
      assert.equal(b.errorLocation, null);
    }
  });

  it('stores an older SDK report exactly as before, with the new fields empty', async () => {
    const res = await report({ title: 'Old SDK shape', errorLog: 'Error: old\n    at o (o.js:1:1)', project: 'old-sdk' });
    const bug = await Bug.findById(res.body.bugId);
    assert.equal(bug.title, 'Old SDK shape');
    assert.equal(bug.errorLog, 'Error: old\n    at o (o.js:1:1)');
    assert.equal(bug.errorName, null);
    assert.equal(bug.errorMessage, null);
    assert.equal(bug.request, null);
    assert.equal(bug.errorLocation, null);
    assert.equal(bug.componentStack, '');
  });

  it('never lets a public report claim critical priority or blocker severity', async () => {
    const res = await report({ title: 'Escalation attempt', errorLog: 'Error: loud', priority: 'critical', severity: 'blocker' });
    const bug = await Bug.findById(res.body.bugId);
    assert.equal(bug.priority, 'high');
    assert.equal(bug.severity, 'major');
  });

  it('requires the ingest key when one is configured', async () => {
    process.env.TELEMETRY_INGEST_KEY = 'secret-key';
    try {
      assert.equal((await report({ title: 'keyed' })).status, 401);
      const ok = await request.post('/api/telemetry/report').set('X-BugSense-Key', 'secret-key').send({ title: 'keyed' });
      assert.equal(ok.status, 201);
    } finally {
      delete process.env.TELEMETRY_INGEST_KEY;
    }
  });

  it('allows cross-origin SDK requests', async () => {
    const res = await request
      .options('/api/telemetry/report')
      .set('Origin', 'https://customer-site.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-bugsense-key');
    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'https://customer-site.example');
  });
});

describe('SDK script CORS', () => {
  const customer = 'https://customer-site.example';

  it('serves the SDK to any origin, without credentials', async () => {
    const res = await request.get('/sdk/bugsense.js').set('Origin', customer);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /javascript/);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers['access-control-allow-credentials'], undefined);
  });

  it('gives the dashboard origin the same header, not its credentialed policy', async () => {
    const res = await request.get('/sdk/bugsense.js').set('Origin', getPrimaryClientUrl());
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers['access-control-allow-credentials'], undefined);
  });

  it('does not widen CORS on the API', async () => {
    const foreign = await request.get('/api/health').set('Origin', customer);
    assert.equal(foreign.status, 200);
    assert.equal(foreign.headers['access-control-allow-origin'], undefined);

    const dashboard = await request.get('/api/health').set('Origin', getPrimaryClientUrl());
    assert.equal(dashboard.headers['access-control-allow-origin'], getPrimaryClientUrl());
    assert.equal(dashboard.headers['access-control-allow-credentials'], 'true');
  });

  it('does not widen CORS on uploads', async () => {
    const res = await request.get('/uploads/missing.png').set('Origin', customer);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});

describe('upload storage', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it('keeps uploads on local disk when Cloudinary is not configured', async () => {
    const bug = (await createBug(reporter)).body;
    const res = await request.post(`/api/bugs/${bug._id}/screenshot`).set(auth(reporter))
      .attach('screenshot', png, { filename: 'x.png', contentType: 'image/png' });
    assert.equal(res.status, 200);
    assert.match(res.body.screenshot, /^\/uploads\/\d+-\d+\.png$/);
  });

  it('moves uploads to Cloudinary when CLOUDINARY_URL is set, and removes the replaced image', async () => {
    const { v2: cloudinary } = await import('cloudinary');
    const fs = await import('fs');
    const realUpload = cloudinary.uploader.upload;
    const realDestroy = cloudinary.uploader.destroy;
    const uploaded = [];
    const destroyed = [];
    let n = 0;
    cloudinary.uploader.upload = async (path, options) => {
      uploaded.push({ path, options, existedLocally: fs.existsSync(path) });
      n += 1;
      return { secure_url: `https://res.cloudinary.com/demo/image/upload/v1/bugsense/shot-${n}.png` };
    };
    cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); return { result: 'ok' }; };
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';

    try {
      const bug = (await createBug(reporter)).body;
      const send = () => request.post(`/api/bugs/${bug._id}/screenshot`).set(auth(reporter))
        .attach('screenshot', png, { filename: 'x.png', contentType: 'image/png' });

      const first = await send();
      assert.equal(first.status, 200);
      assert.equal(first.body.screenshot, 'https://res.cloudinary.com/demo/image/upload/v1/bugsense/shot-1.png');
      assert.equal(uploaded[0].options.folder, 'bugsense');
      assert.ok(uploaded[0].existedLocally, 'Multer stored and validated the file first');
      assert.ok(!fs.existsSync(uploaded[0].path), 'the local copy is removed after upload');

      await send();
      assert.deepEqual(destroyed, ['bugsense/shot-1'], 'the replaced image is deleted from Cloudinary');
    } finally {
      cloudinary.uploader.upload = realUpload;
      cloudinary.uploader.destroy = realDestroy;
      delete process.env.CLOUDINARY_URL;
    }
  });

  it('reports a Cloudinary outage as 502 and leaves no local file behind', async () => {
    const { v2: cloudinary } = await import('cloudinary');
    const fs = await import('fs');
    const realUpload = cloudinary.uploader.upload;
    let localPath;
    cloudinary.uploader.upload = async (path) => { localPath = path; throw new Error('network down'); };
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';

    try {
      const bug = (await createBug(reporter)).body;
      const res = await request.post(`/api/bugs/${bug._id}/screenshot`).set(auth(reporter))
        .attach('screenshot', png, { filename: 'x.png', contentType: 'image/png' });
      assert.equal(res.status, 502);
      assert.ok(!fs.existsSync(localPath));
      assert.equal((await Bug.findById(bug._id)).screenshot, '');
    } finally {
      cloudinary.uploader.upload = realUpload;
      delete process.env.CLOUDINARY_URL;
    }
  });
});

describe('alerts', () => {
  it('sends operator channels only critical, blocker and regression alerts, never following redirects', async () => {
    const { dispatchWebhookAlert } = await import('../services/webhook.service.js');
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, redirect: init.redirect });
      return new Response(null, { status: 204 });
    };
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/abc';

    try {
      const base = { _id: '64b000000000000000000001', title: 'Alert test', status: 'open', occurrences: 1 };
      await dispatchWebhookAlert({ ...base, priority: 'high', severity: 'major' }, 'created');
      assert.equal(calls.length, 0, 'an ordinary new bug does not page anyone');

      await dispatchWebhookAlert({ ...base, priority: 'critical', severity: 'minor' }, 'created');
      await dispatchWebhookAlert({ ...base, priority: 'low', severity: 'blocker' }, 'created');
      await dispatchWebhookAlert({ ...base, priority: 'low', severity: 'minor' }, 'regression');
      assert.equal(calls.length, 3);
      assert.ok(calls.every((c) => c.redirect === 'error'));
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.DISCORD_WEBHOOK_URL;
    }
  });
});

describe('socket.io', () => {
  const connect = (token) =>
    new Promise((resolve) => {
      const socket = ioClient(`http://localhost:${port}`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
      socket.on('connect', () => { socket.close(); resolve('connected'); });
      socket.on('connect_error', (err) => { socket.close(); resolve(err.message); });
    });

  it('rejects connections without a valid token', async () => {
    assert.equal(await connect(), 'unauthorized');
    assert.equal(await connect('garbage'), 'unauthorized');
  });

  it('accepts connections with a valid token', async () => {
    assert.equal(await connect(reporter.token), 'connected');
  });

  it('broadcasts a slim bug to everyone and the full bug only to its room', async () => {
    const bug = (await createBug(reporter, { errorLog: 'Error: secret stack' })).body;

    const open = () =>
      new Promise((resolve, reject) => {
        const socket = ioClient(`http://localhost:${port}`, { auth: { token: developer.token }, transports: ['websocket'], reconnection: false });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
      });
    const next = (socket, event) =>
      new Promise((resolve) => {
        const handler = (payload) => {
          if (payload._id !== bug._id) return;
          socket.off(event, handler);
          resolve(payload);
        };
        socket.on(event, handler);
      });

    const listViewer = await open();
    const detailViewer = await open();
    try {
      detailViewer.emit('join:bug', bug._id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const slim = next(listViewer, 'bug:updated');
      const full = next(detailViewer, 'bug:detail:updated');
      let leaked = false;
      listViewer.on('bug:detail:updated', () => { leaked = true; });

      await request.put(`/api/bugs/${bug._id}`).set(auth(developer)).send({ status: 'in-progress' });

      const [slimPayload, fullPayload] = await Promise.all([slim, full]);
      assert.equal(slimPayload.status, 'in-progress');
      assert.equal(slimPayload.errorLog, undefined);
      assert.equal(slimPayload.statusHistory, undefined);
      assert.equal(slimPayload.reporter.name, reporter.user.name, 'list payload is still populated');

      assert.equal(fullPayload.errorLog, 'Error: secret stack');
      assert.equal(fullPayload.statusHistory[0].changedBy.name, developer.user.name);
      assert.equal(leaked, false, 'only room members get the full document');
    } finally {
      listViewer.close();
      detailViewer.close();
    }
  });
});
