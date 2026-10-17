# Fingerprint evaluation — design

**Status:** stage 1 of 3, design only. No corpus exists and nothing has been
measured.

The thresholds in section 5 are fixed by the commit that adds this document.
That commit is pushed before any corpus file exists. A local commit date can be
set to anything, so the evidence is GitHub's record of the push, and the results
document cites both the commit and its push date.

Stages:

1. **Design** (this document).
2. **Build and freeze the corpus**, blind to the normaliser (section 2).
3. **Replay and report** in `docs/fingerprint-eval-results.md`, graded against
   section 5 without moving any threshold.

---

## What is being measured

When the browser SDK sends an error report to `POST /api/telemetry`, BugSense
either adds it to an existing bug or opens a new one. That is the decision under
test. Two reports are **grouped** if they end up on the same bug document.

Grouping is by equality of a stored key, so it is transitive: the system
partitions reports into bugs. Every pair of reports therefore gets exactly one
decision — same incident or not — and that is what the metric scores.

Section 6 lists what this evaluation does **not** measure.

---

## 1. The corpus

### Where the reports come from

No stack trace in the corpus is written by hand. Every report is produced by
actually triggering a known, deliberate bug in a real runtime, so trace shapes
are whatever the engines really emit and the ground truth is known by
construction rather than by someone reading traces and deciding.

- **Browser fixture.** A small React 18 shop app ("Shopfront") built with Vite,
  with one trigger route per deliberate bug. It embeds the real BugSense SDK the
  way a customer would: a `<script>` tag loading `/sdk/bugsense.js` from a
  running BugSense stack, with `data-api-url` pointed at a **capture server**
  instead of BugSense. The capture server records every request body verbatim
  and forwards nothing. So the corpus is exactly what the SDK puts on the wire,
  including its own URL scrubbing, without anyone reading the SDK's code.
- **Browsers.** Playwright drives Chromium (V8, the Chrome format), Firefox
  (SpiderMonkey) and WebKit (JavaScriptCore, the Safari engine). Each trigger
  runs in a fresh browser context, so the SDK's per-session cap and 10-second
  repeat suppression never interfere. Engine builds are pinned through the
  Playwright version and recorded in the lock file.
- **Helpers on the side.** A mock backend returns the deliberate 404/500
  responses. A second origin serves scripts without CORS headers to produce
  `Script error.`. Endpoints with nothing listening produce real network
  failures.
- **Server-side fixture (not graded; see section 4).** An Express 4 API in
  TypeScript whose errors are posted by a reporter written for this evaluation.

Every report is tagged in a separate metadata file with the trigger that fired
it. The replay sends only the captured body, never the metadata.

### Environments

A real project sends reports from one kind of deployment, so pairs are scored
within an environment.

| Environment | What it is | In the headline |
|---|---|---|
| `browser-prod` | `vite build` output served by `vite preview`: minified, hashed chunk names | yes |
| `browser-dev` | the Vite dev server: unminified modules at their source paths | yes |
| `node-plain` | compiled `dist/*.js`, no source maps | no — section 4 |
| `node-mapped` | the same build run with `--enable-source-maps` | no — section 4 |

Browsers never apply source maps to `error.stack`. Source-mapped frames
therefore appear only in the Node environments, which are outside the headline.
The headline does not test source-mapped frames, and the results document says
so.

### Cells: what varies within an environment

- **Browser environments:** 3 browsers × 2 app versions = **6 reports per
  incident**.

**App versions.** v2 is v1 plus an unrelated feature commit. It adds code above
every bug site in the same files, so line and column numbers shift. Bundle chunk
hashes change, and the minifier may rename identifiers. It does not touch any
defect line or any dependency. The v1→v2 diff is kept in the corpus so anyone
can check that it doesn't fix or alter a bug.

**Variant incidents** (marked ◆ below) get **one extra report** in the
Chromium/v1 cell. It differs from the standard report in that cell *only* in
the variant: a different data value, or a different call path. This tests that
axis on its own.

### Incidents

These are the 27 browser incidents from the design session. The builder adds its
own (section 3) before the corpus is frozen.

| ID | Defect (each is its own incident) | What makes it hard |
|---|---|---|
| **A1** | Click handler reads a property of `undefined` (coupon on an empty cart) | baseline |
| **A2** | `ReferenceError` inside a lazy-loaded chunk | the chunk file name changes per build |
| **A3** | Cart reducer throws `new Error('Invalid cart state')` | — |
| **A4** | Checkout validator throws the same message | hard negative with A3: same message, different site |
| **A5** | Unbounded recursion in the category tree | messages differ by engine (`RangeError: Maximum call stack size exceeded` vs `InternalError: too much recursion`), long repetitive stacks |
| **A6** ◆ | `JSON.parse` of a corrupt `localStorage` value | the message embeds the bad value (data variant) and the wording differs per engine |
| **A7** ◆ | ``throw new Error(`Product ${id} not found`)`` | ID in the message (data variant) |
| **A8a** | `formatPrice(undefined)` from `ProductCard` (draft products have no price) | hard negative with A8b |
| **A8b** | `formatPrice(undefined)` from `WishlistRow` (stale cache shape) | identical message and top frame; the bug is in each caller, fixed separately |
| **A9** ◆ | `slugify` itself mishandles emoji, reached from `ProductPage` or `SearchResults` | same bug, different frames below the top (call-path variant) |
| **B1** | Render `TypeError` in `ProductReviews`, caught by an error boundary | React component stack (see below) |
| **B2** | "Objects are not valid as a React child" in `OrderHistory` (boundary) | production React gives `Minified React error #31` with a decoder URL and args |
| **B3** | The same invariant in `ProfileBadge` (boundary) | hard negative with B2: top frames inside `react-dom` |
| **B4** | Conditional hook ("Rendered more hooks…") in `Filters`, **no** boundary | reaches the SDK as an uncaught error |
| **C1** | axios `POST /api/orders` → 500 | top frames are axios internals |
| **C2** | axios `GET /api/recommendations` → 500 from a different component | hard negative with C1: identical message and top frames |
| **C3** ◆ | axios `GET /api/products/:id` → 404 for deleted products | different IDs in the route (data variant) |
| **C4** | `fetch` to the analytics endpoint fails at the network level | `Failed to fetch` / `NetworkError when attempting to fetch resource.` / `Load failed` |
| **C5** | `fetch` to the image-upload endpoint fails the same way | hard negative with C4; may carry no distinguishing information at all |
| **C6** | `res.json()` on an HTML error page | messages differ completely per engine |
| **D1** | Unhandled rejection: `Error` thrown inside `async loadCart` | async frames (`at async …`, `async*…@`) |
| **D2** | Unhandled rejection with the string reason `'timeout'` | no stack |
| **D3** | Unhandled rejection with the string reason `'quota exceeded'` elsewhere | hard negative with D2: both stackless, only the message differs |
| **D4** | Unhandled rejection with a plain object reason `{ code: 'E_AUTH' }` | not an `Error` at all |
| **D5** | Error thrown in a `setTimeout` callback | short stack cut at the timer boundary |
| **E1** | Error in a cross-origin script served without CORS | `Script error.`, no stack |
| **E2** | A different error in another cross-origin script | hard negative with E1; likely byte-identical to it |

**React component stacks.** B1–B3 are caught by a fixture error boundary that
calls the documented `BugSense.captureError(error, info.componentStack)`. The
second argument is the SDK's free-text context, and it is the only documented
way to attach a component stack. B4 has no boundary, so it covers React errors
that arrive through the SDK's uncaught-error path.

**Hard-negative pairs** (different bugs designed to look alike): A3/A4,
A8a/A8b, B2/B3, C1/C2, C4/C5, D2/D3 and E1/E2. The builder may add more.

### Size

These counts cover the design-session incidents, assuming every planned report
is captured. Builder-added incidents add six reports each (seven if they are
variants). All totals are recomputed and recorded in the lock file before the
freeze.

| | Reports | Pairs | Same-incident pairs |
|---|---|---|---|
| `browser-prod` | 27×6 + 4 = 166 | 13,695 | 23×15 + 4×21 = 429 |
| `browser-dev` | 166 | 13,695 | 429 |
| **Headline** | **332** | **27,390** | **858** |

Cross-environment pairs (`browser-prod` × `browser-dev`): 27,556, of which
1,024 are same-incident.

Key subsets:

- **Version-only pairs:** 81 per browser environment.
- **Browser-only pairs:** 162 per browser environment.
- **Isolated variant pairs:** 4 per browser environment (A6, A7, C3 for data,
  A9 for call path).

Ten control reports are added on top. They are drawn by a seeded random choice
from the browser reports and re-sent verbatim at the end of the replay
(section 5).

### Ground truth

Two reports are the same incident if and only if the same trigger fired them.
The incident list *is* the label set. Nobody labels a trace after seeing it.

A trigger run that produces no report, or more than one, is retried up to three
times. If it still fails, it is dropped and listed. If more than 10% of planned
reports are missing, the fixture is fixed before the corpus is frozen.

---

## 2. Keeping the corpus blind to the normaliser

A corpus written by someone who has read the normaliser ends up testing that
person's reading of it: they choose variations it already handles and skip the
ones it doesn't. The result would look like a measurement and mean nothing.
The rule is therefore that **no one who builds the corpus or the harness sees
how the fingerprint is computed**.

**Quarantined** (found by searching file *names* for "fingerprint", without
opening the files):

- `server/utils/fingerprint.util.js`
- `server/controllers/telemetry.controller.js`
- `server/controllers/bug.controller.js`
- `server/models/Bug.model.js`
- `server/tests/` (all of it)
- `server/public/sdk/bugsense.js`, and the SDK tests under `client/src/test/`
- `dev_docs/` (all of it)
- `CLAUDE.md`
- The README sections that describe deduplication: Features, Architecture,
  Engineering Decisions, and the telemetry endpoint table
- The git history and GitHub pages of all of the above

**How the separation is kept:**

1. **The builder works outside this repository.** The corpus and harness are
   built in a standalone directory, `bugsense-eval/`, with its own git repo. It
   is *not* a sparse checkout of this repository, because a sparse checkout
   still carries the full history and `git show` would reveal every quarantined
   file. The work is copied into this repo's `eval/fingerprint/` after the
   freeze.
2. **The builder is a fresh session with no project context.** It is a new
   Claude Code session started in `bugsense-eval/`. This repo's `CLAUDE.md` and
   project memory don't load there. Permission rules deny reads of this
   repository's path and `WebFetch` to github.com and raw.githubusercontent.com,
   because the repository is public. This is enforced by rules and checked by
   the audit below; it is not physically impossible.
3. **The system is used only as a black box.** The Docker stack is started
   outside the builder's session. The SDK is loaded only through its `<script>`
   tag, and the builder never fetches or opens it as a file. The replay talks to
   the stack over HTTP and imports no server code. Nothing under `server/` is
   changed at any stage.
4. **The corpus is frozen before any result exists.** The SHA-256 of every
   corpus file, the fixture commit, the Playwright and browser versions and the
   Node image digests go in `corpus.lock`, committed in `bugsense-eval/` before
   the first replay. After that, the corpus does not change. If a corpus mistake
   is found after results exist, it is fixed in a new corpus version and both
   results are reported.
5. **The separation is audited.** The builder session's transcript is kept and
   searched for every quarantined path, for this repository's path and for
   `fingerprint`. The results document states the outcome. A breach voids the
   corpus, and it is rebuilt by a new builder.

---

## 3. Where the hard cases came from

### Disclosure

The hard-case categories in section 1 were not chosen independently of the
normaliser.

- **The author of this design is the same model that wrote the normaliser.** The
  design was written by a Claude Code session. Earlier Claude Code sessions on
  this project wrote `server/utils/fingerprint.util.js`. The design session has
  not opened that file or any other quarantined file, and it has no access to
  those earlier conversations. But it shares their model, and so their ideas of
  what a fingerprint must survive. Its list of hard cases is likely to be the
  list the normaliser was written against.
- **The design session had some project knowledge.** It had read `CLAUDE.md`
  before the task began, so it knew three things:
  - SDK reports are deduplicated by a stored fingerprint with a unique index per
    SDK source.
  - Manual reports never merge.
  - The SDK strips query strings and fragments from URLs, including inside
    stack traces.
- **The task prompt came from someone who knows the normaliser.** The owner, who
  knows how the normaliser works, wrote the prompt and named categories
  directly, including shifted line numbers across app versions. Knowledge of the
  code can reach the corpus through the prompt.

**Effect:** the adversarial cases are biased toward failure modes that the
owner and this model already think of. Those are the failure modes the
normaliser was most likely built to handle. The cases are biased away from
failure modes neither thought of. That bias would make the result look better
than it is.

### Mitigation: the builder proposes first

Before seeing this document, the builder session receives only the brief in the
appendix, copied verbatim. It writes its own hard-case categories to
`builder-categories.md` and commits that file in `bugsense-eval/`. Only then is
it given this document.

It then:

- adds an incident for every category of its own that section 1 doesn't cover;
- adds hard-negative pairs it proposes to the hard-negative list;
- records all of this in `corpus.lock`.

Each category is marked with where it came from:

- **U** — named in the owner's prompt
- **D** — added by the design session
- **B** — proposed by the builder before seeing this document

A category proposed by more than one source gets every mark that applies.

| Category | Origin |
|---|---|
| Chrome, Firefox and Safari stack formats | U |
| Minified bundles | U |
| Source-mapped frames (server-side only, section 4) | U |
| React component stacks | U |
| Express/Node server traces (section 4) | U |
| axios failures | U |
| fetch failures | U |
| Async rejections | U |
| Same bug from different browsers | U |
| Same bug across app versions with shifted line numbers | U |
| Different bugs with similar top frames | U |
| Unminified dev-server builds | D |
| Lazy-chunk file hashes that change per build | D |
| Minifier renaming identifiers between builds | D |
| Engine-specific error messages (recursion, JSON, fetch) | D |
| Values and IDs embedded in messages | D |
| The same message thrown from different sites | D |
| The same bug reached through different call paths | D |
| Production React minified error codes | D |
| Stackless rejections (string and object reasons) | D |
| Stacks cut at a timer boundary | D |
| Cross-origin `Script error.` with no stack | D |
| Node runtime upgrades shifting internal frames (section 4) | D |
| *(builder's categories, added before the freeze)* | B |

Every gate and every error listing in the results is broken down by origin. If
the system does markedly better on U and D categories than on B categories, the
results document says so as evidence of the bias described above.

---

## 4. Server-side reports (not graded)

BugSense has no server SDK. Node errors could only arrive through a reporter
someone writes, so a hand-written reporter tests a payload shape the system
never actually receives. These incidents are therefore **excluded from the
headline and from every gate**. They are reported in their own section of the
results as an illustration of how grouping would behave for a future server
SDK.

The fixture is an Express 4 API written in TypeScript and compiled to
JavaScript. Its error middleware and `unhandledRejection` handler post to the
capture server in the JSON shape observed in captured browser payloads. They
fill the fields the SDK fills from an `Error` (message, stack, URL set to the
request path without its query) and leave fields with no server equivalent
empty. It runs on `node:22-alpine` and `node:24-alpine`.

**Cells:** 2 app versions × 2 Node versions = 4 reports per incident. Variants
get an extra report on v1/Node 24.

| ID | Defect | What makes it hard |
|---|---|---|
| **F1** | `POST /orders` reads `req.body.customer.id` with no customer | sync throw through Express's router frames |
| **F2** | Async route handler rejects; Express 4 doesn't catch it | process-level `unhandledRejection` |
| **F3** ◆ | Mongoose `CastError` for an invalid ObjectId (real Mongoose) | the message embeds the bad value |
| **F4** | Auth middleware reads `req.user.id` with no user | hard negative with F1: same message |
| **F5** | axios to the payment provider → 502 | top frames are axios's Node adapter |
| **F6** | Node `fetch` to the inventory service → `fetch failed` (ECONNREFUSED) | undici internal frames shift with the Node version |
| **F7** | Node `fetch` to the email service → `fetch failed` | hard negative with F6 |
| **F8** ◆ | `parseMoney` itself is wrong, reached from two routes | call-path variant |

**Size:** 34 reports per Node environment, 561 pairs each, 56 same-incident.
There are 1,156 cross-pairs between `node-plain` and `node-mapped`.

**Reported:** the same metrics as the headline, including source-mapped versus
plain frames. Also every merge between a Node report and a browser report
(22,576 pairs, all different incidents). None of it affects the verdict.

---

## 5. The metric and the thresholds

### Pair decisions

For every unordered pair of reports *(i, j)*:

- **Truth:** same incident or not.
- **Prediction:** same bug or not.

| | Same bug | Different bugs |
|---|---|---|
| **Same incident** | TP | **FN — false split** |
| **Different incidents** | **FP — false merge** | TN |

- **Precision** = TP / (TP + FP): of the pairs the system merged, how many
  belong together.
- **Recall** = TP / (TP + FN): of the pairs that belong together, how many the
  system merged.

All four counts are reported alongside both ratios.

### Headline: two lines

**Headline (graded):** every within-environment pair in `browser-prod` and
`browser-dev`. This includes pairs from different incidents whose `message` and
`stack` fields are byte-identical, such as E1/E2.

**Headline excluding byte-identical different-incident pairs:** the same numbers
with those pairs removed, and their count stated next to the line.

**Why both:**

- The first line is what a user experiences. Two different bugs collapsed into
  one is a real false merge, whatever the reason. The reports may also differ in
  fields other than message and stack, such as page URL or breadcrumbs, that the
  system could have used. This is the line that is graded.
- The second line shows how much of the error comes from reports that carry no
  distinguishing error content at all. It tells a reader whether a better
  fingerprint could fix the problem or whether the information isn't in the
  error.

Identity is tested byte for byte, with no normalisation, so the split encodes no
assumption about what ought to match. Same-incident pairs that are
byte-identical stay in both lines, and their count is given so trivial
agreement can be discounted.

### Per-pair and per-incident recall

**Per-pair recall** (micro) weights an incident by its number of pairs.

**Per-incident recall** (macro) is computed by:

1. Taking each incident's recall over its own same-incident pairs, pooled over
   the two browser environments.
2. Averaging those recalls with every incident weighted equally.

Incident sizes are nearly equal by design, so the two should be close. If they
are not, one large easy incident is carrying the per-pair number. Both are
reported for every recall figure. **Every recall gate is graded on the lower of
the two.**

### Cross-environment pairs

`browser-prod` × `browser-dev` pairs are reported in full.

- **Splits there are informational**, since no single project produces those
  pairs.
- **Merges there count towards the false-merge gates**, since a merged bug hides
  an incident wherever it came from.

Breakdowns are reported by environment, by category origin (section 3) and by
which axes differ in the pair: browser only, version only, variant only, or
several.

### Why a false merge is worse than a false split

A false split creates a duplicate bug. It is visible, someone closes it as a
duplicate, and nothing is lost.

A false merge is silent:

- The second incident never gets its own bug, so it never fires a `created`
  alert.
- Its occurrences inflate someone else's count.
- Triage, assignment and status apply to the wrong problem.
- When the first incident is fixed and resolved, the second one keeps arriving.
  That shows up either as a false `regression` against a correct fix, or not at
  all.

So false merges are gated separately and much more strictly than splits, and
one is not traded off against the other.

One merge of two six-report incidents is 36 false-merge pairs, so a pairwise
precision ratio is really a count in disguise. The false-merge gates are
therefore stated in **incident pairs merged**, and pairwise precision is still
reported.

### Every error is listed

The results document lists every error individually:

- **Every false-merge pair, in the body:** the two report IDs, both incidents
  with their origin marks, the environment, the axes that differ, both messages,
  the first five stack frames of each side by side, and the bug ID they landed
  on.
- **Every false-split pair, in an appendix table** with the same columns, the
  two bug IDs instead of one, and each incident's split pattern.
- Every byte-identical pair, and every incident that ended with fewer reports
  than planned.

### How the decision is read

The replay runs against the Docker stack at the commit under test, recorded in
the results:

1. Start from a fresh volume, seed it, and record the four seeded bugs so they
   can be excluded. A corpus report landing on one of them counts as a false
   merge.
2. Send two throwaway probe reports that are not in the corpus. Use them to
   work out, from the API's responses and listings alone, how to tell which bug
   a report landed on. Then wipe and reseed.
3. Replay the corpus, including section 4's reports, one at a time in a seeded
   random order, paced under the telemetry rate limit. Retry any `429`.
4. Re-send the 10 controls verbatim.
5. Run the whole replay a second time with a different seed, on a fresh volume.

### Validity checks

The run is void, and nothing is graded, if:

- any control fails to merge with its original
- any report fails to land after retries
- more than 10% of planned reports are missing
- the quarantine audit finds a breach

### Reference baselines (context, not gates)

Two naive groupings are computed on the same corpus so the numbers have a
scale: byte-equal `message` + `stack`, and byte-equal `message` alone.

### Thresholds

Each gate is graded on the graded headline line, separately, into one of three
bands. The overall verdict is the worst band of any gate.

- **Good** — nothing further.
- **Publish with the limitation stated** — the result is published along with
  each failing gate's limitation (see below). The code may be improved later,
  but nothing is held back.
- **Change the code** — the result and the limitation are published the same
  way, and the normaliser is fixed. The fix is then measured on a held-out
  corpus.

Bands meet exactly at the stated numbers: a value equal to a lower bound belongs
to the higher band. For example, a headline recall of 0.78 is in
0.70 ≤ r < 0.85, so the verdict on that gate is *publish with the limitation
stated*.

| Gate | Good | Publish with the limitation stated | Change the code |
|---|---|---|---|
| Merges between two incidents that are *not* a designated hard-negative pair (headline or cross-environment) | 0 | — | ≥ 1 |
| Distinct hard-negative pairs merged, in either environment or across them, byte-identical pairs included | 0 | 1–2 | ≥ 3 |
| Headline recall (lower of per-pair and per-incident) | ≥ 0.85 | 0.70 ≤ r < 0.85 | < 0.70 |
| Version-only recall, **each** browser environment (lower of the two) | ≥ 0.95 | 0.80 ≤ r < 0.95 | < 0.80 in either |
| Browser-only recall, both browser environments pooled (lower of the two) | ≥ 0.80 | 0.50 ≤ r < 0.80 | < 0.50 |
| Isolated data-variant pairs (A6, A7, C3 and builder data variants, each environment) | all merged | — | any split |
| Isolated call-path pairs (A9 and builder call-path variants, each environment) | all merged | any split | — |
| Seed 1 vs seed 2 partitions | identical | any difference | — |

The gates apply to builder-added incidents exactly as to the design-session
ones. Builder hard-negative pairs join the second row, and the counts in that
row do not change however many pairs are added.

If E1 and E2 merge, as their likely byte identity suggests, that is one
hard-negative merge. On that gate, the best available verdict is then *publish
with the limitation stated*.

**Where a limitation is stated.** For each gate that is not Good:

1. **In the results document.** A "Limitations" section has one paragraph per
   failing gate, giving:
   - the measured value and its band;
   - the incidents involved, with their origin marks;
   - the error cases that caused it, linked to their rows in the listing;
   - one sentence on what a user would see.
2. **In the README.** The "Known limitations" section gets one bullet per
   failing gate, in plain words, linking to that paragraph. An example: "Two
   different bugs that throw the same message from a shared helper may be
   grouped into one bug."

These bullets are added in the same change that publishes the results, and are
removed only when a held-out re-measurement puts the gate back in Good.

**Why these numbers:**

- **Any ordinary merge means change the code.** The ordinary incidents differ in
  message, throw site or both. Collapsing two of them is a plain defect, not a
  hard case.
- **One or two hard-negative merges mean publish with the limitation.** These
  pairs are designed to share messages and top frames, and some, like E1/E2,
  may share everything. Merging one is a real but bounded limitation.
- **Headline recall of 0.85 allows for known engine differences.** A5, A6, C4
  and C6 produce engine-specific messages by construction. If every one of their
  cross-browser pairs splits, per-pair headline recall falls by about 12% (about
  104 of 858 pairs) and per-incident recall to about 0.88. A splitter is the
  lesser error, so 0.85 allows that with a small margin. Below 0.70 there is
  much more splitting than that.
- **Version recall is gated per environment and strictly.** A fingerprint that
  splits on line numbers or chunk hashes reopens every ongoing incident as a new
  bug on every deploy. A pooled number would hide one broken environment.
  Concretely, 0.95 means at most 4 of 81 pairs (about one incident) per
  environment, and 0.80 means at most 16.
- **A single data-variant split means change the code.** A fingerprint that
  includes an ID or value from the message creates one bug per value: for A7 or
  C3, a bug per product. That growth is unbounded. A call-path split is bounded
  by the number of call sites, so it only means publish with the limitation.
- **Order dependence means publish with the limitation and investigate.** A pure
  fingerprint can't depend on order. If it does, something stateful is involved
  and needs explaining before any number is trusted.
- **Granularity.** One incident moves version recall by about 4 points per-pair
  (3 of 81) and per-incident (1 of 27). The thresholds are set with that in
  mind.

### After a code change

Whoever changes the normaliser will have seen every failure, so re-scoring the
same corpus afterwards measures memory, not quality. A fix is checked two ways:

- **Against the frozen corpus**, as a regression check only.
- **Against a new held-out corpus**, built blind by a new builder with new
  incident instances: different components and messages of the same kinds.
  Only the held-out result counts as the new measurement.

---

## 6. What this does not measure

- **Regression flagging.** Whether a report on a resolved bug reopens it and
  fires a `regression` alert. No bug is resolved during the replay.
- **Occurrence-count accuracy.** The harness may read counts to work out which
  bug a report landed on, but whether the counts are right is not graded.
- **Race safety.** Whether concurrent identical reports create one bug rather
  than two. The owner reports that the server API tests cover it. This
  evaluation replays reports one at a time, so by design it can't detect a race.
- **Manual reports.** They never merge, and the `possibleDuplicateOf` hint on
  them is not evaluated. Error logs pasted into reports are not evaluated
  either.
- **The SDK's client-side behaviour.** The 10-second repeat suppression and the
  per-session report cap are both avoided by using a fresh context for every
  trigger.
- **Grouping across projects.** Every corpus report uses one project name.
- **Server-side reports as a graded result.** Section 4 is illustrative only.
- **Real Safari, macOS and iOS.** WebKit through Playwright on Windows is the
  Safari engine, not Safari.
- **Errors from the wild.** No browser extensions, ad blockers or half-loaded
  pages. A corpus from the wild was rejected because its labels would come from
  human judgement.
- **AI analysis, alert routing, latency and throughput.**
- **Whether merging indistinguishable reports is the right product choice.**
  The graded line counts it as an error, but that is a measurement, not a
  product decision.

---

## Appendix: builder brief

The builder session receives exactly the following text, and nothing else from
this repository, before it writes `builder-categories.md`.

> You are building an evaluation corpus for the error-grouping step of
> BugSense, a bug tracker. A JavaScript SDK embedded in web pages sends uncaught
> errors, unhandled promise rejections and manually captured errors to the
> server. For each report, the server decides whether it belongs to an existing
> bug or opens a new one. That decision will be measured as a black box: you may
> not read the server's code or the SDK's code, and you have only this brief.
>
> Before doing anything else, write down the categories of hard cases you would
> include in such a corpus. These are situations where two reports of the same
> underlying bug look different, and situations where reports of two different
> bugs look alike. Aim for breadth. For each category, say why it is hard and
> how you would produce real examples of it by actually triggering a bug in a
> real browser or runtime, rather than writing a stack trace by hand.
>
> Write the list to `builder-categories.md`, commit it, and stop. You will then
> be given the full design.

## Changes to this document

None since the commit that adds it. Any later change is listed here with its
date and reason. Thresholds in section 5 don't change after the first replay.
