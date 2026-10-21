# Fingerprint v2: results

**No measurement on held-out data was performed.** The v2 key is implemented
and tested, and it reproduces its pre-registered predictions on the v1 corpus.
v2 was designed against that corpus, so that is a regression check, not a
measurement. The held-out corpus that would have measured v2 was started and
abandoned before any report was frozen (section 5). Nothing in this document
shows that v2 groups real reports better than v1.

The design, gates and predictions are in
[`fingerprint-eval-v2.md`](fingerprint-eval-v2.md), called "the
pre-registration" below. The v1 measurement is in
[`fingerprint-results.md`](fingerprint-results.md).

## Summary

- **The fault.** v1's key read stack frames only in V8's `at fn (url:line:col)`
  form. Firefox and WebKit stacks fell through. Their keys held the top frame
  and no error message, so a Firefox or WebKit report could never share a key
  with a Chromium report that had a stack.
- **The fix.** One parser for all three engines' stack formats, the error
  message normalised to one form across engines and kept as a deliberate field,
  and failed HTTP requests keyed on the endpoint.
- **Verified.** The tests pass. The implementation matches the prediction model
  on all 279,378 report pairs of the v1 corpus. A replay through the HTTP
  endpoint gave the predicted verdict.
- **Not verified.** Whether v2 groups better than v1 on reports it was not
  designed against.
- **Found along the way.** Two platform limitations that affect any browser
  crash reporter, and one observation about the SDK's fetch wrapper that still
  needs checking (section 6).

---

## 1. The fault in v1

v1's key is `generateFingerprint` in
[`fingerprint.util.js`](../server/utils/fingerprint.util.js). It is unchanged
since the v1 measurement at `521f9cb` and is now also exported as
`generateFingerprintV1`. It hashes three things:

- the project;
- the first line of `errorLog`, with numbers, UUIDs, hex addresses and
  timestamps replaced;
- the first two lines that start with `at `, with `:line:col` removed.

Only V8 writes frames that start with `at `. SpiderMonkey (Firefox) and
JavaScriptCore (WebKit) write `fn@url:line:col`, and their stacks have no header
line carrying the message. For those two engines:

- the "first line" slot held the top frame, not the message;
- the frame slot was empty.

The same error in the three engines, as v1 hashed it (the fixture from
`server/tests/fingerprint-v2.test.js`, in the stack forms the v1 corpus
recorded):

| Engine | String v1 hashed | v1 fingerprint |
|---|---|---|
| Chromium | `Shop::TypeError: Cannot read properties of undefined (reading 'toFixed')::at Ii (http://localhost:7110/assets/index-BOtVUl4o.js)\|at n (http://localhost:7110/assets/index-BOtVUl4o.js)` | `560cc2f96886e0c9a6a62513d60dc3bd` |
| Firefox | `Shop::Ii@http://localhost:<num>/assets/index-BOtVUl4o.js:<num>:<num>::` | `0e9f36b5faa53f1aab080b636d8cf427` |
| WebKit | `Shop::Ii@http://localhost:<num>/assets/index-BOtVUl4o.js:<num>:<num>::` | `0e9f36b5faa53f1aab080b636d8cf427` |

The Firefox and WebKit strings contain no message at all. Any two errors whose
top frame is the same function in the same file get the same key in those
engines, whatever the error was.

### How much of the v1 corpus this affected

From section 1 of the pre-registration, computed against the v1 corpus
(`reports.jsonl` SHA-256 `de4b8cd8…e412404`):

| v1 corpus | Reports |
|---|---|
| Firefox and WebKit reports | 444 |
| keyed on the top frame alone, with no message | 358 (81% of the 444) |
| no stack, so the bare message was the whole key | 86 |

The 358 are 53% of the corpus's 680 browser reports. That is the 680 reports in
v1's headline, which excludes the 68 Node reports.

The same section records that the v1 partition is fully explained by the code:
recomputing every key with the real v1 function reproduces the replay's
grouping, with 0 disagreements over 279,378 report pairs.

### Chromium to the other engines

A Chromium report whose stack has at least one `at ` line always has a
non-empty frame field in its v1 key. A Firefox or WebKit report's frame field is
always empty. The two keys therefore cannot be equal, so v1 could not group
such a Chromium report with a Firefox or WebKit report of the same error.

This follows from the code. The v1 results do not report a measured count of
Chromium-to-other-engine merges, and none is given here. v1's browser-only
recall was 0.2778. That figure also includes Firefox–WebKit pairs and stackless
reports, which this fault does not keep apart.

### False merges caused by this fault

v1 merged 9 unrelated incident pairs and 9 of 15 hard-negative pairs, across
284 report pairs. **How many of those this fault caused has not been
established, and no figure is given.** Other causes also produced v1 merges.
v1's own worked example, C1 + C3, uses Chromium stacks. Chromium's key does
include the message, but number replacement turned both status codes into
`<num>`, and the top frames were the same axios internals. Attributing each merge to a cause would need the per-pair
listing in the evaluation repository's `results/every-false-merge.md`, and that
work was not done.

---

## 2. What v2 changes

The v2 key is in the same file. Its specification is section 2 of the
pre-registration, as read by Amendment 1 (points P1–P34). The code cites those
points where it applies them.

### `parseFrame(line)`

Reads one stack line in V8 form (`at FN (LOC)`, `at LOC`) or in the
SpiderMonkey/JavaScriptCore form (`FN@LOC`). It returns `{ fn, file, line, col,
kind }`, or `null` for a line in neither form.

- **Function names** are reduced to the function's own name, so the engines
  agree. Leading `async ` and `new ` are removed, and so are V8 aliases
  (`[as x]`), Firefox async markers (`async*`) and nesting marks (`/<`). Only the
  text after the last `.` is kept, which drops V8 receivers. `global code`,
  `module code` and `<anonymous>` become the empty name.
- **Files** are reduced to the path. The content hash before `.js` is removed,
  so `/assets/index-BOtVUl4o.js` becomes `/assets/index.js`. Path segments that
  contain a digit become `<id>`, except source file names.
- **Kinds:** `native`, `sdk` (the path ends in `/sdk/bugsense.js`), `foreign`
  (`file:` or `node:`), `library` (`/node_modules/`), and `app` for everything
  else.
- Eval, `new Function` and WebAssembly frames are read in each engine's form.

### `parseStack(errorLog)`

Parses every line. Lines that parse in neither form are counted, and the count
is not part of the key. `file:` and `node:` frames are dropped when the stack
has an app frame, because in a browser stack they come from a server stack
pasted into the message.

### `normaliseMessage(message, frames)`

Step 1 maps each engine's wording of the same error to one neutral form. For
example:

| Engine | Message | Neutral form |
|---|---|---|
| V8 | `Cannot read properties of undefined (reading 'toFixed')` | `nullish-read toFixed` |
| SpiderMonkey | `can't access property "toFixed", e is undefined` | `nullish-read toFixed` |
| JavaScriptCore | `undefined is not an object (evaluating 'e.toFixed')` | `nullish-read toFixed` |

The same applies to missing functions and constructors, recursion, JSON
parsing, network failures, dynamic imports, undefined variables, minified React
errors and axios status codes. axios codes keep only their class, such as
`http 4xx`.

Step 2 strips data from any other message: URLs, `{…}` and `[…]` spans,
double-quoted strings, amounts and digit-bearing tokens are replaced, and the
result is truncated to 200 characters.

### `buildKeyV2(report)`

1. **The message.** The SDK 1.4.0 `error.message` field if it is present. For
   older SDKs, the title with `Uncaught `, `Unhandled Promise Rejection: ` and
   the error name removed, or V8's header line when the title is a component
   stack.
2. **The top app frame.** Native, SDK and foreign frames are dropped, library
   frames are dropped if any app frame remains, and the first frame left is
   taken. It enters the key as `function@file`, with no line or column.
3. **The request.** When the neutral message is `network` or `http Nxx`, the
   key uses the failed request (`METHOD PATH`) instead of frames.
4. **The layout.** The key string is laid out as in section 2.8 of the
   pre-registration, with an `fp2::` prefix so that no v2 key can equal a v1
   key. `generateFingerprintV2` hashes it with SHA-256 and keeps 32 hex
   characters, as v1 did.

The key does not read the page route, click breadcrumbs, line or column
numbers, or `browserInfo` (pre-registration, 2.1).

### Worked example

The three reports from section 1, through v2:

| Engine | Top frame | Neutral message |
|---|---|---|
| Chromium | `Ii@/assets/index.js` | `nullish-read toFixed` |
| Firefox | `Ii@/assets/index.js` | `nullish-read toFixed` |
| WebKit | `Ii@/assets/index.js` | `nullish-read toFixed` |

All three produce the key

```
fp2::Shop::nullish-read toFixed::Ii@/assets/index.js::::
```

and the fingerprint `b684733ccdf018f1a8a4f15a49c2908d`. The empty fields are
the request, which applies only to HTTP and network failures, and a trailing
separator. The key is unchanged by a release that only shifts line numbers or
the chunk hash. It changes when the minifier renames `Ii`, which is the
pre-registered production limitation (4.2). The test suite pins all three of
these behaviours.

### Changes outside the key

- **SDK** (`c40ecf1`): sends `error`, `request`, `source`, `componentStack` and
  `sdkVersion` as separate fields (8.1, P13–P19).
- **Server** (`7caca0a`): the telemetry endpoint, the similar-report hint for
  manual reports and the seed script use v2. Each bug records
  `fingerprintVersion`.
- **Migration** (`ee7641e`): re-keys stored bugs. It runs as a dry run unless
  told to apply, and merges bugs whose new keys collide (8.3). It has 12 tests
  in `server/tests/migration.test.js`.

---

## 3. Pre-registration

The pre-registration's thresholds, gates and predicted values were committed
before any v2 code was written. Git history is the evidence.

| Commit | Committed (local, +0530) | First on GitHub (UTC) | What |
|---|---|---|---|
| `d058bf4` | 2026-10-21 09:59:05 | 04:29:10, branch created at this commit | the pre-registration; the only file in the commit |
| `afed990` | 2026-10-21 10:44:29 | 05:14:35, same push as `0bd71a7` | Amendment 1, P1–P12 |
| `0bd71a7` | 2026-10-21 10:44:30 | 05:14:35 | the first v2 implementation commit: the parser, the key and 54 tests |

- **Commit graph.** `d058bf4` is an ancestor of `0bd71a7`
  (`git merge-base --is-ancestor d058bf4 0bd71a7`). The only earlier commits to
  `server/utils/fingerprint.util.js` are `ef2a9e5` (2026-09-08) and `d6b96ec`
  (2026-10-18). Both predate v2; the second added `topFrameOf` for v1.
- **GitHub's record.** A local commit date can be set to anything, so the
  stronger evidence is GitHub's activity log for the branch
  (`gh api repos/Krishnendu-9/bugsense/activity`, read 2026-10-21). It records
  the branch created at `d058bf4` at 04:29:10 UTC. The next push, at 05:14:35
  UTC, is `d058bf4..0bd71a7`. For 45 minutes, GitHub held the pre-registration
  and no implementation.
- **Branch.** The pre-registration says the evidence is the commit order on
  `main`. These commits are on `fingerprint/v2`, which has not been merged to
  `main`. The order holds on that branch and in GitHub's push log.

**What this shows.** The gates, the thresholds and every predicted value in
section 5 of the pre-registration existed in a public commit before any code
did.

**What it does not show.** It does not show that the design was written
without knowledge of the data. The pre-registration says it was written by a
session that had read every v1 failure (section 10). It also lists nine rules
that were added for specific v1 reports (5.3).

### What changed after the pre-registration

The registered text was never edited. `git diff d058bf4 HEAD --
docs/fingerprint-eval-v2.md` contains no deleted lines. Every change is
appended under "Changes to this document":

- **Amendment 1** (`afed990`, `fed9e4c`, `8f2ab2c`) resolves 34 points where
  sections 2 and 8 were silent or ambiguous. None changes a threshold or a
  prediction. **Its text and its commit disagree about timing.** The text says
  P1–P12 were "written before any implementation code". The commit message of
  `afed990` says they were "resolved during implementation rather than before
  it" and reports that "the implementation reproduces the registered v1
  predictions exactly". The commit landed one second before `0bd71a7`. The
  commit message is the more accurate record: these readings were settled with
  the implementation in hand. P12 and P34 say so themselves.
- **Amendment 2** (`17c71b2`, tagged `v2-key-freeze`) changes the text handed
  to the corpus builder, because the registered text described which report
  fields the key reads. It also pins the browser builds and strengthens the
  builder's isolation. It does not change the key.
- **Scorer change** (`fd90f4e`). v1's scorer voids a run unless exactly 4 bugs
  existed before the replay, and the seed now creates 7. A `--seeded-bugs`
  option was added. This was decided after the scorer had voided the two HTTP
  regression runs. Per the amendment, it changes only whether a run is void,
  never a gate value: v1's runs score byte-identically without the option.
- **Isolation weakened** (`add1236`). The registered rule was that the capture
  would not go ahead without Claude Code's sandbox. The sandbox is not
  available on native Windows, and the amendment says the capture would go
  ahead anyway under weaker measures. It records this as a weakening decided
  after the lock test result was known.

---

## 4. Verification performed

All of it uses either synthetic inputs or the v1 corpus. The v1 corpus is
development data for v2.

### Unit tests

`server/tests/fingerprint-v2.test.js` had 54 tests when the key landed
(`0bd71a7`). They cover `parseFrame` for V8, SpiderMonkey and JavaScriptCore
lines, `parseStack`, `normaliseMessage`, and the key built from all three
engines' forms of the same error. The stack lines are in the forms the three
engines produced in the v1 corpus.

The file now has 64 tests. `c40ecf1` added 6 that compare old-SDK and SDK 1.4.0
payloads of the same error, and `7caca0a` added 4 for manual reports (P34). All
64 pass (`cd server && npm test`, run 2026-10-21).

### Function-level replay

The implementation was run over all 748 reports of the v1 corpus, and its
partition was compared with the prediction model's. Grouping was identical
across all 279,378 report pairs (748 × 747 / 2), and every gate value of the
pre-registered line (a) was reproduced exactly. The sources are the commit
messages of `0bd71a7` and `afed990`. The implementation and the model differ
only in key text (P2, P6, P10 and the `fp2::` prefix), never in grouping.

Line (a), next to v1's published result:

| Gate | v1 | v2 on the v1 corpus (line (a)) |
|---|---|---|
| Ordinary merges | 9 | 0 |
| Hard-negative pairs merged | 9 of 15 | 8 of 15 |
| Headline recall | 0.2864 | 0.6890 |
| Version-only recall, production | 0.2262 | 0.4583 |
| Browser-only recall | 0.2778 | 0.8070 |
| Data-variant pairs merged | 8 of 20 | 20 of 20 |
| Call-path pairs merged | 0 of 6 | 6 of 6 |
| Seed 1 vs seed 2 | identical | identical |
| Verdict | Change the code | Change the code |

**These are not measurements of v2.** Every rule in v2 was chosen with these
reports' failures in view. Re-scoring this corpus after the change measures
whether the code remembers them, which v1's results document says in so many
words.

### HTTP replay

The v1 corpus was replayed through the telemetry endpoint into the stack frozen
at `17c71b2`, and the result was scored with v1's scorer. There were two runs.
The scorer voided both on the seeded-bug count alone, and every other validity
check passed. With `--seeded-bugs 7`, the output matched the old scorer's in
everything except the validity line and the declared count, and the verdict was
"Change the code", as line (a) predicted. The source is Amendment 2, "The second
permitted change to the scoring tool".

**The per-gate output of those runs is not committed to this repository.**
This document therefore does not restate gate values for them.

### Arrival order

The v2 key is a pure function of the report and reads no stored state
(pre-registration 2.8), so the order in which reports arrive cannot change a
key. Line (a)'s seed 1 vs seed 2 gate (identical) is among the values the
function-level replay reproduced.

The HTTP runs are where arrival order could matter, through stored state. The
repository records their verdict but not their seed 1 vs seed 2 comparison. The
verdict does not imply that comparison: a difference between the seeds would
put that gate in "Publish", and the overall verdict would still be "Change the
code". **No figure for arrival order through HTTP is given here.**

---

## 5. What was not done

**No measurement on held-out data was performed.**

### What was planned

Sections 6 and 7 of the pre-registration planned the following. A new builder
session with no project context would build a fresh corpus: one new instance of
each of v1's 57 incident kinds, plus the builder's own categories, at least 710
headline reports. Routes and button labels would be shared between incidents,
so they could not act as labels. The corpus would include a repeat block and be
captured against the frozen stack. The lock file would be committed, the
builder's transcript audited, and the corpus replayed twice and scored once.

### What happened

Amendment 2 prepared the handover text and the quarantine. The sandbox turned
out to be unavailable on Windows, and the capture was cleared to go ahead under
weaker isolation (`add1236`, 15:25 local time). A builder session started. Its
repository, `grouping-corpus-v2`, has one commit: its hard-case categories
(`ae37072`, 15:30 local time). The capture was then abandoned for time.

- No corpus was frozen, and no `corpus.lock` exists.
- No transcript audit, replay or scoring took place.

The fixture, harness and scratch files remain uncommitted in that folder. They
were not opened for this document. Anyone who reads them can no longer treat
them as held-out data.

### What it would have added

- **A measurement on data the code was not fitted to.** This is the only kind of
  number that says how v2 groups reports it has not seen. Every v2 figure on the
  v1 corpus is a regression check.
- **A test of the predictions.** For held-out data the pre-registration
  predicts the following, with a verdict of "Change the code":

  | Gate | Prediction |
  |---|---|
  | Headline recall | 0.55–0.69 |
  | Browser-only recall | 0.60–0.80 |
  | Hard-negative pairs merged | 6–10 |
  | Data-variant pairs | at least one split |

  These predictions are neither confirmed nor refuted.
- **A corpus where the route cannot act as a label.** In v1 it can, which is
  why the pre-registration rejected a key that reads the route even though it
  scored better on v1 (2.9).
- **The first measurement of repeated reports.** The repeat block would have
  measured a crash loop in one browser on one build, which is the commonest
  production case. v1 covered it only with 10 controls.
- **Real SDK 1.4.0 payloads.** The v1 corpus was captured by an older SDK.
  v2's first-choice inputs (`error.message`, `request`, `source`) have only
  been exercised by unit tests, never by reports a browser actually sent.

### Why its absence limits the claim

The only evidence that v2 groups better than v1 comes from the corpus v2 was
designed against. The claim this document can support is narrower:

- v2 implements its specification, as the unit tests check;
- v2 matches its pre-registered prediction model on the v1 corpus;
- by construction, v2 removes the parsing fault in section 1. A Firefox or
  WebKit stack now yields a frame, and the message is read from its own field.

**Whether v2 improves grouping on reports it was not designed against is
unknown.** Even if it does, the pre-registered expectation is that it still
fails two gates: hard-negative merges and version-only recall in production
builds. Any capture run under the isolation in place at the time would also
have had to be reported with the weakened quarantine stated (section 3).

---

## 6. Platform limitations found during the capture

These were observed while the held-out capture was being built. The capture
specification pins Playwright 1.64.1 and its browser builds: Chromium
156.0.8078.4, Firefox 157.0 and WebKit 27.2 (Amendment 2). Later releases may
behave differently. The capture's own records are uncommitted (section 5).
Where v1's committed results already show the same behaviour, they are cited.

### 6.1 Chromium dispatches no `unhandledrejection` for errors the browser itself creates

**Observed.** In Chromium, `response.json()` rejecting with a `SyntaxError`
produced no report. The same `SyntaxError`, thrown by `JSON.parse` in
application code, did produce one. Firefox and WebKit reported both. The two
cases differ only in where the error object was created: inside the browser's
own implementation, or in page script.

**Rule, as observed.** Chromium dispatches no `unhandledrejection` event when
the rejected error object was created outside script context.

**Committed corroboration.** In v1, `res.json()` on an HTML error page (C6)
produced no report in Chromium in any cell. v1 also found that C6 gets no event
in Chromium with no SDK on the page at all
([`fingerprint-results.md`](fingerprint-results.md), "In Chromium, unhandled
`fetch()` failures are never reported"). The `JSON.parse` half of the
comparison comes from the v2 capture only.

**Consequence.** No crash reporter that listens for `unhandledrejection` can
observe this class of error in Chromium, whether it is BugSense or another. The
report is lost before any SDK code runs, so no change to grouping can recover
it.

This is separate from the `crossorigin` problem fixed in PR #6. That problem
concerned fetch network failures re-thrown through the SDK's wrapper.

### 6.2 React 18 development builds report one error twice

**Observed.** One trigger produced two reports in a React 18 development build.
The behaviour was identical in Chromium, Firefox and WebKit, so it is a
property of the build, not of the engine. Production builds produced one
report.

**Committed corroboration.** v1 found the same for render errors caught by an
error boundary (B1–B3). It recorded exactly two reports per trigger in
`browser-dev` in all three browsers, every attempt, and one in `browser-prod`.
The React 18.3.1 development build dispatches a window `error` event in
addition to the boundary's own `captureError` call, and does so with no SDK on
the page.

**Consequence.** In development builds, occurrence counts for these errors are
doubled. Production counts are unaffected.

### 6.3 Unverified: the SDK's fetch wrapper as the top frame

**Observed, not established.** For network failures, the SDK's own fetch
wrapper appeared as the top frame. If that frame reached the key, every network
failure through the wrapper would share a top frame. v2 would then tell those
failures apart only by message and request, which is less discrimination for
that error class.

**What the code is meant to do:**

- frames whose path ends in `/sdk/bugsense.js` are classed `sdk` and dropped
  before the top frame is chosen (`frameKind` in `fingerprint.util.js`);
- a network failure with a known request is keyed on the request, not on
  frames (2.5);
- the test "a fetch network failure, with the SDK wrapper frame on top" covers
  the case where both hold.

The observation would matter if the wrapper's frame is not recognised as the
SDK's, for example because the SDK is served from another path, or if no
request is found, in which case v2 falls back to frames (P8). **Whether either
applies has not been checked.**

**Follow-up.** Using a new capture, not the abandoned one, record the wrapper
frame's exact file path in each engine and check whether the report carries
`request`. Then add the observed stack form as a unit test.

---

## Figures not given

The following figures have no source in this repository, so they are not given
here:

- how many of v1's false merges the parsing fault caused;
- a measured count of Chromium-to-other-engine merges in v1;
- per-gate values from the HTTP replay;
- the seed 1 vs seed 2 comparison from the HTTP replay;
- any held-out figure for v2.

## Reproducing what is here

```sh
cd server && npm test                                   # 64 tests in fingerprint-v2.test.js, plus the rest
git merge-base --is-ancestor d058bf4 0bd71a7 && echo ordered
git log --reverse --format='%h %ad %s' --date=iso -- docs/fingerprint-eval-v2.md
git log --reverse --format='%h %ad %s' --date=iso -- server/utils/fingerprint.util.js
gh api "repos/Krishnendu-9/bugsense/activity?ref=refs/heads/fingerprint/v2" \
  --jq '.[] | "\(.timestamp) \(.activity_type) \(.before[0:7])..\(.after[0:7])"'
git diff d058bf4 HEAD -- docs/fingerprint-eval-v2.md | grep -c '^-[^-]'   # 0: nothing registered was edited
```
