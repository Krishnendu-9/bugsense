import mongoose from 'mongoose';
import Bug from '../models/Bug.model.js';
import AuditLog from '../models/AuditLog.model.js';
import { generateFingerprintV2, manualKeyInputs } from '../utils/fingerprint.util.js';

/*
 * Re-keys stored bugs from the v1 fingerprint to v2: docs/fingerprint-eval-v2.md,
 * section 8.3, as read by Amendment 1 (P20, P23-P33). "8.3" is a section of
 * that document and "P28" point 28 of its Amendment 1; each rule below also
 * says in plain words what it does.
 *
 * planMigration() only reads. applyMigration() performs a plan. All writes go
 * to the raw collection, so no Mongoose middleware, timestamp (P32), webhook,
 * socket event or regression flag is involved (8.3: no side effects).
 */

export const MERGE_ACTION = 'FINGERPRINT_MIGRATION_MERGE';
export const RUN_ACTION = 'FINGERPRINT_MIGRATION';
const PERFORMED_BY = 'Fingerprint v2 migration';

const READ_FIELDS = [
  'source', 'title', 'errorLog', 'breadcrumbs', 'project', 'errorName', 'errorMessage', 'request', 'errorLocation',
  'fingerprint', 'fingerprintVersion', 'mergedInto', 'firstSeenAt', 'lastSeenAt', 'occurrences', 'status',
  'priority', 'assignedTo',
].join(' ');

/** Raised when the migration must not write: live ingest or leftovers (P28, P31). */
export class MigrationRefused extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MigrationRefused';
    this.details = details;
  }
}

/**
 * What the v2 key is computed from, for a stored bug. An SDK bug is keyed as the
 * telemetry endpoint keys a report, from the stored SDK 1.4.0 fields when it
 * has them (P20); a manual (or 'api') bug as the API keys a manual report.
 */
export const keyInputsOf = (bug) => {
  const base = { project: bug.project ?? '', title: bug.title || '', errorLog: bug.errorLog || '' };
  // Manual and api bugs: keyed exactly as the API keys a new manual report (P34).
  if (bug.source !== 'sdk') return manualKeyInputs(base);
  const loc = bug.errorLocation;
  return {
    ...base,
    breadcrumbs: Array.isArray(bug.breadcrumbs) ? bug.breadcrumbs : [],
    error: typeof bug.errorMessage === 'string' ? { name: bug.errorName ?? null, message: bug.errorMessage } : undefined,
    request: bug.request && typeof bug.request.url === 'string'
      ? { method: bug.request.method ?? '', url: bug.request.url, status: bug.request.status ?? null }
      : undefined,
    source: loc ? { filename: loc.filename ?? '', lineno: loc.lineno ?? null, colno: loc.colno ?? null } : undefined,
  };
};

// The newest SDK activity: the ingest check of 8.3 compares this before and
// during a run. Migration writes never raise it (a survivor takes the latest
// lastSeenAt of its own group).
export const latestSdkActivity = async () => {
  const latest = await Bug.findOne({ source: 'sdk' }).sort({ lastSeenAt: -1 }).select('lastSeenAt').lean();
  return latest?.lastSeenAt ? new Date(latest.lastSeenAt).getTime() : null;
};

const ACTIVE = { 'in-progress': 2, open: 1 };

const memberOf = (bug, newKey) => ({
  id: bug._id,
  title: bug.title,
  oldKey: bug.fingerprint ?? null,
  newKey,
  occurrences: bug.occurrences ?? 1,
  status: bug.status,
  firstSeenAt: bug.firstSeenAt ? new Date(bug.firstSeenAt) : null,
  lastSeenAt: bug.lastSeenAt ? new Date(bug.lastSeenAt) : null,
});

const time = (d) => (d ? d.getTime() : Infinity);

// 8.3: survivor = earliest firstSeenAt, ties broken by the smallest _id.
const bySurvivorOrder = (a, b) => time(a.firstSeenAt) - time(b.firstSeenAt) || String(a.id).localeCompare(String(b.id));

/** Reads the database and describes exactly what applyMigration would do. Writes nothing. */
export const planMigration = async () => {
  const ingestMarker = await latestSdkActivity();
  const pending = await Bug.find({ fingerprintVersion: { $ne: 2 } }).select(READ_FIELDS).lean();

  const rekeys = [];
  const unkeyable = [];
  const groups = new Map();
  for (const bug of pending) {
    const newKey = generateFingerprintV2(keyInputsOf(bug));
    if (newKey === null) {
      // Nothing to key on (no log, title or message): left as it is and listed
      // in the report, never guessed at (P27).
      unkeyable.push({ id: bug._id, source: bug.source, title: bug.title });
      continue;
    }
    if (bug.source !== 'sdk') {
      rekeys.push({ ...memberOf(bug, newKey), source: bug.source }); // manual and 'api' never merge (P26)
      continue;
    }
    if (!groups.has(newKey)) groups.set(newKey, []);
    groups.get(newKey).push(memberOf(bug, newKey));
  }

  // P31, first case: the recomputed key is already held by a migrated SDK bug.
  const conflicts = [];
  const holders = await Bug.find({ source: 'sdk', fingerprintVersion: 2, fingerprint: { $in: [...groups.keys()] } })
    .select('fingerprint title')
    .lean();
  const heldBy = new Map(holders.map((h) => [h.fingerprint, h]));

  const merges = [];
  for (const [newKey, members] of groups) {
    if (heldBy.has(newKey)) {
      const holder = heldBy.get(newKey);
      conflicts.push({ kind: 'key-held', newKey, holder: { id: holder._id, title: holder.title }, bugs: members.map((m) => m.id) });
      continue;
    }
    if (members.length === 1) {
      rekeys.push({ ...members[0], source: 'sdk' });
      continue;
    }
    const ordered = [...members].sort(bySurvivorOrder);
    const [survivor, ...others] = ordered;
    // 8.3 triage: a resolved or closed survivor takes the most active open status of the others.
    let statusTo = survivor.status;
    if (!ACTIVE[survivor.status]) {
      const active = others.filter((m) => ACTIVE[m.status]).sort((a, b) => ACTIVE[b.status] - ACTIVE[a.status]);
      if (active.length) statusTo = active[0].status;
    }
    const firsts = members.map((m) => m.firstSeenAt).filter(Boolean);
    const lasts = members.map((m) => m.lastSeenAt).filter(Boolean);
    merges.push({
      newKey,
      survivor,
      others,
      result: {
        occurrences: members.reduce((sum, m) => sum + m.occurrences, 0),
        firstSeenAt: firsts.length ? new Date(Math.min(...firsts.map(time))) : null,
        lastSeenAt: lasts.length ? new Date(Math.max(...lasts.map(time))) : null,
        statusFrom: survivor.status,
        statusTo,
      },
    });
  }

  // P31, second case: a migrated bug merged into one that is not yet migrated,
  // which only an interrupted run leaves behind.
  const pendingIds = pending.map((b) => b._id);
  const stranded = await Bug.find({ fingerprintVersion: 2, mergedInto: { $in: pendingIds } }).select('mergedInto title').lean();
  for (const bug of stranded) {
    const entry = await AuditLog.findOne({ action: MERGE_ACTION, 'metadata.others.id': String(bug._id) })
      .sort({ createdAt: -1 })
      .select('_id')
      .lean();
    conflicts.push({ kind: 'incomplete-merge', bug: { id: bug._id, title: bug.title }, mergedInto: bug.mergedInto, auditEntry: entry?._id ?? null });
  }

  return {
    ingestMarker,
    pending: pending.length,
    bySource: pending.reduce((acc, b) => ({ ...acc, [b.source]: (acc[b.source] || 0) + 1 }), {}),
    rekeys,
    merges,
    unkeyable,
    conflicts,
  };
};

// 8.3 / P28: refuse if any SDK activity happened since the plan was made.
const assertNoIngest = async (plan) => {
  const now = await latestSdkActivity();
  if (now !== plan.ingestMarker) {
    throw new MigrationRefused('SDK activity happened during the run: ingest is not stopped. Nothing further was written.', {
      plannedMarker: plan.ingestMarker,
      currentMarker: now,
    });
  }
};

// kind 'migration' tells these apart from telemetry regressions, which also
// have no changedBy and can move a bug to in-progress.
const historyEntry = (status, note, at) => ({
  _id: new mongoose.Types.ObjectId(), status, changedBy: null, changedAt: at, note, kind: 'migration',
});

/**
 * Performs a plan from planMigration. Refuses, before any write, when the plan
 * has leftovers (P31) or ingest is live; re-checks ingest before each merge
 * (P28). `hooks` exist for tests: afterMemberWrite(merge, member) runs after
 * each merged member is written.
 */
export const applyMigration = async (plan, { now = new Date(), hooks = {} } = {}) => {
  if (plan.conflicts.length) {
    throw new MigrationRefused(`${plan.conflicts.length} leftover(s) from an interrupted run or live ingest must be resolved by hand first. Nothing was written.`, {
      conflicts: plan.conflicts,
    });
  }
  // Nothing to migrate: a repeat run writes nothing at all, not even its audit entry.
  if (!plan.rekeys.length && !plan.merges.length) return { rekeyed: 0, merged: 0, violations: await uniqueIndexViolations() };

  await assertNoIngest(plan);
  const col = Bug.collection;

  // Re-keys without a collision (8.3). The version filter makes a repeat a no-op.
  let rekeyed = 0;
  if (plan.rekeys.length) {
    const res = await col.bulkWrite(
      plan.rekeys.map((r) => ({
        updateOne: {
          filter: { _id: r.id, fingerprintVersion: { $ne: 2 } },
          update: { $set: { legacyFingerprint: r.oldKey, fingerprint: r.newKey, fingerprintVersion: 2 } },
        },
      })),
      { ordered: true }
    );
    rekeyed = res.modifiedCount;
  }

  let merged = 0;
  for (const merge of plan.merges) {
    await assertNoIngest(plan);
    const { survivor, others, result, newKey } = merge;

    // P24: the audit entry first, written directly so a failure stops the merge.
    await AuditLog.create({
      action: MERGE_ACTION,
      entityType: 'bug',
      entityId: String(survivor.id),
      performedByName: PERFORMED_BY,
      details: `Merged ${others.length} bug(s) into "${survivor.title}" (${survivor.id}): one incident under the v2 fingerprint.`,
      metadata: {
        newKey,
        survivor: { id: String(survivor.id), occurrences: survivor.occurrences, status: survivor.status, fingerprint: survivor.oldKey },
        others: others.map((m) => ({ id: String(m.id), occurrences: m.occurrences, status: m.status, fingerprint: m.oldKey })),
        result,
      },
    });

    // The other members first, the survivor last (P28): if the run stops
    // part-way, the survivor is still unmigrated while a member already points
    // at it, which the next plan detects as an incomplete merge (P31) instead
    // of silently re-merging.
    for (const member of others) {
      await col.updateOne(
        { _id: member.id, fingerprintVersion: { $ne: 2 } },
        {
          $set: { status: 'closed', mergedInto: survivor.id, legacyFingerprint: member.oldKey, fingerprint: null, fingerprintVersion: 2 },
          $push: { statusHistory: historyEntry('closed', `Merged into bug ${survivor.id} ("${survivor.title}") by the fingerprint v2 migration.`, now) },
        }
      );
      if (hooks.afterMemberWrite) await hooks.afterMemberWrite(merge, member);
    }

    const set = {
      fingerprint: newKey,
      legacyFingerprint: survivor.oldKey,
      fingerprintVersion: 2,
      occurrences: result.occurrences,
      ...(result.firstSeenAt && { firstSeenAt: result.firstSeenAt }),
      ...(result.lastSeenAt && { lastSeenAt: result.lastSeenAt }),
    };
    const update = { $set: set };
    if (result.statusTo !== result.statusFrom) {
      set.status = result.statusTo;
      // P23: the triage change gets its own entry, naming the merged bugs.
      update.$push = {
        statusHistory: historyEntry(
          result.statusTo,
          `Set to ${result.statusTo} by the fingerprint v2 migration: merged with ${others.map((m) => m.id).join(', ')}, of which at least one was still ${result.statusTo}.`,
          now
        ),
      };
    }
    await col.updateOne({ _id: survivor.id, fingerprintVersion: { $ne: 2 } }, update);
    merged += 1;
  }

  const violations = await uniqueIndexViolations();

  // P25: one entry for the run.
  await AuditLog.create({
    action: RUN_ACTION,
    entityType: 'system',
    performedByName: PERFORMED_BY,
    details: `Fingerprint v2 migration applied: ${rekeyed} bug(s) re-keyed, ${merged} merge(s) of ${plan.merges.reduce((n, m) => n + m.others.length + 1, 0)} bug(s), ${plan.unkeyable.length} left unkeyed.`,
    metadata: { rekeyed, merges: merged, unkeyable: plan.unkeyable.map((u) => String(u.id)), uniqueIndexViolations: violations.length },
  });

  return { rekeyed, merged, violations };
};

// 8.3: after applying, check that no two SDK bugs share a key.
export const uniqueIndexViolations = async () =>
  Bug.collection
    .aggregate([
      { $match: { source: 'sdk', fingerprint: { $type: 'string' } } },
      { $group: { _id: '$fingerprint', bugs: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();

const iso = (d) => (d ? new Date(d).toISOString() : '-');
const short = (key) => (key ? `${key.slice(0, 12)}…` : 'none');

/** The dry-run report: counts, then every change and every collision group in full (8.3). */
export const formatPlan = (plan) => {
  const lines = [];
  const mergedBugs = plan.merges.reduce((n, m) => n + m.others.length + 1, 0);
  const sources = Object.entries(plan.bySource).map(([s, n]) => `${s} ${n}`).join(', ') || 'none';
  lines.push(`Bugs not yet on the v2 key: ${plan.pending} (${sources})`);
  lines.push(`  re-keyed, no collision:   ${plan.rekeys.length}`);
  lines.push(`  in collision groups:      ${mergedBugs} bug(s) in ${plan.merges.length} group(s) -> ${plan.merges.length} survivor(s), ${mergedBugs - plan.merges.length} closed as merged`);
  lines.push(`  cannot be keyed:          ${plan.unkeyable.length}`);
  lines.push(`  blocking leftovers:       ${plan.conflicts.length}${plan.conflicts.length ? '  (--apply will refuse)' : ''}`);
  lines.push(`Latest SDK activity (ingest check): ${plan.ingestMarker === null ? 'none' : iso(plan.ingestMarker)}`);

  if (plan.rekeys.length) {
    lines.push('', 'Re-keys:');
    for (const r of plan.rekeys) lines.push(`  [${r.source}] ${r.id}  ${short(r.oldKey)} -> ${short(r.newKey)}  "${r.title}"`);
  }
  plan.merges.forEach((m, i) => {
    lines.push('', `Merge ${i + 1}, v2 key ${short(m.newKey)}:`);
    const row = (tag, b) => `  ${tag} ${b.id}  ${b.status}, ${b.occurrences} occurrence(s), first ${iso(b.firstSeenAt)}, last ${iso(b.lastSeenAt)}, key ${short(b.oldKey)}  "${b.title}"`;
    lines.push(row('survivor', m.survivor));
    for (const o of m.others) lines.push(row('merged  ', o));
    const st = m.result.statusTo === m.result.statusFrom ? `${m.result.statusTo} (unchanged)` : `${m.result.statusFrom} -> ${m.result.statusTo}`;
    lines.push(`  result: ${m.result.occurrences} occurrence(s), first ${iso(m.result.firstSeenAt)}, last ${iso(m.result.lastSeenAt)}, status ${st}`);
  });
  if (plan.unkeyable.length) {
    lines.push('', 'Cannot be keyed (left untouched):');
    for (const u of plan.unkeyable) lines.push(`  [${u.source}] ${u.id}  "${u.title}"`);
  }
  if (plan.conflicts.length) {
    lines.push('', 'Blocking leftovers (resolve by hand, then dry-run again):');
    for (const c of plan.conflicts) {
      if (c.kind === 'key-held') lines.push(`  key ${short(c.newKey)} is already held by migrated bug ${c.holder.id}; unmigrated: ${c.bugs.join(', ')}`);
      else lines.push(`  migrated bug ${c.bug.id} is merged into unmigrated bug ${c.mergedInto}; audit entry ${c.auditEntry ?? 'not found'}`);
    }
  }
  return lines.join('\n');
};
