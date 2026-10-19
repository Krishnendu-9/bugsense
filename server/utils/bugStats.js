/*
 * Historical bug statistics, reconstructed from Bug.statusHistory.
 *
 * Kept as pure functions over plain bug objects so the rules -- which entry
 * counts as the resolution, what a bug's status was on a past day -- can be
 * tested with exact inputs, independently of whatever else is in a database.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

// Every bug is created open: manual reports take the model default and the
// telemetry pipeline sets it explicitly. Creation itself writes no
// statusHistory entry, so this is the status before the first recorded change.
export const INITIAL_STATUS = 'open';

const time = (value) => new Date(value).getTime();

/**
 * A bug's status at a given moment, or null if it did not exist yet.
 *
 * Replays backward from the current status rather than forward from creation:
 * the status *before* the first change made after `at` is the status at `at`.
 * When no change follows `at`, the answer is the current status. Working this
 * way keeps "now" exact even if some history is missing -- a forward replay
 * over an incomplete history would disagree with the live status.
 */
export const statusAt = (bug, at) => {
  const moment = time(at);
  if (time(bug.createdAt) > moment) return null;

  const changes = [...(bug.statusHistory || [])].sort((a, b) => time(a.changedAt) - time(b.changedAt));
  const next = changes.findIndex((change) => time(change.changedAt) > moment);

  if (next === -1) return bug.status;
  return next === 0 ? INITIAL_STATUS : changes[next - 1].status;
};

const startOfUtcDay = (value) => {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** The first moment of the oldest day in a `days`-day window ending today (UTC). */
export const windowStart = (now, days = 7) => startOfUtcDay(now) - (days - 1) * DAY_MS;

/**
 * Open-bug count for each of the last `days` UTC days, oldest first.
 *
 * Each past day is measured at its final millisecond; today is measured at
 * `now`, so its point equals the live count of open bugs. Bugs that have since
 * been deleted are absent from `bugs` and so are not counted on any day.
 */
export const openCountsByDay = (bugs, now, days = 7) => {
  const today = startOfUtcDay(now);
  const result = [];

  for (let back = days - 1; back >= 0; back -= 1) {
    const dayStart = today - back * DAY_MS;
    const at = back === 0 ? time(now) : dayStart + DAY_MS - 1;
    result.push({
      date: new Date(dayStart).toISOString().slice(0, 10),
      open: bugs.filter((bug) => statusAt(bug, at) === 'open').length,
    });
  }

  return result;
};

/**
 * Time from creation to the FIRST `resolved` entry, in milliseconds, or null
 * if the bug has never been resolved.
 *
 * First, not last: a bug fixed in a day that regressed a fortnight later took
 * a day to resolve, and the regression is a separate fact. `closed` is not a
 * resolution -- a bug can be closed without being fixed.
 */
export const timeToFirstResolution = (bug) => {
  const resolvedAt = (bug.statusHistory || [])
    .filter((change) => change.status === 'resolved')
    .map((change) => time(change.changedAt));
  if (!resolvedAt.length) return null;

  // A resolution recorded before creation is impossible in real use; it only
  // arises from hand-written history (the seed script). Floor it at zero
  // rather than let a negative duration pull the median down.
  return Math.max(0, Math.min(...resolvedAt) - time(bug.createdAt));
};

export const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Median time to first resolution over every bug that has been resolved. */
export const resolutionStats = (bugs) => {
  const durations = bugs.map(timeToFirstResolution).filter((d) => d !== null);
  return { medianMs: median(durations), sampleSize: durations.length };
};

/**
 * How many bugs were resolved at least once on or after `since`.
 *
 * Counts bugs, not resolution events: a bug resolved twice in the window is
 * one bug resolved. A bug that was resolved in the window and has regressed
 * since still counts -- it was resolved this week. `closed` is not a
 * resolution, as above.
 */
export const countResolvedSince = (bugs, since) => {
  const from = time(since);
  return bugs.filter((bug) =>
    (bug.statusHistory || []).some((change) => change.status === 'resolved' && time(change.changedAt) >= from)
  ).length;
};
