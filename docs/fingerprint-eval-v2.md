# Fingerprint evaluation v2 — pre-registration

**Status:** pre-registration, written 2026-10-21. Nothing in this document has
been implemented. No v2 corpus exists.

The commit that adds this document comes before any commit that implements
it. That ordering is the evidence that the design, the gates and the
predictions below were fixed before the code and the corpus existed. A local
commit date can be set to anything, so the evidence is the commit order on
`main` and GitHub's record of the push. The results document will cite both.

**Expected verdict: Change the code.** Two of the eight gates are expected to
fail whatever is built. Section 4 gives the reasons, and section 5 records
predictions for every gate. The evaluation is run anyway. A fingerprint that is
better than v1 but still fails its pre-registered gates should be measured and
published as exactly that.

---

## 1. Background

The v1 evaluation is in [`fingerprint-eval.md`](fingerprint-eval.md) (design,
commits `521f9cb` and `1b87600`) and
[`fingerprint-results.md`](fingerprint-results.md) (results, commits `aab4d2f`
and `39a4c5c`). Its verdict was *Change the code*: six gates in that band, one
in *Publish with the limitation stated*, and one *Good*.

After v1, the code under test was read: `server/utils/fingerprint.util.js`
and `server/controllers/telemetry.controller.js` at `521f9cb`. The facts
established then are the starting point for v2:

- **The v1 key.** It hashes `project`, the first line of `errorLog` (numbers,
  UUIDs, hex addresses and timestamps replaced) and the first two lines that
  start with `at `, with `:line:col` removed. Nothing else is read. `title` is
  used only when `errorLog` is empty.
- **Firefox and WebKit stacks are not recognised.** They write frames as
  `fn@url:line:col`, so for those engines the "first line" slot holds the top
  frame and the frame slot is empty. In 358 of the 444 Firefox and WebKit
  reports the key contained no error message at all. The other 86 had no
  stack, so the bare message was the key.
- **The message reached the key only through V8's stack header,** and only in
  Chromium.
- **The v1 partition is fully explained by the code.** Recomputing every key
  with the real function reproduces the replay's grouping exactly: 0
  disagreements over 279,378 report pairs.

The v1 corpus is now development data. The v2 design was developed against it.
Section 5.3 lists every rule that was added because of a specific v1 failure.
Scores on v1 are therefore not a measurement of v2, and are given only as
predictions and as a regression check.

---

## 2. The v2 key

### 2.1 What the key reads, and what it deliberately does not

The key reads, from the report:

| Input | Source (v2 SDK) | Fallback (older SDKs) |
|---|---|---|
| project | `project` | — |
| error message | `error.message` | `title`, with SDK prefixes removed (2.4) |
| stack | `errorLog` | — |
| failed request | `request` | the most recent failed-request breadcrumb (2.5) |
| script URL, for `Script error.` | `source.filename` | the URL in `errorLog`, if it is one |

The key does **not** read the following:

- **The page route**, whether in `description`, the navigation breadcrumbs or
  anywhere else. One bug fires on many pages: a crash in a shared header would
  become one bug per page. The v1 corpus also cannot measure what reading it
  costs, because every v1 incident was triggered from its own route. There, the
  route is the incident label in disguise. A model that added the route to the
  proposed key scored *Good* on the hard-negative gate (table in 2.9), by
  construction rather than by grouping well.
- **Click and other breadcrumbs, apart from failed requests.** This is the same
  reason: in v1 each incident is triggered by its own button.
- **Line and column numbers.** They change on every release and differ between
  engines for the same throw site, by a few columns in v1.
- **`browserInfo`.** The same bug must group across browsers.

### 2.2 Stack parsing

One parser reads all three stack formats and produces a list of frames. Each
frame records **function**, **file**, **line**, **column** and **kind**.

**Line formats recognised:**

| Engine | Forms |
|---|---|
| V8 (Chromium, Node) | `at FN (LOC)`, `at LOC`; FN may carry `async `, `new `, a receiver (`Object.dispatch`) and an alias (` [as describe]`) |
| SpiderMonkey (Firefox), JavaScriptCore (WebKit) | `FN@LOC`, split at the first `@`; `@LOC` for anonymous functions |

**Location forms:**

- `FILE:LINE:COL`, `FILE:LINE`, or a bare `FILE`.
- V8 eval: `eval at X (URL:l:c), <anonymous>:l:c`. The file is the inner URL,
  and the function is `eval` if it has no name.
- Firefox eval and `new Function`: `URL line N > eval` or `URL line N >
  Function`. The file is the URL.
- WebAssembly: any `wasm-function[I]`, including Firefox's
  `URL line N > WebAssembly.instantiate:wasm-function[I]:0x…` and V8's
  `wasm://…:wasm-function[I]:0x…`. These become function `wasm:I`, file
  `wasm`.

**Function names are normalised so that the engines agree:**

1. Remove a leading `async ` and `new `.
2. Remove a V8 alias (` [as x]`), keeping the function's own name.
3. Keep only the text after the last `*`. This drops Firefox async-cause
   markers such as `async*` and `EventHandlerNonNull*`.
4. Remove trailing Firefox nesting marks (`/<`, `<`).
5. `global code`, `module code`, `eval code` and `<anonymous>` become the
   empty name.
6. Keep only the text after the last `.`. This drops a V8 receiver, so
   `Object.dispatch` becomes `dispatch` and `z.Yi` becomes `Yi`.

**Files are normalised:**

1. An `http(s)` URL is reduced to its path, without the origin. A `blob:` URL
   becomes `blob:`. Other schemes keep scheme and path.
2. **Content hashes are stripped:** a final `-XXXXXXXX` before `.js` or `.mjs`
   is removed, where X is 8 characters from `[A-Za-z0-9_-]`. So
   `/assets/index-BOtVUl4o.js` becomes `/assets/index.js`.
3. Every path segment that contains a digit is replaced by `<id>`, except a
   segment ending in `.js`, `.mjs`, `.jsx`, `.ts` or `.tsx`.

**Frame kinds:**

| Kind | Rule |
|---|---|
| native | empty file, `<anonymous>`, `native`, `[native code]` |
| sdk | the path ends in `/sdk/bugsense.js` (the SDK's own wrappers) |
| foreign | scheme `file:` or `node:` |
| library | the path contains `/node_modules/` |
| app | everything else, including `wasm` |

**Lines that parse in neither format** are ignored. They are counted for
diagnostics, and the count is not part of the key. If no line parses, the
report takes the stackless path (2.6).

**Foreign frames inside a browser stack.** If a stack contains at least one
app frame with a web URL, its `file:` and `node:` frames are dropped. They are
text that was pasted into an error message, not code that ran in the browser:
G28 and G29 embed a server's stack in their message. If a stack has no web
frames (a Node stack), foreign frames are treated as app frames.

### 2.3 Frame selection: the top app frame

1. Drop native, sdk and foreign frames.
2. If any app frame remains, drop library frames.
3. Take **the first remaining frame**. Its identity in the key is
   `function@file`, with no line or column.

**How ownership is decided.** A frame counts as library only when that is
visible from the stack: a `/node_modules/` path, which is how unbundled
dependencies appear in development builds. In a production bundle, application
code, React and axios share one file, so **every bundle frame counts as app**.
The stack alone cannot tell them apart. Two consequences follow:

- React's own frame is the top app frame for errors React throws itself. This
  is why B2/B3 is expected to merge in production builds (section 4).
- For HTTP and network failures the request replaces frames entirely (2.5), so
  axios internals do not matter.

SDK frames are identified by the SDK's own path. In Chromium, once the SDK is
embedded with `crossorigin`, fetch failures start at the SDK's fetch wrapper.
That frame is dropped, and fetch failures are keyed by their request anyway.

Anonymous frames are kept, with an empty name. They are real code: G21/G22
throw from module scope.

**Why one frame.** On the v1 corpus, every extra frame lowered both recall
gates and the call-path gate, and gained one hard-negative pair (table in 2.9).
WebKit omits frames that V8 and Firefox keep. A4's WebKit stack has no
`onClick` frame, and G6/G7's WebKit stack has no frame below the shared
wrapper. So deeper keys stop matching across engines.

### 2.4 The message, as a deliberate field

The message is part of the key on purpose. It is read from a field the SDK
sends for that purpose (section 8.1), never from V8's stack header.

**Source:**

- The v2 SDK sends `error.message`.
- **Older SDKs:** use `title`, with a leading `Uncaught ` or
  `Unhandled Promise Rejection: ` removed, then a leading `Name: ` removed
  (any word ending in `Error` or `Exception`).
- **When the title is a component stack** (it starts with whitespace or
  `at `): use V8's stack header if there is one, otherwise the empty string.
  Older SDKs put the second argument of `captureError` in the title.

**Normalisation step 1: engine wordings become one neutral form.** The rules
are tried in this order and the first match wins:

| Neutral form | Matches |
|---|---|
| `nullish-read P` | V8 `Cannot read propert(y\|ies) of (undefined\|null) (reading 'P')`; SpiderMonkey `can't access property "P", … is (undefined\|null)` or the same with an unquoted P |
| `wasm-unreachable` | `unreachable`, `unreachable executed`, `Unreachable code should not be executed…` |
| `nullish-read P` | JavaScriptCore `(undefined\|null) is not an object (evaluating 'EXPR')`, P = last segment of EXPR |
| `nullish-write P` | `Cannot set propert(y\|ies) of (undefined\|null) (setting 'P')` |
| `not-function P` | `EXPR is not a function`, with JavaScriptCore's optional `. (In '…', '…' is undefined)`; P = last segment |
| `not-constructor P` | `EXPR is not a constructor…`; P = last segment |
| `recursion` | `Maximum call stack size exceeded` (optional `.`), `too much recursion` |
| `json-parse` | contains `is not valid JSON`, `Unexpected end of JSON input` or `in JSON at position`; starts with `JSON.parse: ` or `JSON Parse error: `; JavaScriptCore's `The string did not match the expected pattern.` only when a native frame named `json` is present |
| `network` | `Failed to fetch`, `NetworkError when attempting to fetch resource.`, `Load failed` |
| `dynamic-import` | starts with `Failed to fetch dynamically imported module`, `error loading dynamically imported module` or `Importing a module script failed` |
| `undefined-var X` | `X is not defined`, `Can't find variable: X` |
| `react#N` | starts with `Minified React error #N` |
| `http Nxx` | `Request failed with status code NXX` (axios), keeping only the status class |

"Last segment" means the text after the last `.`, or the key inside a final
`[…]`.

**Normalisation step 2: data is stripped from anything else.** These rules
apply in order:

1. URLs (`https?://…`) become `<url>`.
2. `{…}` and `[…]` spans, across lines, become `<json>`.
3. Double-quoted strings become `<str>`.
4. Amounts become `<num>`: a digit run with `.` or `,` separators, with an
   optional currency symbol `€ $ £ ¥` before or after.
5. Any remaining token containing a digit becomes `<num>`.
6. Whitespace is collapsed, and the result is truncated to 200 characters.

Single-quoted text is kept. In engine messages it is usually a code identifier,
such as a property name.

**Why the message is in.** A proposal variant without the message (2.9) merged
14 pairs of unrelated incidents in production builds. They shared a top frame
whose minified name collided, such as `e` or `n`, with entirely different
errors. The message is the only discriminator that survives both a change of
engine (after step 1) and a change of build.

**What stops the data-variant splits** is step 2. On v1, all 20 isolated
data-variant pairs merge (section 5).

### 2.5 Request identity for HTTP and network failures

When the neutral message is `network` or `http Nxx`, the key uses the failed
request **instead of frames**. The request is written `METHOD PATH`: the
method, then the path without origin or query, with every digit-bearing
segment replaced by `<id>`.

- **Source:** the v2 SDK's `request` field. With older SDKs, the server takes
  the most recent breadcrumb in category `xhr` whose message ends in
  `(FAILED)` or `(HTTP 4xx|5xx)`, and parses `API [METHOD] URL` from it.
- **Why the request replaces frames:** the identity of a failed request is the
  endpoint. Frames for these errors are library internals (axios) or SDK
  wrappers (fetch), and WebKit truncates them at the network callback.

**Known limitation:** the origin is dropped, so the same path on two
different hosts gives the same request.

### 2.6 Stackless reports

A report is stackless when no usable frame remains after 2.3.

- **`Script error.`** (a cross-origin script whose details the browser hides):
  the key is `script-error` plus the script's path, when the browser provides
  the script URL (Firefox does). Otherwise there is **one bucket per project**.
  The page path is not used. That is the same artefact as the route (2.1), and
  a broken widget on twenty pages should not become twenty bugs.
  **Accepted cost:** E1/E2 merges in Chromium and WebKit.
- **Everything else:** neutral message plus request, if any. String rejection
  reasons are their own message, so D2/D3 stay apart.
- **Plain-object rejection reasons.** Their JSON becomes `<json>` by step 2,
  so all stackless plain-object rejections in a project share a bug. v1 has
  one such incident (D4), so this rule is untested. It is recorded here as a
  known weakness, not changed.

### 2.7 Hash stripping and production volatility

Stripping content hashes (2.2) is necessary but not sufficient. In v1, removing
hashes alone would have fixed 35 of the 130 production deploy splits. In a
production bundle, the minifier also renames top-level functions between
releases (`b`→`ee`, `he`→`_e`, `Ii`→`Ri`) and sometimes changes which frame is
on top. v2 does not compensate for this (2.9). Production deploys are
expected to keep splitting bugs (section 4.2).

### 2.8 Key layout

The key is the SHA-256 of one of the strings below, truncated to 32 hex
characters as in v1. `::` separates fields, and empty fields stay empty.

| Case | String |
|---|---|
| HTTP or network failure with a request | `fp2::PROJECT::MESSAGE::::REQUEST::` |
| Frames available | `fp2::PROJECT::MESSAGE::FUNCTION@FILE::REQUEST::` |
| Stackless, not `Script error.` | `fp2::PROJECT::nostack::MESSAGE::REQUEST::` |
| `Script error.` | `fp2::PROJECT::script-error::SCRIPT_PATH_OR_EMPTY` |

The `fp2::` prefix means a v2 key can never equal a v1 key. The key is a pure
function of the report. It reads no stored state, so its result cannot depend
on arrival order.

### 2.9 Choices considered and rejected

All figures are for the v1 corpus, computed as described in section 5.1, under
the same assumptions as the proposal line. "Change" means one choice changed
from the proposal, everything else equal. G = Good, P = Publish with the
limitation stated, C = Change the code.

| Variant | Ordinary merges | Hard-neg. merged | Headline | Version-only (worst env) | Browser-only | Data variants | Call-path |
|---|---|---|---|---|---|---|---|
| **Proposal** | 0 G | 8 C | 0.7074 P | 0.4583 C | 0.8421 G | 20/20 G | 6/6 G |
| Two frames | 0 G | 7 C | 0.5993 C | 0.4345 C | 0.6760 P | 20/20 G | 2/6 P |
| Three frames | 0 G | 7 C | 0.5088 C | 0.4286 C | 0.5545 P | 20/20 G | 2/6 P |
| **Wildcard mangled names** | 3 C | 12 C | 0.8581 G | 0.9537 G | 0.8480 G | 20/20 G | 6/6 G |
| Wildcard mangled names, two frames | 0 G | 11 C | 0.7464 P | 0.9537 G | 0.7009 P | 20/20 G | 4/6 P |
| Line numbers in production frames | 0 G | 8 C | 0.7074 P | 0.4583 C | 0.8421 G | 20/20 G | 6/6 G |
| Page route in the key | 0 G | 1 P | 0.7029 P | 0.4583 C | 0.8421 G | 18/20 C | 6/6 G |
| Message not in the key | 14 C | 8 C | 0.7312 P | 0.4583 C | 0.8772 G | 20/20 G | 6/6 G |
| No request identity | 0 G | 10 C | 0.6701 C | 0.4226 C | 0.8069 G | 20/20 G | 6/6 G |
| Page path for `Script error.` | 0 G | 7 C | 0.7074 P | 0.4583 C | 0.8421 G | 20/20 G | 6/6 G |
| *v1, as published* | 9 C | 9 C | 0.2864 C | 0.2262 C | 0.2778 C | 8/20 C | 0/6 P |

**Wildcarding mangled names (rejected).** This variant treats function names
of up to two characters in hash-named bundle files as unknown. It is recorded
first because it passes gates the proposal fails:

- version-only recall goes from 0.4583 (*Change*) to 0.9537 (*Good*);
- headline recall goes from 0.7074 (*Publish*) to 0.8581 (*Good*).

It is rejected for three reasons:

1. **In a production bundle it groups by message.** Once the top frame's name
   is unknown, the frame is `?@/assets/index.js` for almost every error. The
   key is then the message plus a constant.
2. **It merges different bugs that share a message.** On v1 that is four more
   hard-negative pairs (A3/A4, A5/G30, G16/G17, G26/G27) and three unrelated
   pairs (A6+C6, A9+G26, A9+G27). v1 understates this: most of its unrelated
   incidents were written with distinct messages, while a real application has
   many different `reading 'id'` crashes.
3. **The design's own rule.** v1's section 5 holds that a false merge is
   silent and worse than a split, and gates merges more strictly. Wildcarding
   trades visible splits for silent merges. Its overall verdict on v1 is
   still *Change the code* (ordinary and hard-negative merges).

**Deeper frames (rejected).** Covered in 2.3.

**Line numbers in production frames (rejected).** They are unchanged by v1's
release, and adding them changes nothing on v1. Their stability there is a
property of how this fixture's bundler breaks lines. Minifiers commonly emit
one line per bundle, so line numbers carry no identity in general.

**The page route, or click context (rejected).** Covered in 2.1. On v1 it
removes 7 of 8 hard-negative merges, because v1 triggers each incident from its
own route. It also splits G10, whose route embeds a product ID.

**Message out of the key (rejected).** It gives higher cross-engine recall at
the cost of 14 unrelated merges (2.4).

**Ownership by frequency (rejected, not modelled).** The idea is to treat a
frame seen at the top of many different bugs as library code. That depends on
what is already stored, so the result would depend on arrival order. The
determinism gate exists to catch exactly that.

**Columns (rejected, not modelled).** They separate some same-function pairs
within one build, but they differ between engines and change on every release.

**Release-tagged source maps (out of scope).** This is the correct fix for
production volatility (4.2). It is a separate feature with its own evaluation.

---

## 3. The gates: unchanged from v1

The gates, thresholds and bands are those of v1's section 5, pre-registered in
`521f9cb`. **None has moved, and none will move after this commit.** The table
is copied from v1 without change:

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

On the v2 corpus, the incident names in the variant rows refer to the v2
instances of those kinds (K-A6, K-A7, K-C3 and K-A9 in Appendix B), plus
every data or call-path variant the corpus contains. That is the same reading
v1 gave to builder-added incidents. It is an interpretation, not a change.

All of v1's rules for these gates also stand unchanged:

- Bands meet exactly at the stated numbers: a value equal to a lower bound
  belongs to the higher band.
- The overall verdict is the worst band of any gate.
- Every recall gate is graded on the lower of per-pair and per-incident.
- Cross-environment merges count towards the merge gates.
- The validity checks are v1's.

**Scoring tool.** Scoring uses v1's `score.mjs` from the v1 evaluation
repository, commit `d80e9867aeb53929c5b4a85129002b8253dd5e0a`, SHA-256
`08b4e12f52ec41188fe20d2558a9e821016e37e6185f972fdab7cc762d45465a`. The
replay uses v1's `replay.mjs`, commit
`a0a436dd201b31b8c21bb61e35422c49870aef2d`, SHA-256
`8c780ec7903c150a36da99d10c32f1fcd647bf65bb475c9a17bdab9a0da9308e`.

The v2 corpus has no Node reports (6.2). If the scorer cannot run on a corpus
without them, one change is permitted: skipping the Node section. It is
committed, and its diff published, before capture begins. No other change to
either tool is allowed.

---

## 4. The two gates expected to fail

This section is written before any v2 code or corpus exists.

### 4.1 Hard-negative merges: at least three pairs cannot be separated

**Claim.** Three designated hard-negative pairs in v1 differ only in the page
route and the clicked element's label, in at least one engine. v2 reads
neither field (2.1), so it gives both reports of each pair the same key. The
pair is then merged in that cell. The gate counts a pair as merged if it is
merged in any cell, so three merged pairs put it in *Change the code*.

**Evidence.** Each pair was compared in every cell (environment × browser ×
app version, standard reports), field by field:
- `title`;
- `errorLog`, byte for byte and again with line and column numbers removed;
- `description`;
- breadcrumbs per category (navigation, click, xhr, console, error), ignoring
  timestamps;
- `browserInfo`, `project`, `severity`, `priority`, and any other top-level
  field.

| Pair | Cells where the only differences are `description`, the navigation breadcrumb and the click breadcrumb | Other cells |
|---|---|---|
| **G21 / G22** (one shared, pre-constructed error thrown from two sites) | **all 12**: production and development × Chromium, Firefox, WebKit × v1, v2 | none |
| **G28 / G29** (two defects reaching the same server failure through a shared request helper) | **8**: Chromium and WebKit, both environments, both versions | Firefox: the stack text differs, because Firefox records frames below the shared helper |
| **G6 / G7** (two defects inside one shared retry wrapper) | **4**: WebKit, both environments, both versions | Chromium and Firefox: the stack text differs, because they record the wrapped function below the wrapper and WebKit omits it |

In the listed cells, `title` and `errorLog` are byte-identical, **including
line and column numbers**, and so are every other compared field except the
three named. `description` and the navigation breadcrumb contain the page path,
and the click breadcrumb contains the clicked element's label. Report IDs for
every cell, and the comparison procedure, are in Appendix A.

**The claim does not depend on v2's rules.** It holds for any key that reads
neither the page route nor click breadcrumbs. Such a key gets identical input
for these reports, so it must give them the same output. The claim is
therefore not that no stateless key could ever pass this gate. A key reading
the route or click text would keep these pairs apart on v1. It would do so
because v1's fixture gives each incident its own route and button, which turns
those fields into labels (2.1, 2.9). v2 excludes them for that reason, and
accepts this gate's failure as the cost.

**Further hard-negative merges are expected** but are not needed for the
claim:

| Pair | Why it is expected to merge |
|---|---|
| A8a/A8b | production builds: identical apart from positions, because both callers are minified to `n` |
| G19/G20 | Chromium: identical apart from positions. Firefox and WebKit keep them apart, because their messages name the property path |
| B2/B3 | production builds: React's own frame is the top app frame (2.3) |
| G24/G25 | WebKit: its wasm frame numbering |
| E1/E2 | Chromium and WebKit: the project bucket for `Script error.` (2.6) |

The v2 corpus contains new instances of every v1 kind (6.2), including these.
The same failure is expected there.

### 4.2 Version-only recall in production builds

Of the gate's 168 production version-only pairs in v1, the proposal keeps 77
together (0.4583). v1 kept 38 (0.2262). In every one of the 91 remaining
splits, the top app frame differs between the two builds. Either the minifier
renamed the function, or a different frame ends up on top. The message differs
in one of them as well. Nothing in a minified stack identifies a function across two builds,
so no rule on the stack alone can recover these pairs without also merging
different bugs (2.9, wildcarding).

**The fix is release-tagged source maps, and it is out of scope for v2.** It
would work like this:

1. The SDK reports a release identifier.
2. The build uploads its source maps for that release.
3. The server maps each minified frame back to its original function and file
   before keying.

Development builds already carry original names and paths, so they show what
that would give. Version-only recall in development is **0.9537** on v1 under
the proposal. That is a forecast for a future feature, not a v2 measurement.

---

## 5. Predictions

### 5.1 How they were computed

**The model.** A throwaway model of the key in section 2, written only for
prediction and kept outside this repository, was run over the v1 corpus
(`reports.jsonl` SHA-256 `de4b8cd84e871a29207f3ced21309e56efe9fc8f163b846dc8b354471e412404`).
Its assignments were written as a replay file and scored with the v1 scorer
named in section 3.

**Pipeline check.** The same pipeline, given the current v1 function, reproduces
every published v1 gate value exactly.

**The model's files:**

| File | SHA-256 |
|---|---|
| `v2model.mjs` | `15ff0dfa384ce9df17bc00287a2fabceb211adade4405161aa35812ecb48c1be` |
| `run.mjs` | `137fa0da2e1dfee95d3459319ad50bf6fe4c6d2f213f6295cf3362246450862a` |

They are published unchanged with the v2 results, so the predictions can be
re-run.

**Where the model differs from section 2.** These differences are not
expected to change any figure:

- **Fallback paths only.** The model reads messages, requests and script URLs
  through the fallback paths of 2.1, because v1 reports were captured by an
  SDK without the new fields.
- **No `fp2::` prefix.** It does not change any partition.

### 5.2 Predicted values

Two lines are given for the v1 corpus.

**(a) v1 payloads exactly as captured.** This is also the regression oracle.
The implementation, replayed against the v1 corpus, must reproduce this line
exactly before any v2 capture begins (section 7).

**(b) The same, plus the v2 SDK's message field.** Twelve Firefox and WebKit
reports (B1–B3, production) carry the component stack in their title and no
message anywhere. Line (b) gives them the neutral message of the same incident's
Chromium report in the same cell, which is what the v2 SDK's `error.message`
would carry. This is the figure quoted elsewhere as 0.707.

| Gate | v1 corpus (a): as captured | v1 corpus (b): with message field | **Held-out v2 corpus: prediction** |
|---|---|---|---|
| Ordinary merges | 0 — Good | 0 — Good | 0–1; **Good** predicted, low confidence |
| Hard-negative pairs merged | 8 — Change | 8 — Change | ≥ 3 certain if the kinds of 4.1 recur; 6–10 expected; **Change** |
| Headline recall | 0.6890 (per-pair 0.6961, per-incident 0.6890) — Change | 0.7074 (per-pair 0.7074, per-incident 0.7124) — Publish | 0.55–0.69; **Change** |
| Version-only recall (worst env) | 0.4583 production (development 0.9537) — Change | same — Change | production 0.35–0.55, development ≥ 0.90; **Change** |
| Browser-only recall | 0.8070 — Good | 0.8421 — Good | 0.60–0.80; **Publish** |
| Data-variant pairs | 20 of 20 — Good | 20 of 20 — Good | at least one split expected; **Change** |
| Call-path pairs | 6 of 6 — Good | 6 of 6 — Good | all merged; **Good** |
| Seed 1 vs seed 2 | identical — Good | identical — Good | identical; **Good** (the key is a pure function) |
| **Verdict** | Change the code | Change the code | **Change the code** |

**Other figures on line (b):**
- headline precision 0.7697;
- merged hard-negative pairs A8a/A8b, B2/B3, E1/E2, G6/G7, G19/G20, G21/G22,
  G24/G25, G28/G29;
- production headline recall 0.5651, development 0.8502.

### 5.3 Every rule was tuned on v1

The v1 scores above are not a measurement. The following rules exist because a
specific v1 report failed without them:

| Rule | Added for |
|---|---|
| The engine-wording table in 2.4 | each listed wording appears in v1 |
| SpiderMonkey's unquoted property | G5 |
| JavaScriptCore's multi-line "not a function" | G3 |
| The wasm trap wordings, and wasm function identity | G24/G25 |
| The JavaScriptCore JSON rule tied to a native `json` frame | C6 |
| The amount rule in step 2 | G1 |
| Dropping foreign frames | G28/G29 |
| The request replacing frames | C1 in WebKit, whose stack has no app frame |
| Digit-bearing path segments to `<id>` | G10 |

**Expected effect on held-out data:**

- **New engine wordings** will escape the table. That splits cross-browser
  pairs and lowers browser-only and headline recall.
- **New kinds of embedded value** will escape step 2: for example a slug, a
  locale code in plain text, or a name. One such split puts the data-variant
  gate in *Change*.
- **Headline recall is 0.007 above the 0.70 line on (b), and below it on (a).**
  It is expected to fall below 0.70 on the held-out corpus.

**If a measured value comes in higher than predicted, that will be explained in
the results**, not taken as confirmation. The likely explanations are a
held-out corpus easier than v1, or kinds that recur more closely than
intended. Either is a finding about the corpus.

---

## 6. The v2 corpus

### 6.1 Who builds it, and what they may not see

The corpus is built by a **new Claude Code session with no project context**:
the builder. It works in a new, empty directory named `grouping-corpus-v2/`
with its own git repository. That repository stays private until the v2
results are published.

The builder receives exactly two texts, both in Appendix B:

1. **The brief.** The builder writes its own hard-case categories to
   `builder-categories.md` and commits them.
2. **The corpus specification**, given only after that commit.

The specification names four values the owner supplies: the SDK URL, the
capture URL, the stack commit, and a description of the file formats the
scoring tool reads. These values are recorded in the builder's repository, and
none of them contains a quarantined path or the word "fingerprint". The builder
receives nothing else from this repository.

**Quarantined from the builder.** No read, fetch or search:

- **This repository, in full:**
  - its local path and `github.com/Krishnendu-9/bugsense`, including git
    history;
  - `CLAUDE.md`, the README, `docs/` and `dev_docs/`;
  - `server/`, including the v2 key, the telemetry controller, the migration
    script and the tests;
  - `client/`, including the SDK tests;
  - `server/public/sdk/bugsense.js`.
- **`docs/fingerprint-results.md` and `docs/fingerprint-eval.md`,** both
  named explicitly. The results document did not exist when v1's list was
  written.
- **This document**, apart from Appendix B, which is handed over verbatim.
- **The v1 evaluation repository, which is public:**
  `github.com/Krishnendu-9/bugsense-eval` and any local clone, with all of
  `corpus/`, `results/`, `runs/`, `diagnostics/`, `DIFFICULTY.md`,
  `CATEGORIES.md` and `builder-categories.md`. It did not exist when v1's list
  was written.
- **The prediction model** of 5.1.
- **The project's Claude Code memory directory.**

**How the separation is enforced:**

- **Permission rules:**
  - deny reads of both repositories' local paths;
  - deny `WebFetch` to `github.com`, `raw.githubusercontent.com`,
    `codeload.github.com`, `api.github.com` and `gist.github.com`.
- **The stack is a black box.** It is started by the owner, outside the
  builder's session, at the implementation freeze commit (section 7). The
  builder loads the SDK only through the `<script>` tag given in Appendix B,
  and never fetches or opens it as a file.
- **The transcript is audited** afterwards, searching for:
  - both repository paths;
  - `bugsense-eval`, `fingerprint`, `fingerprint-results` and
    `fingerprint-eval`;
  - the name of every quarantined file.

  Appendix B does not contain the word "fingerprint", so any occurrence comes
  from elsewhere. A breach voids the corpus, and a new builder rebuilds it.

### 6.2 Shape and size

**Graded core: the same shape as v1,** so that every gate means what it meant
in v1:

- **Environments:** `browser-prod` (`vite build` served by `vite preview`)
  and `browser-dev` (the Vite dev server).
- **Cells:** 3 browsers (Playwright Chromium, Firefox, WebKit) × 2 app
  versions, one report per cell. That is 6 reports per incident per
  environment.
- **App versions:** v2 of the fixture is v1 plus one unrelated feature commit.
  It adds code above every defect site and touches no defect line and no
  dependency. The diff is kept in the corpus.
- **Variant incidents:** one extra report in the Chromium/v1 cell, differing
  from the standard report only in the variant (a data value or a call path).
- **Incidents:** one new instance of each of v1's 57 browser incident kinds
  (Appendix B, table B.1), plus the builder's own categories. Each new
  instance has different components, files, messages, values and endpoints;
  nothing is copied.
- **Hard-negative pairs:** a new pair for each of v1's 15 hard-negative kinds,
  plus any the builder adds.
- **Variants:** 10 data-variant kinds and 3 call-path kinds, as in v1.
- **Size, before builder additions:** 57 × 6 + 13 = 355 reports per
  environment, 710 in the headline. Final totals are recorded in the lock file
  before the freeze.
- **No Node reports.** v1's Node section was not graded, and BugSense still
  has no server SDK.

**Routes and labels are decoupled from incidents.** v1 triggered each incident
from its own route and button, which made those fields act as labels (2.1).
In v2:

- every route and every clicked-element label is shared by at least two
  incidents;
- at least 10 incidents fire from two or more routes, with the route chosen
  per report by a seeded draw.

The route and label of every report are recorded in the metadata.

**Repeat block: reported, not graded.** v1's corpus contained no repeated
reports of one error in one browser and build, although that is the commonest
production case. v2 adds a separate block:

- 10 incidents, chosen by a seeded draw;
- 20 reports each in the Chromium/v1/production cell;
- spread over at least 3 page loads, with at least 11 seconds between repeats
  in the same page (the SDK suppresses repeats within 10 seconds).

The block is replayed separately, on a fresh database, and is excluded from
every gate. Its result is reported as the share of repeats that land on one
bug per incident. No gate was pre-registered for it, so none is added.

**Controls:** 10 reports drawn by seeded random choice from the graded core,
re-sent verbatim at the end of the replay, as in v1.

### 6.3 Capture rules

- **SDK version.** The corpus is captured with **the v2 SDK**, as served by
  the stack at the implementation freeze. It is embedded exactly as BugSense's
  documentation at that commit specifies, including `crossorigin="anonymous"`.
- **The capture server** records every request body verbatim and forwards
  nothing.
- **Fixtures.** A mock backend returns the deliberate 4xx/5xx responses. A
  second origin serves scripts without CORS headers. Endpoints with nothing
  listening produce network failures.
- **Isolation.** Each trigger runs in a fresh browser context.
- **One report per trigger.** A trigger that produces no report, or more than
  one, is retried up to three times. If it still fails it is dropped and
  listed. If more than 10% of planned reports are missing, the fixture is
  fixed before the freeze.
- **Ground truth.** Two reports belong to the same incident if and only if the
  same trigger fired them. Nobody labels a report after seeing it.
- **Expected drop.** In v1, React development builds produced two reports for
  a boundary-caught render error, so B1–B3 were dropped in `browser-dev`. The
  same rule applies unchanged. If Chromium again sends no report for unhandled
  `fetch` failures, that is listed as a finding, not worked around.

### 6.4 Freeze

Before the first replay, `corpus.lock` is committed in the builder's
repository. It records:

- the SHA-256 of every corpus file;
- the fixture commit;
- the Playwright and browser versions;
- the commit of the stack the corpus was captured against;
- the SHA-256 of the SDK file as served, computed by the harness without
  displaying it.

After that the corpus does not change. A mistake found after results exist is
fixed in a new corpus version, and both are reported.

**Nobody reads the corpus before the measurement.** It is captured after the
implementation is frozen, so it cannot have shaped the code. Between capture
and publication of the results, no one who worked on the key opens a report.
The builder sees its own captures, as v1's builder did, but has never seen the
key.

---

## 7. Order of work

1. **Pre-register.** Commit and push this document. Nothing else is in the
   commit.
2. **Implement** sections 2 and 8: the key, the SDK changes and the
   migration, with tests.
   - Any departure from this document is recorded as a dated amendment, with
     its reason, before step 4.
   - The thresholds cannot be amended.
   - Freeze the implementation at a tagged commit.
3. **Regression check on v1.** Replay the v1 corpus into the frozen stack and
   score it.
   - It must reproduce line (a) of 5.2 exactly.
   - If it does not, either the implementation departs from section 2 and is
     corrected to match it, or section 2 was ambiguous and is amended. Either
     way, this happens before step 4.
   - The result is published as a regression check, not as a measurement.
4. **Capture.** A blind builder captures the v2 corpus against the frozen
   stack (section 6), then freezes and commits the lock file.
5. **Audit** the builder's transcript (6.1).
6. **Measure once.** Two full replays on fresh volumes with seeds 1 and 2, as
   in v1. Then the separate repeat-block replay. Then scoring.
7. **Publish** the results and the limitations in the same change: in the
   results document, and in the "Known limitations" section of
   `docs/ARCHITECTURE.md`, which the README links to.

**Why this order.** Pre-registering first fixes the design, gates and
predictions before any of them could be adjusted to a result. Implementing
before capture means the corpus did not exist while the code was written, so
nothing in the code can have been fitted to it. That is the property v1's
fixed corpus lost once its failures were read. Measuring once, with no
change between capture and scoring, means the published number is the first
number.

---

## 8. What v2 requires beyond the key

### 8.1 SDK payload changes

These are for the next SDK release after 1.3.0, provisionally 1.4.0. Every
existing field keeps its meaning. The new fields are:

| Field | Content |
|---|---|
| `sdkVersion` | the SDK version string |
| `error` | `{ name, message }` from the error object. For a non-Error rejection reason: `{ name: null, message }`, where the message is the string, or JSON for an object |
| `request` | `{ method, url, status }` for HTTP and network failures. For axios rejections it is read from the error (`config.method`, `config.url`, `response.status`). For `fetch` failures, the SDK's fetch wrapper records the method and URL on the error it re-throws. The URL uses the SDK's existing redaction: path only for same-origin, origin and path otherwise, no query |
| `source` | `{ filename, lineno, colno }` for window `error` events |
| `componentStack` | from `captureError(error, { componentStack })`. A string second argument keeps its current meaning, the title |

`errorLog` becomes `error.stack`, or empty. The SDK stops writing the
synthetic `message at file:line:col` line it writes today for errors without a
stack. That line is how a page path reached the key for `Script error.` in v1.

**Old SDKs keep working** through the fallbacks in 2.1. An old-SDK and a
new-SDK report of the same error must produce the same key. The server tests
check this for each engine's message and stack forms.

### 8.2 Server

- **New fields on `Bug`:**
  - `fingerprintVersion` (Number; 2 for every key computed by v2; existing
    bugs are treated as 1 until migrated);
  - `legacyFingerprint` (String);
  - `errorName`, `errorMessage` and `request`, stored so that future re-keys
    don't depend on fallbacks;
  - `mergedInto` (ObjectId, ref `Bug`).
- **The unique partial index** on `{ fingerprint, source: 'sdk' }` is
  unchanged. v2 keys cannot collide with v1 keys (2.8).
- **The parser replaces the v1 frame rule everywhere it is used,** including
  `topFrameOf` (the top frame shown beside SDK bugs in the list) and the
  similar-report hint for manual reports. Manual reports still never merge.

### 8.3 Migration: re-keying existing bugs

Deploying a new key without migration would make the next report of every
open SDK bug open a new bug. A one-off script re-keys stored bugs before the
v2 server starts accepting reports. Its rules:

- **Run while ingest is stopped.** The script records the latest `lastSeenAt`
  of any SDK bug before it starts, and aborts `--apply` if that value changes
  during the run. After applying, it verifies the unique index and exits
  non-zero on any violation.
- **Dry run by default.** It prints every change, and every collision group in
  full. `--apply` performs them. It is idempotent: bugs already at version 2
  are skipped.
- **Inputs.** Each SDK bug's v2 key is computed from its stored `title`,
  `errorLog`, `breadcrumbs` (those of its most recent occurrence) and
  `project`, using the fallback paths of 2.1.
- **No collision.** `legacyFingerprint` = old key, `fingerprint` = new key,
  `fingerprintVersion` = 2.
- **Collision** (two or more old bugs share one new key). v2 considers these
  one incident, and future reports would land on one of them anyway, so they
  are merged:
  - **Survivor:** the bug with the earliest `firstSeenAt`, ties broken by the
    smallest `_id`.
  - **Counts and dates:** `occurrences` is the sum, `firstSeenAt` the
    earliest, `lastSeenAt` the latest.
  - **Triage:** the survivor keeps its own status, priority and assignee,
    with one exception. If the survivor is resolved or closed and another
    member is open or in progress, the survivor takes the most active of
    those statuses (in progress over open), because the incident is still
    happening.
  - **The other members** are set to `closed`, with `mergedInto` set to the
    survivor and `fingerprint` set to `null`, which frees the index;
    `legacyFingerprint` keeps the old key. Each gets a status-history note
    naming the survivor.
  - **Comments** stay on the bug they were written on.
  - **Audit record.** Each merge writes an audit entry listing every
    member's pre-merge `occurrences`, status and fingerprint, so a wrong merge
    can be undone by hand. Counts are kept per member for that reason.
  - **No side effects:** no webhook alerts, no regression flags, no `created`
    events.
- **Manual reports** get a v2 fingerprint for the similar-report hint, and are
  never merged.

A collision in the migration is where a v2 false merge becomes permanent for
existing data. That is why the dry-run output is reviewed before `--apply`.

---

## 9. What this does not measure

Everything in v1's section 6, plus:

- **The repeat block** is reported but not graded (6.2).
- **The migration** is covered by server tests, not by the corpus.
- **Release-tagged source maps** do not exist in v2. The development-build
  figures are a forecast for them, not a measurement.
- **Server-side reports** are not captured.
- **Whether excluding the page route is the right product choice.** The corpus
  is built so that the route cannot act as a label. It does not contain the
  traffic that would show what reading the route would cost or gain.

---

## 10. Disclosure

- **The author has seen everything v2 is measured on.** This design and its
  predictions were produced by a Claude Code session that had read the v1
  normaliser, the v1 corpus, the v1 results and every failing v1 pair. Every
  rule in section 2 was chosen with those failures in view (5.3).
- **The author shares the builder's model.** The author is the same model as
  the builder and as the sessions that wrote v1. Its sense of what is hard
  overlaps with theirs.
- **The kinds list was written by the author.** Table B.1 abstracts v1's
  incidents into kinds. It was written with knowledge of which v1 kinds
  failed, which could bias the abstraction towards kinds v2 handles.
- **Mitigations:**
  - the builder proposes its own categories before seeing the specification,
    marked **B** as in v1;
  - every gate is broken down by origin;
  - the corpus is captured after the code is frozen, by a builder that has
    never seen the key.

---

## Appendix A: verification procedure for 4.1

**Procedure.** For each pair (X, Y) and each cell (environment ∈ {prod, dev},
browser ∈ {chromium, firefox, webkit}, app version ∈ {v1, v2}):

1. Take the standard report of X and of Y in that cell from v1's
   `corpus/reports.jsonl` and `corpus/meta.jsonl`.
2. Compare them field by field as described in 4.1. To remove positions,
   replace `:digits:digits` with `:L:C`, `:digits)` with `:L)` and
   ` line digits >` with ` line L >`.

**Report IDs (X/Y):**

| Pair | Cell | IDs |
|---|---|---|
| G21/G22 | prod chromium v1, v2 | R0058/R0059, R0226/R0227 |
| | prod firefox v1, v2 | R0115/R0116, R0283/R0284 |
| | prod webkit v1, v2 | R0172/R0173, R0340/R0341 |
| | dev chromium v1, v2 | R0404/R0405, R0563/R0564 |
| | dev firefox v1, v2 | R0458/R0459, R0617/R0618 |
| | dev webkit v1, v2 | R0512/R0513, R0671/R0672 |
| G28/G29 | prod chromium v1, v2 | R0065/R0066, R0233/R0234 |
| | prod webkit v1, v2 | R0179/R0180, R0347/R0348 |
| | dev chromium v1, v2 | R0411/R0412, R0570/R0571 |
| | dev webkit v1, v2 | R0519/R0520, R0678/R0679 |
| G6/G7 | prod webkit v1, v2 | R0157/R0158, R0325/R0326 |
| | dev webkit v1, v2 | R0497/R0498, R0656/R0657 |

**Result.** In each listed cell the only differing fields are `description`,
the navigation breadcrumbs and the click breadcrumbs.

---

## Appendix B: texts given to the builder

The two texts below are handed over verbatim, in this order, and nothing else
is. B.1 is part of the second text.

### First: the brief

> You are building an evaluation corpus for the error-grouping step of
> BugSense, a bug tracker. A JavaScript SDK embedded in web pages sends uncaught
> errors, unhandled promise rejections and manually captured errors to the
> server. For each report, the server decides whether it belongs to an existing
> bug or opens a new one. That decision will be measured as a black box. You may
> not read the server's code or the SDK's code, and you have only this brief.
>
> Before doing anything else, write down the categories of hard cases you would
> include in such a corpus: situations where two reports of the same underlying
> bug look different, and situations where reports of two different bugs look
> alike. Aim for breadth. For each category, say why it is hard and how you
> would produce real examples of it by triggering a bug in a real browser,
> rather than writing a stack trace by hand.
>
> Write the list to `builder-categories.md`, commit it, and stop. You will then
> be given the corpus specification.

### Second: the corpus specification

> **Purpose.** Build and freeze a corpus of real error reports produced by
> triggering deliberate bugs in a fixture web app that embeds the BugSense SDK.
> Two reports belong to the same incident if and only if the same trigger fired
> them.
>
> **Fixture.** A React 18 app built with Vite, with one trigger per deliberate
> bug. Build two app versions. Version 2 is version 1 plus one unrelated feature
> commit that adds code above every defect site, in the same files, without
> touching any defect line or any dependency. Keep the diff in the corpus.
>
> **SDK.** Embed the SDK with exactly this tag, which the operator will give you
> with the host filled in:
> `<script src="SDK_URL" crossorigin="anonymous" data-api-url="CAPTURE_URL" data-project="Grouping Eval v2"></script>`.
> `CAPTURE_URL` is your capture server, which records every request body
> verbatim and forwards nothing. Never fetch, open or read the SDK file. Your
> harness records its SHA-256 as served without displaying it.
>
> **Helpers.**
> - A mock backend that returns the deliberate 4xx and 5xx responses.
> - A second origin that serves scripts without CORS headers.
> - Endpoints with nothing listening, for network failures.
>
> **Environments.**
> - `browser-prod`: `vite build` served by `vite preview`.
> - `browser-dev`: the Vite dev server.
>
> **Browsers.** Playwright Chromium, Firefox and WebKit. Pin and record the
> versions. Run each trigger in a fresh browser context.
>
> **Cells.** In each environment, each incident gets one report per browser ×
> app version, so 6 reports. A *variant* incident gets one extra report in the
> Chromium/version 1 cell, differing from the standard report in that cell only
> in its variant: a data value, or the call path.
>
> **Incidents.**
> - Build one new incident for every kind in table B.1, with your own
>   components, files, messages, values and endpoints.
> - Add an incident for every category in your `builder-categories.md` that the
>   table does not cover.
> - Add the hard-negative pairs you propose to the hard-negative list.
> - Mark each incident's origin: **K** for a kind from the table, **B** for
>   yours, both if both apply.
>
> **Routes and labels.** No incident may be identifiable from where it fired:
> - every route and every clicked element's label used by a trigger must be
>   shared by at least two incidents;
> - at least 10 incidents must fire from two or more routes, with the route
>   for each report chosen by a seeded draw.
>
> Record each report's route and label in the metadata.
>
> **Repeat block, in its own file.**
> - For 10 incidents chosen by a seeded draw, capture 20 reports each in the
>   Chromium/version 1/`browser-prod` cell.
> - Spread them over at least 3 page loads, with at least 11 seconds between
>   repeats in the same page.
>
> **Capture rules.**
> - A trigger that produces no report, or more than one, is retried up to three
>   times. If it still fails, drop it and list every attempt.
> - If more than 10% of planned reports are missing, fix the fixture before the
>   freeze.
> - Keep metadata (incident, environment, browser and version, app version,
>   variant, route, label, attempt, capture time, fixture commit, body SHA-256)
>   in a separate file from the bodies.
> - The operator will give you the file formats.
>
> **Controls.** Draw 10 reports from the graded corpus by a seeded random
> choice. They will be re-sent verbatim at the end of the replay.
>
> **Freeze.** Before anything is replayed, commit `corpus.lock` with:
> - the SHA-256 of every corpus file;
> - the fixture commit;
> - the Playwright and browser versions;
> - the stack commit the operator gives you;
> - the SDK file's SHA-256.
>
> After that, the corpus never changes.
>
> **Table B.1: incident kinds**
>
> | Kind | What it is | What makes it hard |
> |---|---|---|
> | K-A1 | an event handler reads a property of `undefined` | baseline |
> | K-A2 | a `ReferenceError` inside a lazily loaded, code-split module | the chunk's file name changes per build |
> | K-A3 / K-A4 | two different sites throw `new Error` with the same literal message | hard-negative pair: same message, different site |
> | K-A5 | unbounded recursion in application code | recursion messages differ by engine; long repetitive stacks |
> | K-A6 | `JSON.parse` of a corrupt stored value | **data variant**: the bad value appears in the message; wording differs by engine |
> | K-A7 | the app throws an `Error` whose message interpolates an ID | **data variant**: the ID differs |
> | K-A8a / K-A8b | a shared helper is called with a bad argument from two different callers; the bug is in each caller, fixed separately | hard-negative pair: identical message and top frame |
> | K-A9 | a shared helper is itself wrong, reached from two call paths | **call-path variant**: same bug, different frames below the top |
> | K-B1 | a render `TypeError` caught by an error boundary, which reports it with the component stack through the SDK's documented capture call | the component stack |
> | K-B2 / K-B3 | the same React invariant in two different components, both caught by boundaries | hard-negative pair: production React gives a minified error code; top frames are inside React |
> | K-B4 | a React hook-order error with no boundary | reaches the SDK as an uncaught error |
> | K-C1 / K-C2 | axios requests to two different endpoints fail with the same HTTP status, from different components | hard-negative pair: identical message and top frames |
> | K-C3 | an axios request to a parameterised route fails with 404 | **data variant**: different IDs in the route |
> | K-C4 / K-C5 | `fetch` to two different endpoints fails at the network level | hard-negative pair: engine-specific network messages, possibly nothing else |
> | K-C6 | `response.json()` on an HTML error page | messages differ completely by engine |
> | K-D1 | an `Error` thrown inside an async function, unhandled | async frames |
> | K-D2 / K-D3 | unhandled rejections with two different string reasons | hard-negative pair: no stack, only the message differs |
> | K-D4 | an unhandled rejection with a plain-object reason | not an `Error` at all |
> | K-D5 | an `Error` thrown in a timer callback | short stack cut at the timer boundary |
> | K-E1 / K-E2 | errors in two different cross-origin scripts served without CORS | hard-negative pair: the browser hides the details |
> | K-G1 | a message embeds a locale-formatted amount | **data variant**: the locale changes the formatting |
> | K-G2 | the same property read on a value that is sometimes `undefined`, sometimes `null` | **data variant** |
> | K-G3 | calling a missing method on a stub object ("x is not a function"), where the receiver is a local the minifier renames | the message embeds a renamed identifier |
> | K-G4 | a shared method installed on two classes | **call-path variant**: the receiver type changes the frame |
> | K-G5 | the same defect reached synchronously (uncaught) and from an async function (unhandled rejection) | **call-path variant** |
> | K-G6 / K-G7 | two different defects inside functions wrapped by one shared retry wrapper that rethrows a generic message | hard-negative pair |
> | K-G8 | a recursive walk where recursion depth changes which frames survive stack truncation | **data variant** |
> | K-G9 | a message that embeds a whole response payload | **data variant**: long, data-dependent message |
> | K-G10 | an inline script in the HTML page, whose frames carry the page URL, which embeds an ID | **data variant** |
> | K-G11 | code compiled with `new Function` or `eval` | eval and Function frames |
> | K-G12 | code loaded from a `blob:` URL | a random URL per page load |
> | K-G13 | a dynamic import of a missing module, with no fallback | **data variant**: module URL in the message; wording differs by engine |
> | K-G14 | an error object created in another realm (a same-origin iframe) | cross-realm error |
> | K-G15 | a message mutated after creation (for example, a retry count appended) | **data variant** |
> | K-G16 / K-G17 | two different sites throw `new Error()` with an empty message | hard-negative pair |
> | K-G18 | a bare string thrown synchronously | not an `Error`, through the uncaught path |
> | K-G19 / K-G20 | two different defects in the same function, reached from the same caller, reading different property paths | hard-negative pair: same function, same message in some engines |
> | K-G21 / K-G22 | two different call sites throw one shared, pre-constructed `Error` object | hard-negative pair: the stack is captured where the error was created |
> | K-G23 | a browser-generated error with no error object | no `Error` at all |
> | K-G24 / K-G25 | two different WebAssembly functions trap | hard-negative pair: numbered wasm frames |
> | K-G26 / K-G27 | a function copy-pasted into two files, same name and message | hard-negative pair |
> | K-G28 / K-G29 | two different defects that reach the same server failure through a shared request helper; the server's stack is embedded in the message | hard-negative pair: multi-line message with stack-like lines |
> | K-G30 | a second unbounded recursion in a different function | hard-negative pair with K-A5 |
>
> The table has 57 incidents. Hard-negative pairs: K-A3/K-A4, K-A8a/K-A8b,
> K-B2/K-B3, K-C1/K-C2, K-C4/K-C5, K-D2/K-D3, K-E1/K-E2, K-G6/K-G7,
> K-G16/K-G17, K-G19/K-G20, K-G21/K-G22, K-G24/K-G25, K-G26/K-G27,
> K-G28/K-G29, K-A5/K-G30.

---

## Changes to this document

Every change is listed here with its date and reason. Section 2 may be amended
only before the implementation freeze (section 7, step 2), and every amendment
is listed. Section 3's thresholds never change. Section 5's predictions are
never edited. A later note may explain a prediction but does not replace it.

### Amendment 1 — 2026-10-21: twelve points section 2 left open

Written before any implementation code, after section 2 was compared line by
line with the registered prediction model (`v2model.mjs`, hash in 5.1). In
twelve places the text was silent, or the text and the model disagreed. Each is
resolved below. Sections 2 and 5 are left as written, and this amendment
records how the implementation reads them.

**No threshold changes, and no prediction changes.** For P1–P9, the two
readings were compared on the v1 corpus by flipping each one in a copy of the
model and comparing the result with the registered model's partition. The last
column of the table gives the difference between the two readings. Results:
- **No point's choice of reading changes any grouping decision between
  browser reports**, so line (a) of 5.2 stands as the regression oracle
  unchanged.
- For P2, P4 and P5, the two readings give different key text for some
  browser reports, with the same grouping.
- For P7 and P8, the two readings group some Node reports differently. Node
  reports are not graded, and the readings adopted are the model's.

P10–P12 have no alternative in the model to flip. Their effect is the
implementation's own: P10 changes the key text of 13 Node reports, with no
change in grouping. P11 and P12 change nothing, because v1 has no empty
reports and no unnamed Firefox eval frames.

**The rule used to resolve them:**
- Where section 2 is explicit and the model is wrong, section 2 wins.
- Where section 2 is silent, or its text contradicts its own stated aim, the
  model wins.
- Where both are wrong or silent, the point is stated as a new rule (P10,
  P11).

| # | Point | Reading adopted | Follows | Difference between the readings, on v1 |
|---|---|---|---|---|
| P1 | V8 `X.<anonymous>` (receiver plus anonymous) | The empty-name check of 2.2 step 5 is applied **after** step 6, so `X.<anonymous>` becomes the empty name. This is the stated aim of 2.2, that engines agree: Firefox writes these as empty. | model | none |
| P2 | V8 eval frame: the file | The file is the inner URL with its own line and column removed. With nested evals it is the innermost location in parentheses. The model glues the line and column onto the URL, which turns the last path segment into `<id>`: a model bug. | section 2 | key text of 4 G11 reports; no grouping change |
| P3 | "Last segment" of an expression that ends in a call | A trailing `(…)` is removed first, so `a.b()` gives `b`. | model | none |
| P4 | Extent of a `{…}` or `[…]` span in step 2 | Spans are found left to right. Each starts at a `{` or `[` and runs, across lines, to the **last** closing bracket of the same kind in the message (the regular expression `\{.*\}\|\[.*\]` with the dot matching newlines). | model | key text of 14 G9 reports; no grouping change |
| P5 | V8 header used in place of a component-stack title | The header is the first line of `errorLog` unless that line starts with `at ` (after optional whitespace) or contains `@`; otherwise there is no header and the message is empty. The same `Uncaught ` / `Unhandled Promise Rejection: ` / `Name: ` removal as for the title is applied to the header. Without it, no engine wording rule can match a header. | model | key text of 6 B1–B3 reports; no grouping change |
| P6 | The JavaScriptCore JSON rule: "a native frame named `json` is present" | Any native frame named `json`, anywhere in the stack. The model checks only the first native frame. | section 2 | none |
| P7 | Foreign-frame rule: "an app frame with a web URL" | Read as **any app frame** (2.2 kinds). App frames are never at `file:` or `node:` locations. Only a stack with no app frame at all has its foreign frames treated as app frames. The literal http(s)-only reading would key Node reports on `node:internal` frames. | model | Node reports only |
| P8 | HTTP or network failure where no request can be found | The frames case of 2.8 applies, with an empty REQUEST field. | model | Node reports only |
| P9 | `Script error.`: "the script's path" | Normalised with the file rules of 2.2: hash stripped, digit-bearing segments become `<id>`. | model | none |
| P10 | V8 `at async LOC`, with no function name | `async ` is a marker, not part of the location. It is removed, and the function name is empty. The model keeps `async ` inside the file name: a model bug. | new rule | key text of 13 Node reports; no grouping change |
| P11 | No input: `errorLog`, the message and the title are all empty | There is no key (`null`), as in v1. The telemetry endpoint already rejects such reports. | new rule | none |
| P12 | Firefox eval or `Function` frame with no function name (found while implementing) | The function name is `eval`, as for V8. Section 2 says this only for V8. | model | none |

**How the implementation and the model now differ.** They differ only at P2,
P6 and P10, and in the `fp2::` prefix of 2.8. On the v1 corpus these change
key text, never which browser reports share a key. The regression check of
section 7, step 3 therefore compares partitions, not key strings.
