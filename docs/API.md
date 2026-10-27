# API Reference

Every endpoint BugSense exposes. `Bearer` means a JWT from `/api/auth/login`
in the `Authorization` header; *Staff* means the `developer` or `admin` role.

## Authentication `/api/auth`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/config` | Public sign-up settings: `{ developerSignup }` | — |
| POST | `/register` | Register new user (password 8-72 characters; `role: developer` only when developer sign-up is allowed) | — |
| POST | `/login` | Login, returns JWT | — |
| GET | `/me` | Get current user | Bearer |

## Bugs `/api/bugs`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List bugs, most recently updated first (filter: `status`, `priority`, `assignedTo`, `reporter`, `project`, `source` (`manual` or `sdk`), `search`, `page`, `limit`). Rows omit the error log; SDK rows carry `topFrame`, the first stack frame, by the same rule the fingerprint uses | Bearer |
| POST | `/` | Create bug; returns `analysisQueued` when the error log is being analysed in the background. `status`, `priority` and `assignedTo` are ignored from reporters (triage is staff-only), and only a bug staff file can page the alert channels on creation | Bearer |
| GET | `/stats` | Dashboard snapshot: status counts, `byPriority`, `projects` (distinct named projects), `oldestOpenAt` (creation time of the oldest open bug, `null` when none), `recent` (the 5 most recently updated bugs) | Bearer |
| GET | `/stats/trends` | Replayed from `statusHistory`. `openByDay`: bugs in `status: open` at the end of each of the last 7 UTC days, oldest first, today measured now. `timeToResolve`: `{ medianMs, sampleSize }` from `createdAt` to the first `resolved` entry; `closed` is not a resolution; `medianMs` is `null` when nothing has been resolved. `resolvedInWindow`: `{ since, count }`, bugs resolved at least once in the same 7 days | Bearer |
| GET | `/github-config` | Repositories the server's GitHub token may file issues in | Staff |
| GET | `/:id` | Single bug, with `mergedInto: { _id, title, status }` when the fingerprint migration merged it into another. Comments come from `/api/comments/bug/:id` | Bearer |
| PUT | `/:id` | Update bug (whitelisted, validated fields). Reporters may edit their bug's content and close/reopen it; status workflow, priority and assignment are staff-only. Staff raising priority to `critical` or severity to `blocker` sends an `escalated` alert. Editing a manual bug's title, log or project re-keys its fingerprint; editing the log sets `aiInsights.outdated` | Bug reporter / Staff |
| DELETE | `/:id` | Delete bug | Admin only |
| POST | `/:id/screenshot` | Upload or replace the screenshot (multipart `screenshot`). Replacing it also removes the annotation drawn on the old one | Bug reporter / Staff |
| POST | `/:id/annotation` | Upload annotated screenshot (multipart `annotation`) | Bug reporter / Staff |
| POST | `/:id/github` | Export bug as a GitHub Issue (the server token only for `GITHUB_ALLOWED_REPOS`; otherwise send `githubToken`). `409` with the existing `githubIssue` if the bug was already exported; `504`/`502` when GitHub does not answer | Staff |

Deleting a bug removes it outright, so `/stats/trends` undercounts past days by any bug that was open then and has since been deleted. `timeToResolve` is computed over at most the 5,000 most recently updated resolved bugs, and carries `limited: true` when that cap was reached.

Uploads must be PNG, JPEG, GIF or WebP up to 5 MB, and their content must match: a file whose first bytes are not the format it claims is rejected with `400` and deleted. Stored files get random names.

## Comments `/api/comments`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Add comment | Bearer |
| GET | `/bug/:bugId` | Get comments for a bug | Bearer |
| DELETE | `/:id` | Delete comment | Author/Admin |

## AI `/api/ai`

| Method | Endpoint | Body | Returns | Auth |
|--------|----------|------|---------|------|
| POST | `/analyze` | `{ errorLog, bugContext? }` or `{ bugId }` | `{ possibleCause, suggestedFix, source }` | Bearer |
| POST | `/generate-patch` | `{ errorLog?, bugDescription?, steps? }` or `{ bugId }` | `{ diff, explanation, source, generatedAt }` | Bearer |
| POST | `/post-mortem` | `{ bugId }` | `{ markdown, source, generatedAt }` | Bug reporter / Staff |

`source` says what produced the result: `claude`, or without an API key (or when the model call fails, is declined or is cut off) `heuristic` (analysis), `template` (post-mortem) or `unavailable` (patch — the `diff` is empty). With `bugId`, the bug's own stored log, description and steps are used, any of those fields in the body are ignored, and the result is saved on the bug; that requires permission to edit it. The AI routes are rate limited per account (50 calls per 15 minutes).

## Users `/api/users`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Every account, for the Team page | Admin only |
| PUT | `/:id/role` | Change a user's role (`reporter`, `developer`, `admin`); not your own. Closes that user's open sockets, which reconnect under the new role | Admin only |
| GET | `/assignable` | Developers and admins a bug can be assigned to | Staff |
| GET | `/profile` | Get current user profile | Bearer |
| PUT | `/profile` | Update name / change password (8-72 characters; returns a fresh token; other sessions are revoked and their sockets closed) | Bearer |
| POST | `/avatar` | Upload profile avatar | Bearer |
| PUT | `/webhooks` | Save Discord/Slack webhook settings. `alertOnCritical` and `alertOnRegression` must be booleans | Bearer |
| POST | `/webhooks/test` | Send a test alert to a webhook | Bearer |

## Telemetry `/api/telemetry`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/report` | SDK crash ingestion with fingerprint deduplication. A report with `kind: "feedback"` (the SDK widget) is filed as its own bug, tagged `feedback`, never merged | Public, rate limited; `X-BugSense-Key` when `TELEMETRY_INGEST_KEY` is set |

## Audit `/api/audit`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Paginated activity log (filter: `entityType`, `action`) | Staff |

## Health `/api/health`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Liveness probe | — |
| GET | `/metrics` | Uptime, heap, Mongo status, SDK deduplication (crashes received vs incidents after grouping) | Staff |

*Staff* means the `developer` or `admin` role. Sockets require the same JWT, passed as `auth.token` in the Socket.io handshake.
