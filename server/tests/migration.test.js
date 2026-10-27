// The fingerprint v2 migration: docs/fingerprint-eval-v2.md, 8.3, and
// Amendment 1 (P20, P23-P33). Runs against a throwaway MongoDB.
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Bug from '../models/Bug.model.js';
import AuditLog from '../models/AuditLog.model.js';
import { generateFingerprintV1, generateFingerprintV2 } from '../utils/fingerprint.util.js';
import {
  MERGE_ACTION,
  MigrationRefused,
  RUN_ACTION,
  applyMigration,
  formatPlan,
  keyInputsOf,
  planMigration,
  uniqueIndexViolations,
} from '../services/fingerprintMigration.service.js';

let mongo;
before(async () => {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri('bugsense-migration-test');
  }
  await mongoose.connect(uri);
  await mongoose.connection.db.dropDatabase();
  await Bug.syncIndexes();
});
after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  await Bug.collection.deleteMany({});
  await AuditLog.collection.deleteMany({});
});

const BUNDLE = 'http://localhost:7110/assets/index-BOtVUl4o.js';
const day = (n) => new Date(Date.UTC(2026, 9, n, 12));
const UPDATED = day(18);

// A bug as stored before v2: a v1 key and no fingerprintVersion.
const v1Bug = ({ source = 'sdk', title, errorLog = '', project = 'Shop', ...rest }) => ({
  _id: new mongoose.Types.ObjectId(),
  source,
  title,
  errorLog,
  project,
  fingerprint: generateFingerprintV1(errorLog, title, project),
  occurrences: 1,
  status: 'open',
  priority: 'high',
  breadcrumbs: [],
  statusHistory: [],
  comments: [],
  firstSeenAt: day(1),
  lastSeenAt: day(10),
  createdAt: day(1),
  updatedAt: UPDATED,
  ...rest,
});
const insert = async (...bugs) => {
  await Bug.collection.insertMany(bugs);
  return bugs;
};
const raw = (id) => Bug.collection.findOne({ _id: id });
const snapshot = async () =>
  JSON.stringify([await Bug.collection.find().sort({ _id: 1 }).toArray(), await AuditLog.collection.countDocuments()]);

// One uncaught TypeError, stored as three v1 bugs that v2 sees as one: v1 split
// Chromium from Firefox (it read only V8 frames), and split a later build's
// report on its new chunk hash, which v2 strips. (Firefox and WebKit reports of
// one build already shared a v1 key, so they never were two v1 bugs.)
const BUNDLE_V2 = 'http://localhost:7110/assets/index-DvtLrm67.js';
const chromium = (over = {}) => v1Bug({
  title: "Uncaught TypeError: Cannot read properties of undefined (reading 'toFixed')",
  errorLog: `TypeError: Cannot read properties of undefined (reading 'toFixed')\n    at Ii (${BUNDLE}:17:8759)`,
  ...over,
});
const firefox = (over = {}) => v1Bug({ title: 'TypeError: can\'t access property "toFixed", e is undefined', errorLog: `Ii@${BUNDLE}:17:8757`, ...over });
const webkit = (over = {}) => v1Bug({ title: "TypeError: undefined is not an object (evaluating 'e.toFixed')", errorLog: `Ii@${BUNDLE_V2}:17:9131`, ...over });

describe('fingerprint migration: dry run', () => {
  it('reads only: planning and formatting change nothing', async () => {
    await insert(chromium(), firefox(), v1Bug({ source: 'manual', title: 'Typed by a person' }));
    const before = await snapshot();
    const plan = await planMigration();
    const text = formatPlan(plan);
    assert.equal(await snapshot(), before);
    assert.match(text, /Bugs not yet on the v2 key: 3 \(sdk 2, manual 1\)/);
    assert.match(text, /in collision groups: +2 bug\(s\) in 1 group\(s\)/);
  });
});

describe('fingerprint migration: clean re-key', () => {
  it('gives each bug its v2 key, keeps the old one, and does not touch updatedAt', async () => {
    const [sdk, manual, api] = await insert(
      chromium(),
      v1Bug({ source: 'manual', title: 'Checkout button does nothing', errorLog: 'Error: nope\n    at pay (checkout.js:3:9)' }),
      v1Bug({ source: 'api', title: 'Imported issue' })
    );
    const plan = await planMigration();
    assert.equal(plan.rekeys.length, 3);
    assert.equal(plan.merges.length, 0);

    const result = await applyMigration(plan, { now: day(20) });
    assert.equal(result.rekeyed, 3);
    assert.deepEqual(result.violations, []);
    for (const bug of [sdk, manual, api]) {
      const after = await raw(bug._id);
      assert.equal(after.fingerprint, generateFingerprintV2(keyInputsOf(bug)));
      assert.match(after.fingerprint, /^[0-9a-f]{32}$/);
      assert.equal(after.legacyFingerprint, bug.fingerprint);
      assert.equal(after.fingerprintVersion, 2);
      assert.equal(after.updatedAt.getTime(), UPDATED.getTime(), 'updatedAt moved (P32)');
    }
    assert.equal(await AuditLog.countDocuments({ action: RUN_ACTION }), 1);
    assert.equal(await AuditLog.countDocuments({ action: MERGE_ACTION }), 0);
  });

  it('never merges manual reports, even with an SDK bug of the same error', async () => {
    const [sdk, manual] = await insert(chromium(), chromium({ source: 'manual' }));
    const plan = await planMigration();
    assert.equal(plan.merges.length, 0);
    await applyMigration(plan);
    const [a, b] = [await raw(sdk._id), await raw(manual._id)];
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(b.status, 'open');
    assert.equal(b.mergedInto ?? null, null);
  });

  it('keys an SDK bug from its stored SDK 1.4.0 fields when it has them (P20)', async () => {
    const message = `Quota exceeded for ${'bucket-alpha '.repeat(20)}`.trim();
    const [bug] = await insert(v1Bug({ title: `Unhandled Promise Rejection: ${message.slice(0, 150)}`, errorLog: '', errorName: null, errorMessage: message }));
    await applyMigration(await planMigration());
    const expected = generateFingerprintV2({ project: 'Shop', title: bug.title, errorLog: '', error: { name: null, message } });
    const fallback = generateFingerprintV2({ project: 'Shop', title: bug.title, errorLog: '' });
    assert.notEqual(expected, fallback);
    assert.equal((await raw(bug._id)).fingerprint, expected);
  });

  it('leaves a bug that cannot be keyed untouched, and lists it (P27)', async () => {
    const [bug] = await insert(v1Bug({ title: '', errorLog: '', fingerprint: null }));
    const plan = await planMigration();
    assert.deepEqual(plan.unkeyable.map((u) => String(u.id)), [String(bug._id)]);
    assert.match(formatPlan(plan), new RegExp(`Cannot be keyed[\\s\\S]*${bug._id}`));
    await applyMigration(plan);
    assert.equal((await raw(bug._id)).fingerprintVersion, undefined);
  });
});

describe('fingerprint migration: collision', () => {
  it('merges into the earliest-seen bug with the summed counts and the most active status', async () => {
    const [c, f, w] = await insert(
      chromium({ firstSeenAt: day(3), lastSeenAt: day(12), occurrences: 3, status: 'open', comments: [new mongoose.Types.ObjectId()] }),
      firefox({ firstSeenAt: day(2), lastSeenAt: day(9), occurrences: 5, status: 'resolved' }),
      webkit({ firstSeenAt: day(4), lastSeenAt: day(15), occurrences: 2, status: 'in-progress' })
    );
    const plan = await planMigration();
    assert.equal(plan.merges.length, 1);
    const [merge] = plan.merges;
    assert.equal(String(merge.survivor.id), String(f._id));
    assert.deepEqual(merge.others.map((m) => String(m.id)), [String(c._id), String(w._id)]);
    assert.match(formatPlan(plan), /survivor [0-9a-f]{24} {2}resolved, 5 occurrence/);
    assert.match(formatPlan(plan), /status resolved -> in-progress/);

    await applyMigration(plan, { now: day(20) });

    const survivor = await raw(f._id);
    assert.equal(survivor.fingerprint, generateFingerprintV2(keyInputsOf(f)));
    assert.equal(survivor.legacyFingerprint, f.fingerprint);
    assert.equal(survivor.fingerprintVersion, 2);
    assert.equal(survivor.occurrences, 10);
    assert.equal(survivor.firstSeenAt.getTime(), day(2).getTime());
    assert.equal(survivor.lastSeenAt.getTime(), day(15).getTime());
    assert.equal(survivor.status, 'in-progress');
    assert.match(survivor.statusHistory.at(-1).note, new RegExp(`${c._id}.*${w._id}`));
    // Told apart from a telemetry regression, which also has no changedBy.
    assert.equal(survivor.statusHistory.at(-1).kind, 'migration');
    assert.equal(survivor.updatedAt.getTime(), UPDATED.getTime());

    for (const [orig, count] of [[c, 3], [w, 2]]) {
      const member = await raw(orig._id);
      assert.equal(member.status, 'closed');
      assert.equal(String(member.mergedInto), String(f._id));
      assert.equal(member.fingerprint, null);
      assert.equal(member.legacyFingerprint, orig.fingerprint);
      assert.equal(member.fingerprintVersion, 2);
      assert.equal(member.occurrences, count, 'a merged bug keeps its own count (P33)');
      assert.match(member.statusHistory.at(-1).note, new RegExp(`Merged into bug ${f._id}`));
      assert.equal(member.updatedAt.getTime(), UPDATED.getTime());
    }
    assert.equal((await raw(c._id)).comments.length, 1, 'comments stay where they were written');

    const entry = await AuditLog.findOne({ action: MERGE_ACTION }).lean();
    assert.equal(entry.entityId, String(f._id));
    assert.deepEqual(entry.metadata.survivor, { id: String(f._id), occurrences: 5, status: 'resolved', fingerprint: f.fingerprint });
    assert.deepEqual(entry.metadata.others, [
      { id: String(c._id), occurrences: 3, status: 'open', fingerprint: c.fingerprint },
      { id: String(w._id), occurrences: 2, status: 'in-progress', fingerprint: w.fingerprint },
    ]);
    assert.deepEqual(await uniqueIndexViolations(), []);
  });

  it('breaks a firstSeenAt tie by the smallest _id, and keeps an open survivor open', async () => {
    const low = new mongoose.Types.ObjectId('000000000000000000000001');
    const high = new mongoose.Types.ObjectId('000000000000000000000002');
    await insert(firefox({ _id: high, firstSeenAt: day(2), status: 'closed' }), chromium({ _id: low, firstSeenAt: day(2), status: 'open' }));
    const plan = await planMigration();
    assert.equal(String(plan.merges[0].survivor.id), String(low));
    assert.equal(plan.merges[0].result.statusTo, 'open');
    await applyMigration(plan);
    assert.equal((await raw(low)).status, 'open');
    assert.equal((await raw(low)).statusHistory.length, 0, 'no history entry when the status does not change');
  });
});

describe('fingerprint migration: idempotence', () => {
  it('does nothing at all the second time', async () => {
    await insert(chromium(), firefox(), webkit(), v1Bug({ source: 'manual', title: 'Typed' }));
    await applyMigration(await planMigration());
    const before = await snapshot();

    const second = await planMigration();
    assert.equal(second.pending, 0);
    assert.deepEqual(await applyMigration(second), { rekeyed: 0, merged: 0, violations: [] });
    assert.equal(await snapshot(), before);
  });
});

describe('fingerprint migration: refusal', () => {
  it('refuses before writing anything when SDK activity happens after the plan', async () => {
    const [bug] = await insert(chromium(), firefox(), v1Bug({ title: 'Other', errorLog: `Error: other\n    at o (${BUNDLE}:1:1)` }));
    const plan = await planMigration();
    const before = await snapshot();
    // A repeat report lands: telemetry bumps lastSeenAt.
    await Bug.collection.updateOne({ _id: bug._id }, { $set: { lastSeenAt: new Date() } });
    const afterIngest = await snapshot();

    await assert.rejects(applyMigration(plan), MigrationRefused);
    assert.notEqual(afterIngest, before);
    assert.equal(await snapshot(), afterIngest, 'the refused run wrote something');
  });

  it('stops between merges when ingest starts mid-run, and a re-run completes it', async () => {
    const [unrelated] = await insert(
      v1Bug({ title: 'Unrelated', errorLog: `Error: unrelated\n    at u (${BUNDLE}:1:1)`, lastSeenAt: day(11) }),
      chromium({ firstSeenAt: day(2) }),
      firefox({ firstSeenAt: day(3) }),
      v1Bug({ title: 'Uncaught Error: Invalid cart state', errorLog: `Error: Invalid cart state\n    at b (${BUNDLE}:8:1)`, firstSeenAt: day(2) }),
      v1Bug({ title: 'Error: Invalid cart state', errorLog: `b@${BUNDLE}:8:1`, firstSeenAt: day(3) })
    );
    const plan = await planMigration();
    assert.equal(plan.merges.length, 2);

    let first = true;
    const ingestDuringFirstMerge = async () => {
      if (!first) return;
      first = false;
      await Bug.collection.updateOne({ _id: unrelated._id }, { $set: { lastSeenAt: new Date() } });
    };
    await assert.rejects(applyMigration(plan, { hooks: { afterMemberWrite: ingestDuringFirstMerge } }), MigrationRefused);

    // The first merge completed, the second was not started.
    const firstSurvivor = await raw(plan.merges[0].survivor.id);
    const secondSurvivor = await raw(plan.merges[1].survivor.id);
    assert.equal(firstSurvivor.fingerprintVersion, 2);
    assert.equal(secondSurvivor.fingerprintVersion, undefined);

    // Ingest stopped again; a new plan picks up where the run stopped.
    const rest = await planMigration();
    assert.equal(rest.merges.length, 1);
    assert.equal(rest.conflicts.length, 0);
    await applyMigration(rest);
    assert.equal((await raw(plan.merges[1].survivor.id)).fingerprintVersion, 2);
    assert.equal((await planMigration()).pending, 0);
  });

  it('refuses when a recomputed key is already held by a migrated SDK bug (P31)', async () => {
    const [bug] = await insert(chromium());
    const key = generateFingerprintV2(keyInputsOf(bug));
    await insert(firefox({ fingerprint: key, fingerprintVersion: 2 }));
    const plan = await planMigration();
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].kind, 'key-held');
    assert.match(formatPlan(plan), /already held by migrated bug/);

    const before = await snapshot();
    await assert.rejects(applyMigration(plan), MigrationRefused);
    assert.equal(await snapshot(), before);
  });

  it('refuses after a merge was interrupted part-way, pointing at its audit entry (P31)', async () => {
    await insert(chromium({ firstSeenAt: day(2) }), firefox({ firstSeenAt: day(3) }), webkit({ firstSeenAt: day(4) }));
    const crash = async () => {
      throw new Error('simulated crash');
    };
    await assert.rejects(applyMigration(await planMigration(), { hooks: { afterMemberWrite: crash } }), /simulated crash/);

    const plan = await planMigration();
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].kind, 'incomplete-merge');
    const entry = await AuditLog.findOne({ action: MERGE_ACTION }).lean();
    assert.equal(String(plan.conflicts[0].auditEntry), String(entry._id));

    const before = await snapshot();
    await assert.rejects(applyMigration(plan), MigrationRefused);
    assert.equal(await snapshot(), before);
  });
});
