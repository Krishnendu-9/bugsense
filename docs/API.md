# API Reference

Every endpoint BugSense exposes. `Bearer` means a JWT from `/api/auth/login`
in the `Authorization` header; *Staff* means the `developer` or `admin` role.

## Authentication `/api/auth`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/config` | Public sign-up settings: `{ developerSignup }` | — |
| POST | `/register` | Register new user (`role: developer` only when developer sign-up is allowed) | — |
| POST | `/login` | Login, returns JWT | — |
| GET | `/me` | Get current user | Bearer |

## Bugs `/api/bugs`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List bugs, most recently updated first (filter: `status`, `priority`, `assignedTo`, `reporter`, `project`, `source` (`manual` or `sdk`), `search`, `page`, `limit`). Rows omit the error log; SDK rows carry `topFrame`, the first stack frame, by the same rule the fingerprint uses | Bearer |
| POST | `/` | Create bug; returns `analysisQueued` when the error log is being analysed in the background | Bearer |
| GET | `/stats` | Dashboard snapshot: status counts, `byPriority`, `projects` (distinct named projects), `oldestOpenAt` (creation time of the oldest open bug, `null` when none), `recent` (the 5 most recently updated bugs) | Bearer |
| GET | `/stats/trends` | Replayed from `statusHistory`. `openByDay`: bugs in `status: open` at the end of each of the last 7 UTC days, oldest first, today measured now. `timeToResolve`: `{ medianMs, sampleSize }` from `createdAt` to the first `resolved` entry; `closed` is not a resolution; `medianMs` is `null` when nothing has been resolved. `resolvedInWindow`: `{ since, count }`, bugs resolved at least once in the same 7 days | Bearer |
| GET | `/github-config` | Repositories the server's GitHub token may file issues in | Staff |
| GET | `/:id` | Single bug with comments | Bearer |
| PUT | `/:id` | Update bug (whitelisted, validated fields). Reporters may edit their bug's content and close/reopen it; status workflow, priority and assignment are staff-only | Bug reporter / Staff |
| DELETE | `/:id` | Delete bug | Admin only |
| POST | `/:id/screenshot` | Upload screenshot (multipart `screenshot`) | Bug reporter / Staff |
| POST | `/:id/annotation` | Upload annotated screenshot (multipart `annotation`) | Bug reporter / Staff |
| POST | `/:id/github` | Export bug as a GitHub Issue (the server token only for `GITHUB_ALLOWED_REPOS`; otherwise send `githubToken`) | Staff |

Deleting a bug removes it outright, so `/stats/trends` undercounts past days by any bug that was open then and has since been deleted.

## Comments `/api/comments`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Add comment | Bearer |
| GET | `/bug/:bugId` | Get comments for a bug | Bearer |
| DELETE | `/:id` | Delete comment | Author/Admin |

## AI `/api/ai`

| Method | Endpoint | Body | Returns | Auth |
|--------|----------|------|---------|------|
| POST | `/analyze` | `{ errorLog, bugContext?, bugId? }` | `{ possibleCause, suggestedFix, source }` | Bearer |
| POST | `/generate-patch` | `{ bugId?, errorLog?, bugDescription?, steps? }` | `{ diff, explanation, source, generatedAt }` | Bearer |
| POST | `/post-mortem` | `{ bugId }` | `{ markdown, source, generatedAt }` | Bearer |

`source` says what produced the result: `claude`, or without an API key `heuristic` (analysis), `template` (post-mortem) or `unavailable` (patch — the `diff` is empty). Passing `bugId` saves the result on that bug, which requires permission to edit it.

## Users `/api/users`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Every account, for the Team page | Admin only |
| PUT | `/:id/role` | Change a user's role (`reporter`, `developer`, `admin`); not your own | Admin only |
| GET | `/assignable` | Developers and admins a bug can be assigned to | Staff |
| GET | `/profile` | Get current user profile | Bearer |
| PUT | `/profile` | Update name / change password (returns a fresh token; other sessions are revoked) | Bearer |
| POST | `/avatar` | Upload profile avatar | Bearer |
| PUT | `/webhooks` | Save Discord/Slack webhook settings | Bearer |
| POST | `/webhooks/test` | Send a test alert to a webhook | Bearer |

## Telemetry `/api/telemetry`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/report` | SDK crash/feedback ingestion with fingerprint deduplication | Public, rate limited; `X-BugSense-Key` when `TELEMETRY_INGEST_KEY` is set |

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
