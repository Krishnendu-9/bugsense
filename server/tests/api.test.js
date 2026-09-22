import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer, stopTestServer, createUser, Bug } from './helpers.js';

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
});
