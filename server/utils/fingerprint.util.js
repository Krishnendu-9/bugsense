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

/** The v1 key under an explicit name, for the migration and the regression check. */
export const generateFingerprintV1 = generateFingerprint;

// =============================================================================
// Fingerprint v2 -- specified in docs/fingerprint-eval-v2.md, section 2, as
// read by its Amendment 1 (points P1-P12, cited below). The specification is
// the source of truth: change it before changing this code.
// =============================================================================

// A content hash before .js/.mjs at the end of a path (2.2, file rule 2).
const CONTENT_HASH = /-([A-Za-z0-9_-]{8})(\.m?js)$/;
// Segments that look like source files keep their digits (2.2, file rule 3).
const SOURCE_FILE_SEGMENT = /\.m?jsx?$|\.tsx?$/;

// 2.2: the function's own name, so the three engines agree.
function normaliseFunctionName(raw) {
  let f = (raw || '').trim();
  f = f.replace(/^async\s+/, '').replace(/^new\s+/, '');
  f = f.replace(/\s*\[as [^\]]+\]$/, '');
  if (f.includes('*')) f = f.slice(f.lastIndexOf('*') + 1);
  f = f.replace(/(?:\/<|<)+$/g, '');
  if (/^(global|module|eval) code$/.test(f)) return '';
  if (f.includes('.')) f = f.slice(f.lastIndexOf('.') + 1);
  // P1: checked after the receiver is dropped, so `X.<anonymous>` is empty too.
  if (f === '<anonymous>') return '';
  return f;
}

function splitLocation(loc) {
  let m = loc.match(/^(.*?):(\d+):(\d+)$/);
  if (m) return { file: m[1], line: Number(m[2]), col: Number(m[3]) };
  m = loc.match(/^(.*?):(\d+)$/);
  if (m) return { file: m[1], line: Number(m[2]), col: null };
  return { file: loc, line: null, col: null };
}

// 2.2 file rules: path only, content hash stripped, digit-bearing segments -> <id>.
function normaliseFile(file) {
  let f = file;
  try {
    const u = new URL(f);
    if (u.protocol === 'blob:') f = 'blob:';
    else if (u.protocol.startsWith('http')) f = u.pathname;
    else f = u.protocol + u.pathname;
  } catch {
    // Not a URL (a bare path, or a marker such as [wasm code]): keep it as it is.
  }
  f = f.replace(CONTENT_HASH, (_match, _hash, ext) => ext);
  return f
    .split('/')
    .map((seg) => (/\d/.test(seg) && !SOURCE_FILE_SEGMENT.test(seg) ? '<id>' : seg))
    .join('/');
}

// 2.2 frame kinds.
function frameKind(file) {
  if (!file || file === '<anonymous>' || file === 'native' || file === '[native code]') return 'native';
  if (file === '[wasm code]' || file.startsWith('wasm')) return 'app';
  if (/\/sdk\/bugsense\.js$/.test(file.split(/[?#]/)[0])) return 'sdk';
  if (/^(file|node):/.test(file)) return 'foreign';
  if (file.includes('/node_modules/')) return 'library';
  return 'app';
}

/**
 * Parses one stack line in V8 (`at FN (LOC)`, `at LOC`) or SpiderMonkey /
 * JavaScriptCore (`FN@LOC`) form. Returns null for a line in neither form.
 */
export function parseFrame(line) {
  const l = String(line).trim();
  let fn;
  let loc;
  let m;
  if ((m = l.match(/^at (.*?) \((.*)\)$/))) {
    [, fn, loc] = m;
  } else if ((m = l.match(/^at (?:async )?(.*)$/))) {
    // P10: in `at async LOC`, `async ` is a marker, not part of the location.
    fn = '';
    [, loc] = m;
  } else if ((m = l.match(/^([^@]*)@(.*)$/))) {
    [, fn, loc] = m;
  } else {
    return null;
  }

  // WebAssembly, in any engine's form.
  const wasm = `${fn} ${loc}`.match(/wasm-function\[([^\]]+)\]/);
  if (wasm) return { fn: `wasm:${wasm[1]}`, file: 'wasm', line: null, col: null, kind: 'app' };

  // V8 eval: the file is the innermost location in parentheses, without its
  // own line and column (P2). Firefox eval / new Function: the URL before
  // ` line N >`. An unnamed eval frame is called `eval` in both (P12).
  if (loc.startsWith('eval at ')) {
    const inner = loc.match(/\(([^()]+)\)/);
    if (inner) {
      loc = inner[1];
      fn = fn || 'eval';
    }
  } else {
    const ffEval = loc.match(/^(.*?) line \d+ > (?:eval|Function)/);
    if (ffEval) {
      loc = ffEval[1];
      fn = fn || 'eval';
    } else if (/^(.*?) line \d+ > WebAssembly/.test(loc)) {
      loc = '[wasm code]';
    }
  }

  const { file: rawFile, line: lineNo, col } = splitLocation(loc);
  const kind = frameKind(rawFile);
  return {
    fn: normaliseFunctionName(fn),
    file: kind === 'native' ? '' : normaliseFile(rawFile),
    line: lineNo,
    col,
    kind,
  };
}

/**
 * Parses a whole stack. Lines in neither format are skipped and counted.
 * Foreign (file:, node:) frames are dropped when the stack has an app frame,
 * since they were pasted into a message; otherwise they count as app (P7).
 */
export function parseStack(errorLog = '') {
  const frames = [];
  let unparsed = 0;
  for (const line of String(errorLog || '').split('\n')) {
    if (!line.trim()) continue;
    const frame = parseFrame(line);
    if (frame) frames.push(frame);
    else unparsed += 1;
  }
  if (frames.some((f) => f.kind === 'app' && !/^(file|node):/.test(f.file))) {
    return { frames: frames.filter((f) => f.kind !== 'foreign'), unparsed };
  }
  return { frames: frames.map((f) => (f.kind === 'foreign' ? { ...f, kind: 'app' } : f)), unparsed };
}

// 2.4 source fallback for older SDKs: the title without SDK prefixes and the
// error name. A component-stack title is replaced by V8's header line (P5).
const SDK_TITLE_PREFIX = /^(?:Uncaught |Unhandled Promise Rejection: )/;
const ERROR_NAME_PREFIX = /^(?:[A-Z]\w*)?(?:Error|Exception):\s*/;

function messageFromTitle(title, errorLog) {
  let t = title || '';
  if (/^\s/.test(t) || /^at /.test(t)) {
    const head = String(errorLog || '').split('\n')[0] || '';
    t = /^\s*at |@/.test(head) ? '' : head;
  }
  return t.replace(SDK_TITLE_PREFIX, '').replace(ERROR_NAME_PREFIX, '').trim();
}

function reportMessage({ error, title, errorLog }) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
  return messageFromTitle(title, errorLog);
}

// "Last segment": after a trailing call is removed (P3), the key in a final
// [..], or else the text after the last dot.
function lastSegment(expr) {
  const s = expr.replace(/\(.*\)$/, '').trim();
  const bracket = s.match(/\[['"]?([^'"\]]+)['"]?\]$/);
  if (bracket) return bracket[1];
  return s.slice(s.lastIndexOf('.') + 1);
}

/**
 * 2.4: engine wordings become one neutral form; anything else has its data
 * stripped. `frames` is the parsed stack, used only by the JavaScriptCore
 * JSON rule, which needs a native frame named `json` anywhere in it (P6).
 */
export function normaliseMessage(message = '', frames = []) {
  const m = String(message).trim();
  let r;
  if ((r = m.match(/^Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(.+)'\)$/))) return `nullish-read ${r[1]}`;
  if ((r = m.match(/^can't access property (?:"(.+)"|(\S+)), .+ is (?:undefined|null)$/))) return `nullish-read ${r[1] ?? r[2]}`;
  if (/^(unreachable|unreachable executed|Unreachable code should not be executed\b.*)$/s.test(m)) return 'wasm-unreachable';
  if ((r = m.match(/^(?:undefined|null) is not an object \(evaluating '(.+)'\)$/))) return `nullish-read ${lastSegment(r[1])}`;
  if ((r = m.match(/^Cannot set propert(?:y|ies) of (?:undefined|null) \(setting '(.+)'\)$/))) return `nullish-write ${r[1]}`;
  if ((r = m.match(/^(.+?) is not a function(?:\. \(In [\s\S]*\))?$/))) return `not-function ${lastSegment(r[1])}`;
  if ((r = m.match(/^(.+?) is not a constructor/))) return `not-constructor ${lastSegment(r[1])}`;
  if (/^(Maximum call stack size exceeded\.?|too much recursion)$/.test(m)) return 'recursion';
  if (/is not valid JSON|Unexpected end of JSON input|in JSON at position|^JSON\.parse: |^JSON Parse error: /.test(m)) return 'json-parse';
  if (/^The string did not match the expected pattern\.$/.test(m) && frames.some((f) => f.kind === 'native' && f.fn === 'json')) {
    return 'json-parse';
  }
  if (/^(Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/.test(m)) return 'network';
  if (/^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)/.test(m)) {
    return 'dynamic-import';
  }
  if ((r = m.match(/^(.+?) is not defined$/)) || (r = m.match(/^Can't find variable: (.+)$/))) return `undefined-var ${r[1]}`;
  if ((r = m.match(/^Minified React error #(\d+)/))) return `react#${r[1]}`;
  if ((r = m.match(/^Request failed with status code (\d)\d\d$/))) return `http ${r[1]}xx`;
  return m
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\{.*\}|\[.*\]/gs, '<json>') // P4: each span runs to the last closing bracket
    .replace(/"[^"]*"/g, '<str>')
    .replace(/(?:[€$£¥]\s?)?\d[\d.,]*(?:\s?[€$£¥])?/g, '<num>')
    .replace(/\S*\d\S*/g, '<num>')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

// 2.5: METHOD PATH, origin and query dropped, digit-bearing segments -> <id>.
function requestPath(url) {
  let p = String(url);
  try {
    p = new URL(p, 'http://x').pathname;
  } catch {
    // Keep a value that is not a URL as it is.
  }
  return p
    .split('/')
    .map((s) => (/\d/.test(s) ? '<id>' : s))
    .join('/');
}

function reportRequest({ request, breadcrumbs }) {
  if (request && typeof request === 'object' && typeof request.url === 'string') {
    return `${String(request.method || '')} ${requestPath(request.url)}`;
  }
  const failed = (Array.isArray(breadcrumbs) ? breadcrumbs : []).filter(
    (c) => c && c.category === 'xhr' && /\((FAILED|HTTP [45]\d\d)\)$/.test(c.message || '')
  );
  const last = failed[failed.length - 1];
  const m = last ? last.message.match(/^API \[(\w+)\] (\S+)/) : null;
  return m ? `${m[1]} ${requestPath(m[2])}` : '';
}

// 2.6 / P9: the script path for `Script error.`, when the browser gave one.
function scriptPath({ source, errorLog }) {
  const given = source && typeof source === 'object' ? source.filename : null;
  const hint = typeof given === 'string' && given
    ? given
    : (String(errorLog || '').match(/^Script error\. at (\S+?):\d+:\d+$/) || [])[1] || '';
  return /^https?:/.test(hint) ? normaliseFile(hint) : '';
}

/**
 * The v2 key string before hashing (2.8). `report` holds the fields the
 * telemetry endpoint has: project, errorLog, title, and from the v2 SDK
 * error { name, message }, request { method, url }, source { filename }.
 * Older SDK reports omit those and are read through the fallbacks of 2.1.
 * Returns null when there is nothing to key on (P11).
 */
export function buildKeyV2(report = {}) {
  const project = report.project ?? '';
  const errorLog = String(report.errorLog || '');
  const title = String(report.title || '');
  const message = reportMessage({ error: report.error, title, errorLog });
  if (!errorLog && !title && !message) return null;

  const { frames } = parseStack(errorLog);
  const neutral = normaliseMessage(message, frames);

  // 2.3: top app frame; library frames only when there is no app frame.
  let usable = frames.filter((f) => f.kind === 'app' || f.kind === 'library');
  if (usable.some((f) => f.kind === 'app')) usable = usable.filter((f) => f.kind === 'app');

  // 2.5: only HTTP and network failures carry a request.
  const request = /^(network|http )/.test(neutral) ? reportRequest(report) : '';

  if (!usable.length) {
    if (/^Script error\.?/.test(message)) return `fp2::${project}::script-error::${scriptPath({ source: report.source, errorLog })}`;
    return `fp2::${project}::nostack::${neutral}::${request}::`;
  }
  if (request) return `fp2::${project}::${neutral}::::${request}::`;
  // P8: an HTTP or network failure with no request found falls through to frames.
  const top = usable[0];
  return `fp2::${project}::${neutral}::${top.fn}@${top.file}::${request}::`;
}

/** The v2 fingerprint: SHA-256 of the v2 key, truncated to 32 hex characters as in v1. */
export function generateFingerprintV2(report = {}) {
  const key = buildKeyV2(report);
  return key === null ? null : crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}
