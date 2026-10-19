import crypto from 'crypto';

/**
 * Generates a deterministic SHA-256 fingerprint for an error trace.
 * `scope` (typically the project name) keeps identical errors from different
 * applications in separate dedup buckets.
 * Normalizes variable tokens (numbers, timestamps, IDs, UUIDs) so recurring errors
 * are deduplicated accurately regardless of dynamic parameters.
 */
export const generateFingerprint = (errorLog = '', title = '', scope = '') => {
  if (!errorLog && !title) return null;

  const textToHash = errorLog || title;
  const lines = textToHash
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // First line typically contains error type and message
  let errorHeader = lines[0] || title;

  // Normalize dynamic values: UUIDs, memory addresses, timestamps, pure numbers
  errorHeader = errorHeader
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/0x[0-9a-fA-F]+/g, '<addr>')
    .replace(/\b\d{10,13}\b/g, '<timestamp>')
    .replace(/\b\d+\b/g, '<num>');

  // Find the top 2 stack frames (lines starting with 'at ')
  const stackFrames = lines
    .filter((l) => l.startsWith('at '))
    .slice(0, 2)
    .map((frame) => {
      // Remove specific line and column numbers so code drift doesn't break fingerprint
      return frame.replace(/:\d+:\d+/g, '');
    })
    .join('|');

  const rawKey = `${scope}::${errorHeader}::${stackFrames}`;

  return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
};

/**
 * The top stack frame of an error log, chosen by the same rule the fingerprint
 * uses (the first trimmed line starting with "at "), so the frame a list shows
 * beside an SDK bug is the one that actually drove its grouping. Returns null
 * when there is no such line -- Firefox and Safari write frames as
 * "fn@file:line:col", which the fingerprint does not use either.
 */
export const topFrameOf = (errorLog = '') => {
  if (!errorLog) return null;
  const frame = errorLog
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at '));
  return frame ? frame.slice(0, 160) : null;
};
