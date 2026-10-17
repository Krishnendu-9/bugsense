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
