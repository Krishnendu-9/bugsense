# Fingerprint evaluation: results

**Verdict: Change the code.** Six of the eight pre-registered gates are in the
"change the code" band, one is "publish with the limitation stated", and one is
"good".

This is stage 3 of the evaluation designed in
[`fingerprint-eval.md`](fingerprint-eval.md). Nothing under `server/` was
changed as part of measuring it.

## Summary

**Deduplication is not broken.** Byte-identical repeats group correctly: all 10
of 10 controls merged with their originals, in both runs, and the grouping is
deterministic — two replays in different orders produced identical partitions.
That is the crash-loop case, where one user hits the same error repeatedly in
one browser on one build, and it is the commonest case in production.

**What failed is grouping the same bug across changed circumstances**, and above
all across minified builds. In an unminified build, a release that touches no
defect keeps 91% of same-bug pairs together; in a production build it keeps 20%.
Grouping the same error across browser engines is also weak (27%), though the
corpus over-weights that case by construction.

**The single diagnosis is one design error on the wrong axis, not two separate
bugs: the normaliser over-normalises frames and under-normalises messages.** It
discards the caller frames that identify which error this is — which is why a
500 and a 404 from different endpoints merged on shared axios internals — while
keeping the varying data inside messages, which is why 12 of 20 data-variant
pairs split into a bug per value. Both the false merges and the false splits
follow from normalising the wrong one of the two fields.

## Provenance

The thresholds were fixed before the corpus existed, and the corpus was frozen
before anything was measured. The evidence is commit order, not timestamps:

| Commit | What |
|---|---|
| `521f9cb` | the design, with every threshold in section 5 |
| `1b87600` | Amendment 1: the arithmetic restated for the real corpus; no threshold changed |
| this commit | these results |

`521f9cb` is an ancestor of `1b87600`, which is an ancestor of this commit. In
the evaluation repository, in order: `6365fc7` (the builder's own hard-case
categories, written before it saw the design), `e8bf5f8` (the design copied in
verbatim), `fb5ddad` (`corpus.lock` v1 — the freeze), `a0baeba` (`corpus.lock`
v2 after the drop investigations, adding no reports), `62f85e2` (the difficulty
statistics). The replay ran after all of them.

- **System under test:** the stack at `521f9cb`, built from a clean clone and
  run on a fresh MongoDB volume, seeded, on `http://localhost:8090`. `server/`
  and `client/` are byte-identical between `521f9cb` and `1b87600`, which
  differ only in documentation.
- **Corpus:** version 1, `reports.jsonl` sha256 `de4b8cd8…e412404`, as locked by
  `corpus.lock` v2. 748 reports, 680 of them in the headline.
- **Runs:** two full replays on separate fresh volumes, seeds 1 and 2. Seed 1 is
  graded; seed 2 is the determinism check. 758 sends each (748 corpus reports
  plus 10 controls), 0 failures.
- **Evaluation repository:** the corpus, the fixtures, the capture harness, the
  replay and scoring tools, the diagnostics and the full per-pair enumeration
  are at <https://github.com/Krishnendu-9/bugsense-eval>. Everything this
  document cites as "the evaluation repository" is there; the scored output is
  indexed at
  [`results/README.md`](https://github.com/Krishnendu-9/bugsense-eval/blob/main/results/README.md).
- **Blind build:** the corpus and harness were built by a separate Claude Code
  session working in its own repository, with this repository absent from disk
  and GitHub fetches denied. Its transcript was audited afterwards for every
  quarantined path and for the string `fingerprint`: **no breach**. It never
  read `server/utils/fingerprint.util.js`, and it loaded the SDK only through a
  `<script>` tag. The replay and this report were produced by a different
  session, as the design requires.

## How to read these numbers

Amendment 1 measured the corpus against the corpus the 0.85 recall threshold
was derived from, and found it **harder**: 61.8% of same-incident pairs are in
incidents whose messages differ by engine against a pre-registered estimate of
~12%, 15 designated hard-negative pairs against 7, and a same-incident rate of
1.53% against 3.13%. So, as Amendment 1 requires:

> Because this corpus is harder than the one 0.85 was derived against, missing
> 0.85 may reflect corpus difficulty as much as fingerprint quality.

That caveat is real, and it is not sufficient to explain these numbers. Headline
recall is 0.2864 against a 0.70 floor, and 0.2099 in the one stratum where the
corpus is not stacked against the system at all (below). Both naive baselines
were scored on the same corpus for scale, and one of them beats the system on
recall.

The headline and the stratified figures **must be read together**. 78.6% of
headline pairs are cross-browser by construction, so the headline alone mostly
answers "would this group one bug seen in three engines", not "would this group
a crash loop in one browser".

## Gates

Each gate is graded on the graded headline line of run 1, as pre-registered.

| Gate | Value | Band |
|---|---|---|
| Merges between two incidents that are not a designated hard-negative pair | **9** | Change the code (any ≥ 1) |
| Distinct hard-negative pairs merged | **9** of 15 | Change the code (≥ 3) |
| Headline recall (lower of per-pair and per-incident) | **0.2864** | Change the code (< 0.70) |
| Version-only recall, each browser environment (lower) | **0.2262** | Change the code (< 0.80) |
| Browser-only recall, pooled (lower) | **0.2778** | Change the code (< 0.50) |
| Isolated data-variant pairs | **8 of 20 merged** | Change the code (any split) |
| Isolated call-path pairs | **0 of 6 merged** | Publish with the limitation stated |
| Seed 1 vs seed 2 partitions | **identical** | Good |

## Validity

| Check | Run 1 | Run 2 |
|---|---|---|
| every control merges with its original | pass (10 of 10) | pass (10 of 10) |
| every report lands after retries | pass (748 of 748) | pass |
| no more than 10% of planned reports missing | pass (30 of 778, 3.9%) | pass |
| the run replayed this corpus (hash in the run header) | pass | pass |
| quarantine audit finds no breach | pass (stated above; audited separately) | — |

The run is valid, so the result stands.

## Headline

| | TP | FP | FN | TN | Precision | Recall/pair | Recall/incident |
|---|---|---|---|---|---|---|---|
| **Headline (graded)** | 506 | 252 | 1,261 | 113,322 | **0.6675** | **0.2864** | 0.2896 |
| Excluding byte-identical different-incident pairs (47 removed) | 506 | 205 | 1,261 | 113,322 | 0.7117 | 0.2864 | 0.2896 |

Both lines are given because the first is what a user experiences — two
different bugs in one bucket is a false merge whatever the reason — and the
second shows how much of the error comes from reports carrying no
distinguishing content at all. Here the gap is small: removing all 47
byte-identical different-incident pairs moves precision from 0.6675 to 0.7117,
so **the false merges are overwhelmingly between reports that do differ**.
170 byte-identical same-incident pairs are kept in both lines; they are trivial
agreement and account for a third of the 506 true positives.

The system put the 748 corpus reports into **289 bugs**. Perfect grouping within
environments would be about 130, and perfect grouping overall about 65. Only
**5 of 65 incidents** ended up in exactly one bug.

### By environment

| | Precision | Recall/pair | Recall/incident |
|---|---|---|---|
| `browser-prod` (minified) | 0.5942 | 0.1810 | 0.1912 |
| `browser-dev` (unminified) | 0.7095 | 0.3972 | 0.4022 |
| cross-environment (merges count, splits informational) | 0.8930 | 0.1301 | 0.1481 |

### Recall by pair type (Amendment 1)

| Pair type | Pairs | Merged | Recall/pair | Recall/incident |
|---|---|---|---|---|
| same browser, same version | 26 | 8 | 0.3077 | 0.3077 |
| same browser, different version | 353 | 196 | 0.5552 | 0.5668 |
| different browser, same version | 694 | 184 | 0.2651 | 0.2628 |
| different browser, different version | 694 | 118 | 0.1700 | 0.1704 |
| **total** | **1,767** | **506** | **0.2864** | |

## The finding that matters most for grouping: a deploy splits every open bug

The "same browser, different version" stratum is the deploy case: the same bug,
the same browser, before and after a release that touches no defect. Split by
environment it is the sharpest result in the evaluation.

| Environment | Pairs | Merged | Recall |
|---|---|---|---|
| `browser-dev` (unminified; source paths stable across the release) | 172 | 158 | **0.9186** |
| `browser-prod` (minified; chunk hashes and line/column numbers shift) | 181 | 38 | **0.2099** |

Same incidents, same browsers, same release — the only difference is whether the
bundle is minified. In development the fingerprint survives a release almost
perfectly. In a production build it survives 21% of the time.

So **in production, most bugs that are still happening will re-open as new bugs
on every deploy.** The occurrence count resets, the triage state and assignee
are lost, and `created` alerts fire for bugs the team already knows about. This
is the one stratum where the corpus difficulty argument does not apply at all:
these pairs share a browser and an engine, and the only thing that changed is
the build.

## Compared with two naive baselines

Computed on the same corpus, as the design pre-registered, for scale only.

| Grouping | Precision | Recall (lower of the two) |
|---|---|---|
| byte-equal `message` + `stack` | 0.7834 | 0.0962 |
| **the system** | 0.6675 | 0.2864 |
| byte-equal `message` alone | 0.5939 | 0.4141 |

The system sits between the two: more recall than exact-match on both fields,
less than matching the message alone, with precision in between. It does not
dominate either, and on one pre-registered gate a naive baseline does better
than the system: **version-only recall is 0.9167 for message-alone (publish
band) against 0.2262 for the system (change band)**. A fingerprint that ignored
the stack entirely would survive deploys far better than this one does.

## Controls: byte-identical repeats

All **10 of 10** controls merged with their originals, in both runs. A
byte-identical repeat of a report is always grouped with it.

This is reported here in the body rather than as a validity footnote because,
given the structure of the corpus, it is the **only** evidence about
byte-identical repeats — and that is the commonest real case, a single user
hitting the same crash repeatedly in one browser on one build. The corpus
contains no other pair of that kind (see the method finding below).

**Ten controls is thin evidence for the case that matters most.** They show the
mechanism does not fail outright; they cannot show how it behaves over
thousands of repeats, across sessions, or under concurrency. Nothing here
measures the repeat case at the scale production would produce.

## Every false merge

Nine ordinary merges (not designated hard-negative pairs) and nine
hard-negative pairs merged, across 284 report pairs. No corpus report landed on
a seeded demo bug.

The design requires every false-merge pair in the body. There are 284 of them,
in 18 distinct incident pairs; the 18 are listed here in full, and the complete
per-report-pair enumeration, each with both messages and five frames side by
side, is in the evaluation repository at
[`results/every-false-merge.md`](https://github.com/Krishnendu-9/bugsense-eval/blob/main/results/every-false-merge.md)
(indexed from [`results/README.md`](https://github.com/Krishnendu-9/bugsense-eval/blob/main/results/README.md)).
That split is a presentation choice, stated so it is not mistaken for
selection.

### Ordinary merges — each one alone puts this gate in "change the code"

| Incidents | Report pairs | What was collapsed |
|---|---|---|
| C1 + C3 | 21 | axios `POST /api/orders` → 500 with axios `GET /api/products/:id` → 404 |
| C2 + C3 | 21 | axios `GET /api/recommendations` → 500 with the same 404 |
| C1 + G3 | 4 | the 500 with a `trackPurchase is not a function` TypeError |
| C2 + G3 | 4 | as above |
| C3 + G3 | 4 | the 404 with the same TypeError |
| B2 + G9 | 4 | a React child invariant with an inventory-response error |
| B3 + G9 | 4 | as above, from a different component |
| D5 + G21 | 2 | a `setTimeout` session-refresh error with "Payments SDK not ready" |
| D5 + G22 | 2 | as above, from a different call site |

The C1/C3 merge is the clearest: different endpoints, different HTTP status in
the message text, different application functions — merged because the top three
frames are identical axios internals.

```
message A: Unhandled Promise Rejection: Request failed with status code 500
message B: Unhandled Promise Rejection: Request failed with status code 404
frame 1   at Wn (…/index-BOtVUl4o.js:11:11885)              identical
frame 2   at XMLHttpRequest._ (…/index-BOtVUl4o.js:11:18956) identical
frame 3   at $r.request (…/index-BOtVUl4o.js:13:2170)        identical
frame 4   at async ai (…:17:5614)        vs  at async qi (…:17:10300)
frame 5   at async e  (…:17:6761)        vs  at async t  (…:17:14324)
```

The frames that identify the actual caller — 4 and 5 — differ, and the status
code differs in the message. Both were discarded.

### Hard-negative pairs merged (9 of 15)

| Pair | Origin | Report pairs |
|---|---|---|
| A8a + A8b | D | 26 |
| C1 + C2 | D | 18 |
| C4 + C5 | D | 32 |
| B2 + B3 | D | 8 |
| G6 + G7 | B | 24 |
| G19 + G20 | B | 30 |
| G21 + G22 | B | 18 |
| G24 + G25 | B | 22 |
| G28 + G29 | B | 40 |

These are pairs designed to look alike, so merging one or two was pre-registered
as tolerable. Nine is not: the band is "3 or more means change the code". Six
were kept apart — A3/A4, D2/D3, E1/E2, G16/G17, G26/G27 and A5/G30 — so the
distinction is not uniformly impossible.

Note that E1/E2 — the pair expected to be byte-identical and therefore
impossible — was **not** merged, while pairs with different messages and
different frames were.

### False splits

3,047 false-split pairs. Every one is tabulated in the evaluation repository at
[`results/every-false-split-01.md`](https://github.com/Krishnendu-9/bugsense-eval/blob/main/results/every-false-split-01.md)
through `-06.md`, with both bug ids and each incident's split pattern. The split pattern is summarised by the strata above: nine incidents are
short of their planned reports, and the worst-split incidents (G18, C3, C1, G21,
A6, C2, G22 at 8–9 bugs each) are spread across both environments.

### Byte-identical pairs

442 pairs in the corpus are byte-identical on `title` and `errorLog`: 170
same-incident pairs inside the headline (trivial agreement, kept in both
headline lines) and 47 different-incident pairs (excluded from the second line
only). The rest fall outside the headline strata.

## Section 4: server-side reports (not graded)

BugSense has no server SDK, so these reports come from a reporter written for
this evaluation and are **excluded from every gate**. They are reported as an
illustration of how a future server SDK might behave.

| | Precision | Recall/pair | Recall/incident |
|---|---|---|---|
| `node-plain` | 0.8333 | 0.7143 | 0.7333 |
| `node-mapped` (`--enable-source-maps`) | 0.8333 | 0.7143 | 0.7333 |
| `node-plain` × `node-mapped` | 0.7538 | 0.3356 | 0.3350 |

Both Node environments score far better than the browser headline, and
identically to each other. Version-only recall is **1.000** in both: a Node
runtime upgrade and an app release do not split these bugs, because the frames
are stable file paths rather than minified bundles — the same mechanism that
fails in `browser-prod`. Plain and source-mapped frames of the same incident
group together only 34% of the time, so enabling source maps on a running
service would split its open bugs.

Of 46,240 Node-to-browser pairs, **none** merged. The F6/F7 hard-negative pair
merged in both environments.

## Two findings that are not about grouping

Both came out of investigating why planned reports were missing. Both were
established black-box, before the replay, and are documented in full in the
evaluation repository's `diagnostics/`.

### In Chromium, unhandled `fetch()` failures are never reported

C4, C5 and C6 produced **no report at all** in Chromium — not a report, not even
a CORS preflight — in all four cells, both environments and both app versions.
Firefox 157.0 and WebKit 27.2 reported all three on the first attempt, every
time.

**Engine versions matter here and are recorded.** Cross-origin rejection
handling is browser behaviour and changes between releases, so this finding is
pinned to what it was observed in: **Chromium 156.0.8078.4**, Firefox 157.0 and
WebKit 27.2, via the Playwright 1.64.1 browser builds (`corpus.lock` records all
three and the Playwright version). A later Chromium may behave differently in
either direction; re-check against the current release before concluding the
behaviour still holds.
48 of 48 Chromium attempts produced zero reports; 24 of 24 Firefox and WebKit
attempts produced one.

The cause was isolated without reading any BugSense code:

- Each attempt ran in a fresh browser context with retries over 11 seconds
  apart, which rules out the SDK's 10-second repeat suppression and its
  per-session cap. The first attempt in every cell already produced nothing.
- Endpoint reachability was probed before the click and after the failure, and
  the capture server was verified reachable from both Node and the browser on
  every attempt (216 markers, all recorded), which rules out a fixture or
  teardown race.
- With the SDK tag present, Chromium dispatches **no `unhandledrejection`
  event** for a real `fetch()` rejection. Without the tag, the same rejection
  dispatches the event normally.
- The same effect was reproduced **with no BugSense code on the page at all**,
  using a trivial `fetch` wrapper served from a second origin without CORS
  headers. Chromium dispatched no `unhandledrejection` event; served with CORS,
  it did. Firefox and WebKit dispatched it either way.

So the rule, stated as observed behaviour: Chromium 156 does not dispatch
`unhandledrejection` when the rejected error was created inside a classic script
loaded cross-origin without CORS. The SDK wraps `fetch` for breadcrumbs, and the
documented install is a `<script src="https://your-bugsense-host/sdk/bugsense.js">`
tag — cross-origin, with no `crossorigin` attribute — so the rejection's error
originates inside that script.

**Consequence:** a customer following the documented install loses, in Chrome,
every unhandled `fetch()` network failure. These are a large class of real
production errors, and they are lost before grouping is ever reached, so no
fingerprint change could recover them. C6 (`res.json()` on an HTML error page)
gets no event in Chromium even with no SDK present, so that one is engine
behaviour alone.

This was not fixed as part of this task.

### In development builds, one React render error produces two reports

B1–B3 produced exactly two reports per trigger in `browser-dev`, in all three
browsers, every attempt, and one report in `browser-prod`. A React 18.3.1
development build dispatches a window `error` event for a boundary-caught render
error in addition to the boundary's own `captureError` call, and that happens on
a page with no SDK present. Removing either input leaves one report.

It is not the SDK reporting twice: each report corresponds to a distinct input
the page gave it, and the SDK sent one report for several identical window
`error` events of a single render error. **Production builds do not dispatch
that event, so production occurrence counts are unaffected.** This belongs in
the SDK documentation rather than in a bug tracker.

## Follow-up: the Chromium finding explained from the SDK source

**When this was read.** `server/public/sdk/bugsense.js` was opened only after
everything above was already fixed and recorded: after `corpus.lock` v2
(`a0baeba`), after both replays, after `score.mjs` produced the numbers, and
after this document was written. The Chromium finding above was established
black-box — the corpus builder loaded the SDK only through a `<script>` tag and
never read it, and the mechanism was reproduced with no BugSense code on the
page at all. Nothing in this section changed a threshold, a corpus, a number or
a conclusion; it only explains one.

The SDK replaces `window.fetch` to record a breadcrumb per request
([`bugsense.js:180`](../server/public/sdk/bugsense.js#L180)). The rejection
handler adds its breadcrumb and then re-throws:

```js
function (err) {
  addBreadcrumb('xhr', 'API [' + method + '] ' + url + ' (FAILED)', { … });
  throw err;                       // bugsense.js:200
}
```

That `throw` is the whole mechanism. The promise the page awaits is no longer
the browser's own; it is the one returned by `.then()` *inside bugsense.js*, and
it rejects because a cross-origin script threw. The documented install is
`<script src="https://your-bugsense-host/sdk/bugsense.js">` — cross-origin by
design, with no `crossorigin` attribute — so Chromium treats the rejection as
originating in an opaque script and, as the SDK-free reproduction showed,
dispatches no `unhandledrejection` event at all.

**The SDK is not suppressing these errors — it is blinding itself to them, and
what blinds it is its own re-throw.** That distinction is the finding.

The hypothesis going in was self-filtering: a reporter that patches globals often
ignores errors whose stack points back into its own code, to avoid reporting
loops, and that would produce exactly this symptom. **That hypothesis was wrong.**
The source shows no such logic anywhere in the file — no ignore list, no
self-frame check, no origin test, no loop guard of any kind. Its
`unhandledrejection` listener
([`bugsense.js:355`](../server/public/sdk/bugsense.js#L355)) is unconditional and
would report every one of these errors if it ever ran. It never runs, because the
browser never dispatches the event, and the browser does not dispatch it because
the SDK re-threw the error from inside a cross-origin script. The SDK silences
its own reporting path, as a side effect of recording a breadcrumb.

This also matches the evidence that looked contradictory: passing the same
caught error to `BugSense.captureError` produced a report every time (case c),
because that path never depends on the event.

Three notes for whoever fixes this, which this task deliberately did not:

- **The likely fix is to report from where the error already is (untested).** At
  the moment it re-throws, the wrapper holds the error in hand, as `err`. It can
  report it from there instead of relying on an `unhandledrejection` event that
  will never arrive. That needs no CORS change, no attribute on the script tag,
  and works however the SDK is served. One thing to settle in the design: the
  wrapper's handler runs for *every* failed `fetch`, including ones the
  application catches and handles perfectly well, so reporting unconditionally
  from there would report errors that are not bugs. It needs a way to tell
  handled from unhandled — for instance holding the error briefly and reporting
  only if nothing has handled the rejection by the next tick.
- The builder's case (j) showed Chromium dispatches the event normally when the
  wrapper script is loaded with `crossorigin="anonymous"` and the response
  carries `Access-Control-Allow-Origin`. That route works but couples two
  changes, and **adding the attribute alone would make things worse**, not
  better: `/sdk/bugsense.js` is currently served with no
  `Access-Control-Allow-Origin` header at all, so a CORS-mode request for it
  would be blocked and the SDK would fail to load entirely. The header and the
  attribute have to land together, or the SDK has to be served same-origin.
- This is independent of the fingerprint work. It needs a browser test across
  the three engines, not a new corpus, and it is the more urgent of the two: a
  grouping defect mis-files reports that arrived, while this one means reports
  never arrive.

## A finding about the method: the corpus is built wrong for this problem

The design captured each incident once per cell — 3 browsers × 2 app versions,
one report each — and then measured grouping over all pairs. That optimises the
corpus for **diversity**, when the job deduplication actually does in production
is collapsing **repetition**.

The consequence is structural, not incidental:

- 78.6% of headline pairs are cross-browser by construction, so the headline is
  largely a cross-engine merging score.
- The "same browser, same version" stratum has only 26 pairs, 1.5% of the
  headline, and every one of them is a *variant* pair that deliberately differs
  in a data value or a call path.
- **No pair in the corpus is the same error repeating identically** in one
  browser on one build. The commonest production case is represented only by the
  10 controls, as a pass/fail.

This is a flaw in the design, not in the build: the builder followed the plan,
and the plan was wrong on this point. It was pre-registered, so it is reported
rather than corrected, and it limits what these numbers can be read as saying.

A second corpus should invert the shape: **many repeats per incident per cell,
fewer cells.** Concretely — the same error fired 20–50 times in one browser on
one build, including across page sessions and after a gap longer than the SDK's
suppression window; the same error on two builds with many repeats in each; and
only then a smaller cross-browser set. That would measure occurrence counting
and repeat collapsing, which is what a user sees first, and would make the
production stratum the largest rather than the smallest.

## Limitations, as pre-registered

The design requires each failing gate to be stated as a limitation in this
document and in the README's "Known limitations" section, in the same change
that publishes these results. The README bullets are **not yet added** — they
need their own edit:

> - Two different errors that share their top stack frames — for example two
>   different failing API calls, where the top frames are all inside axios — can
>   be grouped into one bug. In this evaluation 9 unrelated pairs of errors were
>   merged, plus 9 of 15 pairs that were designed to look alike.
> - The same error is often not grouped across browsers: the three engines word
>   the same `TypeError` differently, and only 28% of same-bug pairs that differ
>   only by browser were grouped.
> - In a production (minified) build, a release that shifts line numbers and
>   chunk hashes re-opens bugs that are still happening: only 21% of same-bug
>   pairs survived a release, against 92% in an unminified build.
> - An error whose message embeds a value — a product id, a parsed string — can
>   produce a separate bug per value: 12 of 20 such pairs were not grouped.
> - In Chrome, unhandled `fetch()` network failures are not reported at all, so
>   they never reach grouping.

Per-gate detail:

1. **Ordinary merges (9).** Unrelated errors share a bug. The affected bug's
   occurrence count is wrong, its triage applies to two problems, and resolving
   one leaves the other arriving silently. Evidence: the nine pairs above.
2. **Hard-negative merges (9 of 15).** As above, for errors that are genuinely
   similar. Six such pairs were distinguished, so this is not an inherent limit.
3. **Headline recall 0.2864.** One bug seen across engines and releases becomes
   many bugs. Partly corpus difficulty, as Amendment 1 requires stating, and
   partly real: a naive message match scores 0.4141 on the same corpus.
4. **Version-only recall 0.2262 (prod).** Deploys re-open open bugs. Not
   explained by corpus difficulty; see the section above.
5. **Browser-only recall 0.2778.** Cross-engine grouping mostly does not happen.
   This is the stratum the corpus genuinely over-weights.
6. **Data-variant splits (12 of 20).** A value in the message can produce one
   bug per value, which grows without bound.
7. **Call-path splits (6 of 6, publish band).** One bug per call site of a shared
   faulty helper. Bounded by the number of call sites.

## Future work: the fix, and how it must be retested

The diagnosis in the summary points at a specific change: keep more of the
frames that identify the caller, and normalise the varying data out of
messages — the opposite of what the normaliser does on each axis. The deploy
failure points the same way, since what shifts between minified builds is line
and column numbers and chunk hashes, not the call structure.

**No fix was made in this task, deliberately.** Fixing the code in the same
breath as measuring it is how a measurement becomes worthless, and section 5 of
the design pre-registered the retest rule:

> Whoever changes the normaliser will have seen every failure, so re-scoring the
> same corpus afterwards measures memory, not quality.

So any fix is checked two ways: against this frozen corpus **as a regression
check only**, and against a **new held-out corpus**, built blind by a new
builder with different components and messages of the same kinds. Only the
held-out result counts as the new measurement. Re-running this corpus after a
fix and quoting the improvement would be meaningless.

The held-out corpus should also adopt the shape described in the method finding
above — many repeats per incident per cell, fewer cells — so that the retest
measures repeat collapsing rather than cross-engine diversity.

## What this does not measure

As pre-registered in section 6 of the design: regression flagging,
occurrence-count accuracy, race safety under concurrent identical reports,
manual reports and the `possibleDuplicateOf` hint, the SDK's own client-side
suppression, grouping across projects, latency, real Safari on macOS or iOS,
and errors from the wild. Section 4 is reported but ungraded. Added by this
report: nothing here measures repeat collapsing at production scale, for the
reason given in the method finding.

## Reproducing this

```sh
# in the evaluation repository, with the stack at 521f9cb on a fresh seeded volume
node harness/verify-lock.mjs                 # must print: corpus.lock v2 verified
node replay.mjs --base http://localhost:8090 --seed 1 --out runs/run-seed1.jsonl
# wipe the volume, start fresh, seed again
node replay.mjs --base http://localhost:8090 --seed 2 --out runs/run-seed2.jsonl
node score.mjs runs/run-seed1.jsonl runs/run-seed2.jsonl --out results/
```

Both seeds produced identical partitions, so the grouping is deterministic and
order-independent.
