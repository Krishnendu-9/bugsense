# Architecture & Engineering Decisions

How the pieces fit together, the decisions that shaped the code, and what it
does not do well.

---

## Architecture

Two ways in: a human filing a structured report, or an SDK in someone else's app
reporting a crash automatically. Both are fingerprinted, but only SDK crashes are
deduplicated — a person's report is always kept, with a "looks similar" hint.
Every write fans back out over authenticated WebSockets.

```mermaid
flowchart TB
    subgraph clients["Clients"]
        UI["React SPA<br/>report · triage · Kanban"]
        SDK["bugsense.js<br/>embedded in a 3rd-party site"]
    end

    subgraph api["Express API"]
        AUTH["JWT auth<br/>reporter · developer · admin"]
        BUGS["Bug routes<br/>CRUD · search · filters"]
        TEL["Telemetry ingest<br/>public · rate limited<br/>optional ingest key"]
        FP{{"Fingerprint<br/>SHA-256 of normalised<br/>stack trace + project"}}
        INC["increment occurrences<br/>reopen if resolved<br/>= regression"]
        AI["AI service<br/>Claude, labelled fallbacks<br/>hourly budget for SDK"]
    end

    subgraph out["Side effects"]
        WS(["Socket.io broadcast"])
        AUDIT[("Audit log")]
        HOOK["Discord / Slack"]
        GH["GitHub Issues"]
    end

    DB[("MongoDB")]

    UI -->|"Bearer token"| AUTH
    AUTH --> BUGS
    SDK -->|"crash + breadcrumbs"| TEL

    BUGS -->|"always a new bug"| DB
    BUGS -.->|"similar report?"| FP
    TEL --> FP

    FP -->|"new SDK crash"| DB
    FP -->|"seen before (SDK)"| INC
    INC --> DB
    TEL --> AI

    DB --> WS
    DB --> AUDIT
    FP --> HOOK
    BUGS --> AI
    AI --> DB
    BUGS --> GH

    WS -.->|"live updates"| UI
```

**The part worth reading the code for** is the fingerprint step. Incoming stack
traces are normalised — UUIDs, memory addresses, timestamps and line numbers
stripped — then hashed with the project name. Identical SDK crashes collapse into
one incident with an occurrence counter instead of a thousand duplicate rows, and
a crash that reappears after being marked resolved is automatically flagged as a
regression. See [`fingerprint.util.js`](../server/utils/fingerprint.util.js) and
[`telemetry.controller.js`](../server/controllers/telemetry.controller.js).

How well it does that is measured rather than asserted:
[`docs/fingerprint-results.md`](fingerprint-results.md) reports a
pre-registered evaluation against a 748-report corpus of real stack traces,
built blind from three browser engines. Identical repeats group reliably — the
crash-loop case this exists for — while grouping the same bug across minified
production builds does not, because the chunk hashes and mangled function names
in every frame change with each release even though line numbers are stripped.

---

## Engineering Decisions

The choices below shaped the code most. Each one records what was done, why, and
what it costs.

**Only machine reports are deduplicated.** Merging two SDK crashes loses nothing,
because they're the same stack trace. Merging two *human* reports throws away
someone's description and steps, so manual reports are always kept and the
reporter is shown the similar incident instead.

**Deduplication is race-safe by construction.** A crash loop can send many
identical reports at once. Counting uses a single atomic `$inc`, and a unique
partial index on `{fingerprint, source: 'sdk'}` means two simultaneous "first"
reports can't both create an incident — the loser gets a duplicate-key error and
is retried as a repeat. A regression is flipped with one conditional update, so
it's recorded exactly once. The API tests fire eight reports concurrently to
prove it.

**Rich text is sanitised twice.** Descriptions are cleaned with `sanitize-html` on
write and with DOMPurify before rendering. The server copy protects every
consumer of the API; the client copy also covers records stored before
sanitising existed. This matters more than usual because the JWT lives in
`localStorage` (a project requirement): any script injection could read it. An
`httpOnly` cookie would be the stronger choice in a real deployment.

**Sessions can be revoked.** Each user has a `tokenVersion` embedded in their JWT.
Changing a password increments it, which invalidates every other session
immediately without keeping a server-side token list.

**The public endpoint is treated as hostile.** `/api/telemetry/report` must accept
unauthenticated traffic from other origins, so it has its own CORS policy, a
64 KB body limit, per-field length caps, enum coercion, its own rate limit and an
optional shared ingest key. Each new crash triggers an AI analysis, so those are
capped per hour — otherwise anyone could run up the API bill. Reports cannot claim
`critical` priority or `blocker` severity either: those page every alert channel,
so an SDK report tops out at high/major and staff escalate it after triage.

**Nothing waits on the model.** Filing a bug with an error log returns at once;
the analysis runs in the background (with its own hourly budget) and arrives on
the bug page over the socket. A generated patch is saved and reopened for free,
and only regenerated on request.

**AI output always says where it came from.** Every result carries `source`
(`claude`, `heuristic`, `template` or `unavailable`) and the UI labels it. Without
an API key, patch generation returns nothing rather than an invented diff: a
plausible-looking fake patch is worse than none.

**Two payload shapes, both populated.** Viewers of a bug receive the same fully
populated document as `GET /bugs/:id`, so they can replace their copy without
losing names or history. Everyone else gets the slim list shape that `GET /bugs`
returns — a crash loop re-broadcasts its bug on every occurrence, and each copy
would otherwise carry the full error log and breadcrumbs to every open tab.
Sockets require the same JWT as the REST API.

**Permissions live on the server; the UI mirrors them.** Every mutating route checks
the role or ownership (`authorize()`, `canModifyBug()`, `canSetStatus()`); the
client hides controls the user can't use, but never relies on that for security.
Being staff is a deliberate grant: developer self-sign-up is off in production
unless `ALLOW_DEVELOPER_SIGNUP=true`, and the server's GitHub token only files
issues in repositories listed in `GITHUB_ALLOWED_REPOS`.

**Unsafe configuration fails loudly.** In production the server refuses to start
with a missing, published or short `JWT_SECRET`. The Docker quick start runs with
a public demo secret only because it sets `ALLOW_INSECURE_JWT_SECRET=true`, and
the server prints a warning banner when it does.

**Testable by design.** The Express app is built by `createApp()` in `app.js`,
separate from the process that listens and connects to the database, so the API
tests run the real middleware stack against an in-memory MongoDB.

## Known limitations

- Uploads default to the server's local disk, which hosts like Render and Railway
  wipe on every redeploy. Set `CLOUDINARY_URL` to keep them in Cloudinary instead.
- The AI budgets and rate limits are per process, not shared across instances
  (a Redis store would fix this).
- Search is a case-insensitive substring match, so "saf" finds "Safari" as you
  type, but it scans rather than using an index. Queries are capped at 5 seconds;
  at real scale this would move to Atlas Search (a plain MongoDB text index only
  matches whole words).
- Single workspace: every signed-in user can see every bug.
- No email verification or password reset flow.
- No telemetry metric can be broken down by time. The SDK pipeline records how
  many times each incident occurred (one atomic `occurrences` counter) but not
  when each crash arrived — only the first and last. So crash rates, crashes per
  day, or "deduplication today" cannot be derived from stored data; the Overview
  shows the deduplication pair as all-time totals for this reason. Supporting
  them would mean recording arrivals, e.g. a per-incident daily bucket
  incremented alongside `occurrences`, and would only cover crashes received
  after that change.
- `npm audit` in `client/` reports 9 vulnerabilities (2 low, 2 moderate, 5 high,
  as of October 2026). They come from three advisories; the other entries are the
  packages that depend on them. They are accepted rather than cleared with
  `npm audit fix --force`:
  - **braces** (high, stack-exhaustion DoS) and **postcss-selector-parser**
    (moderate, CPU exhaustion), both pulled in by Tailwind CSS 3: 7 of the 9
    entries. Build-time only: they read our own Tailwind config and CSS, never
    user input, and are not in the shipped bundle. braces has no fixed release,
    and clearing either means Tailwind 4, which moves configuration into CSS,
    where the design tokens are mapped.
  - **quill** (low, XSS in its HTML export), through react-quill-new: 2 entries.
    It ships and runs in the editor, but no fixed version exists; the `--force`
    suggestion downgrades react-quill-new, which only moves quill to a release
    the advisory does not list. Editor output is sanitized on the server before
    it is stored and again by DOMPurify before it is rendered, so exported HTML
    never reaches the page unsanitized.
- An SDK embedded from another origin without `crossorigin="anonymous"` misses
  unhandled fetch failures in Chromium-based browsers. The SDK calls the native
  `fetch` for the page, so the error is created inside the SDK's script; when
  that script is loaded without CORS, Chromium treats it as opaque and fires no
  `unhandledrejection` event at all (the console still shows the error).
  Firefox reports these failures either way. The server now sends
  `Access-Control-Allow-Origin: *` on `/sdk/` and the snippet carries the
  attribute, but embeds already in place stay blind in Chromium until their
  owner adds it. The SDK logs one console warning when it finds itself loaded
  this way. Unhandled rejections from the page's own code are unaffected.
- Two different errors that share their top stack frames — for example two
  different failing API calls, where the top frames are all inside axios — can be
  grouped into one bug. In this evaluation 9 unrelated pairs of errors were
  merged, plus 9 of 15 pairs that were designed to look alike.
- The same error is often not grouped across browsers: the three engines word the
  same `TypeError` differently, and only 27% of same-bug pairs that differ only by
  browser were grouped.
- In a production (minified) build, a release that shifts line numbers and chunk
  hashes re-opens bugs that are still happening: only 20% of same-bug pairs
  survived a release, against 91% in an unminified build.
- An error whose message embeds a value — a product id, a parsed string — can
  produce a separate bug per value: 12 of 20 such pairs were not grouped.
- In Chrome, unhandled `fetch()` network failures are not reported at all, so they
  never reach grouping.

The last five come from a pre-registered measurement: see
[docs/fingerprint-results.md](fingerprint-results.md). The corpus and
harness are at [bugsense-eval](https://github.com/Krishnendu-9/bugsense-eval).
