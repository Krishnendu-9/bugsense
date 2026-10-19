# BugSense — Project Context for Claude Code

## What This Project Is
BugSense is a full-stack MERN application — a Smart Bug Reporting 
& Debug Assistant tool for development teams. This is a portfolio/CV 
project. Code quality, folder structure, and UI must be 
production-grade and impressive at all times.

## Problem It Solves
Bug reports are unclear and incomplete. Developers waste time asking 
"steps to reproduce?", "what browser?", "what error?". BugSense 
structures the entire reporting flow and uses AI to help debug faster.

=============================================================
TECH STACK
=============================================================

Frontend:
- React 18 (Vite)
- Tailwind CSS v3
- React Router DOM v6
- Axios
- React Hook Form
- React Quill (rich text description)
- Fabric.js (canvas annotation on screenshots)
- Lucide React (icons)
- Recharts (analytics charts)
- React Hot Toast (notifications)
- date-fns (date formatting)

Backend:
- Node.js + Express.js
- MongoDB + Mongoose
- JWT (jsonwebtoken + bcryptjs)
- Multer (file uploads)
- express-validator (input validation)
- cors, dotenv, helmet, morgan

=============================================================
FOLDER STRUCTURE
=============================================================

bugsense/
├── CLAUDE.md
├── .gitignore
├── .env.example              (docker-compose overrides)
├── docker-compose.yml
├── .github/workflows/ci.yml  (lint + server tests + client build + docker)
├── README.md
├── client/
│   ├── public/favicon.svg
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.cjs    (CommonJS so the dev server reloads it)
│   ├── postcss.config.js
│   ├── eslint.config.js
│   ├── nginx.conf / Dockerfile
│   ├── vercel.json            (SPA rewrites for Vercel)
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/
│       │   └── axios.js
│       ├── components/
│       │   ├── common/
│       │   │   ├── Navbar.jsx
│       │   │   ├── Sidebar.jsx
│       │   │   ├── Loader.jsx
│       │   │   ├── ProtectedRoute.jsx
│       │   │   ├── RoleRoute.jsx
│       │   │   ├── ErrorBoundary.jsx   (app + page variants, self-reports crashes)
│       │   │   ├── Modal.jsx           (accessible dialog shell)
│       │   │   ├── ConfirmDialog.jsx
│       │   │   ├── OverflowMenu.jsx    ("more actions" menu; keyboard + outside-click)
│       │   │   └── Badge.jsx
│       │   ├── bugs/
│       │   │   ├── BugTable.jsx           (Bugs list table; shares StatusMark/PriorityText with Overview)
│       │   │   ├── ViewSwitch.jsx         (List / Board segmented switch, on both pages)
│       │   │   ├── BugForm.jsx
│       │   │   ├── BugFilters.jsx
│       │   │   ├── StepsReproducer.jsx
│       │   │   ├── BreadcrumbTimeline.jsx
│       │   │   ├── AnnotationCanvas.jsx   (lazy-loaded)
│       │   │   ├── EditBugModal.jsx       (lazy-loaded, BugForm mode="edit")
│       │   │   └── GitHubExportModal.jsx
│       │   ├── dashboard/
│       │   │   ├── StatsCard.jsx
│       │   │   ├── BugChart.jsx
│       │   │   └── RecentBugs.jsx
│       │   └── ai/
│       │       ├── ErrorInsights.jsx
│       │       ├── GitPatchModal.jsx
│       │       └── PostMortemModal.jsx
│       ├── context/
│       │   ├── contexts.js       (AuthContext, SocketContext objects)
│       │   ├── AuthContext.jsx   (AuthProvider)
│       │   └── SocketContext.jsx (SocketProvider)
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useBugs.js
│       │   ├── useAI.js
│       │   ├── useSocket.js
│       │   └── useDebouncedValue.js
│       ├── pages/
│       │   ├── auth/ (Login.jsx, Register.jsx)
│       │   ├── bugs/ (BugList.jsx, BugDetail.jsx, ReportBug.jsx, KanbanBoard.jsx)
│       │   ├── dashboard/Dashboard.jsx
│       │   ├── ai/AIAnalyzer.jsx
│       │   ├── audit/AuditTrail.jsx        (staff only)
│       │   ├── metrics/SystemMetrics.jsx   (staff only)
│       │   ├── playground/SDKPlayground.jsx
│       │   ├── profile/Profile.jsx
│       │   └── admin/Team.jsx              (admin only)
│       ├── test/                           (renderWithProviders, SDK jsdom tests)
│       └── utils/
│           ├── constants.js
│           ├── helpers.js                  (incl. statusOptionsFor)
│           └── selfReport.js
│
└── server/
    ├── server.js             (entry: dotenv, DB, http + socket, listen)
    ├── app.js                (createApp() — Express app, used by tests)
    ├── package.json
    ├── eslint.config.js
    ├── .env / .env.example
    ├── Dockerfile / .dockerignore
    ├── uploads/
    ├── public/sdk/bugsense.js   (embeddable SDK)
    ├── config/
    │   ├── db.js
    │   └── socket.js         (JWT-authenticated Socket.io, broadcast())
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── bug.controller.js
    │   ├── comment.controller.js
    │   ├── ai.controller.js
    │   ├── user.controller.js
    │   ├── telemetry.controller.js
    │   └── audit.controller.js
    ├── middleware/
    │   ├── auth.middleware.js     (protect, authorize(...roles), adminOnly)
    │   ├── upload.middleware.js
    │   ├── rateLimit.middleware.js
    │   └── error.middleware.js    (maps Multer/Mongoose errors to 4xx)
    ├── models/
    │   ├── User.model.js
    │   ├── Bug.model.js
    │   ├── Comment.model.js
    │   └── AuditLog.model.js
    ├── routes/
    │   ├── auth.routes.js
    │   ├── bug.routes.js
    │   ├── comment.routes.js
    │   ├── ai.routes.js
    │   ├── user.routes.js
    │   ├── telemetry.routes.js
    │   └── audit.routes.js
    ├── services/
    │   ├── ai.service.js          (Claude + labelled fallbacks)
    │   ├── token.service.js
    │   ├── audit.service.js
    │   ├── webhook.service.js
    │   ├── bugEvents.service.js   (full payload to bug room, slim to everyone)
    │   ├── autoAnalysis.service.js (background AI on new bugs)
    │   └── storage.service.js     (local disk / Cloudinary)
    ├── scripts/seed.js
    ├── tests/                     (node:test + Supertest, mongodb-memory-server)
    └── utils/
        ├── fingerprint.util.js
        ├── sanitize.js            (sanitize-html for rich text)
        ├── permissions.js         (isStaff, canModifyBug, canSetStatus)
        ├── webhookUrl.js          (SSRF allowlist)
        ├── uploads.js             (safe file cleanup)
        ├── aiBudget.js            (telemetry + report AI hourly caps)
        ├── clientOrigins.js       (CLIENT_URL list)
        └── trustProxy.js          (TRUST_PROXY parsing)

    (utils/anthropic.js and utils/generateToken.js were removed in session 4 —
     use services/ai.service.js and services/token.service.js)

=============================================================
DATABASE MODELS
=============================================================

User.model.js:
  name: String (required)
  email: String (required, unique)
  password: String (hashed with bcryptjs)
  role: enum ['reporter', 'developer', 'admin'] default: reporter
  avatar: String (URL)
  createdAt: Date

Bug.model.js:
  title: String (required)
  description: String (required, rich text)
  steps: [String] (array of reproduction steps)
  priority: enum ['low', 'medium', 'high', 'critical']
  status: enum ['open', 'in-progress', 'resolved', 'closed']
  severity: enum ['minor', 'major', 'blocker']
  browserInfo: {
    browser: String,
    version: String,
    os: String,
    screenSize: String,
    userAgent: String
  }
  screenshot: String (URL)
  annotatedScreenshot: String (URL)
  errorLog: String (pasted error text)
  aiInsights: {
    possibleCause: String,
    suggestedFix: String,
    analyzedAt: Date
  }
  reporter: ObjectId (ref: User)
  assignedTo: ObjectId (ref: User)
  project: String
  tags: [String]
  comments: [ObjectId] (ref: Comment)
  createdAt, updatedAt: Date

Comment.model.js:
  bug: ObjectId (ref: Bug, required)
  author: ObjectId (ref: User, required)
  content: String (required)
  createdAt: Date

=============================================================
API ROUTES
=============================================================

/api/auth
  POST /register       → Register user
  POST /login          → Login, return JWT
  GET  /me             → Get current user (protected)

/api/bugs
  GET    /             → All bugs (filter: status, priority, assignedTo)
  POST   /             → Create bug (protected)
  GET    /:id          → Single bug
  PUT    /:id          → Update bug (protected)
  DELETE /:id          → Delete bug (admin only)
  POST   /:id/screenshot → Upload screenshot

/api/comments
  POST   /             → Add comment (protected)
  GET    /bug/:bugId   → Get comments for a bug
  DELETE /:id          → Delete comment (author only)

/api/ai
  POST   /analyze      → Analyze error log via Anthropic API
  Body:    { errorLog: String, bugContext: String }
  Returns: { possibleCause: String, suggestedFix: String }

=============================================================
BUILD PHASES (update status as you progress)
=============================================================

PHASE 1 — Foundation:          [x] COMPLETE (session 1 — 2026-04-28)
  - Backend: server, db, models, routes, controllers ✓
  - Frontend: Vite, Tailwind, Router, AuthContext ✓
  - Login + Register pages ✓

PHASE 2 — Core Bug Flow:       [x] COMPLETE (session 1 — 2026-04-28)
  - ReportBug form (rich text, steps, auto browser capture) ✓
  - Screenshot upload with drag-and-drop ✓
  - BugList with filters + pagination ✓
  - BugDetail with comments + inline status/priority edit ✓

PHASE 3 — Developer Dashboard: [x] COMPLETE (session 1 — 2026-04-28)
  - Stats cards (total, open, in-progress, resolved) ✓
  - Recharts (priority bar chart + status pie chart) ✓
  - Assign bugs, update status (in BugDetail edit panel) ✓

PHASE 4 — AI Features:         [x] COMPLETE (session 1 — 2026-04-28)
  - ErrorInsights component ✓
  - /api/ai/analyze route (Anthropic API, claude-sonnet-5) ✓
  - Auto-analyze on bug submission ✓
  - Standalone AIAnalyzer page with example errors ✓

PHASE 5 — Polish:              [x] COMPLETE (session 2 — 2026-04-28)
  - Fabric.js annotation canvas ✓ (wired into BugDetail with modal)
  - Activity/status history ✓ (statusHistory in Bug model + sidebar timeline)
  - Collapsible sidebar ✓ (toggle button, icon-only collapsed mode)
  - postcss.config.js ✓ (Tailwind now works)
  - Admin seeder ✓ (server/scripts/seed.js, run with npm run seed)
  - README written ✓ (screenshots section is placeholder)

=============================================================
WHAT IS LEFT TO DO (start here next session)
=============================================================

FEATURE COMPLETE — SOCKET.IO REAL-TIME (session 3 — 2026-09-03)
  ✓ socket.io added to server/package.json & installed
  ✓ socket.io-client added to client/package.json & installed
  ✓ server/config/socket.js — initSocket() + getIO() singleton created
  ✓ server/server.js — uses http.createServer + initSocket()
  ✓ server/controllers/bug.controller.js — emits bug:created, bug:updated, bug:deleted, bug:detail:updated
  ✓ server/controllers/comment.controller.js — emits comment:added, comment:deleted to bug room
  ✓ client/src/context/SocketContext.jsx — exposes reactive { socket, connected }
  ✓ client/src/hooks/useSocket.js — useSocket() + useSocketEvent() hooks
  ✓ client/src/main.jsx — wrapped with <SocketProvider>
  ✓ client/src/components/common/Navbar.jsx — Live/Connecting indicator
  ✓ client/src/hooks/useBugs.js — exports setBugs + setBug
  ✓ client/src/pages/bugs/BugList.jsx — listens to bug:created, bug:updated, bug:deleted
  ✓ client/src/pages/bugs/BugDetail.jsx — join/leave bug room, listens to bug:detail:updated, comment:added, comment:deleted with live toasts and deduplication

WHAT STILL NEEDS TO BE DONE (start here next):

FEATURE COMPLETE — PROFILE / SETTINGS PAGE (session 3 — 2026-09-03)
  ✓ server/controllers/user.controller.js — profile retrieval, profile/name update, password verification & change, avatar upload
  ✓ server/routes/user.routes.js — GET/PUT /api/users/profile, POST /api/users/avatar
  ✓ server/server.js — mounted /api/users
  ✓ client/src/context/AuthContext.jsx — added updateUser() helper
  ✓ client/src/utils/helpers.js — added getImageUrl() helper
  ✓ client/src/pages/profile/Profile.jsx — identity card, avatar upload with live preview, general info form, password update with validation
  ✓ client/src/App.jsx — added /profile route
  ✓ client/src/components/common/Sidebar.jsx — added Profile navigation item and avatar link
  ✓ client/src/components/common/Navbar.jsx — linked avatar and user info to /profile
  ✓ client/vite.config.js — proxied /uploads to backend

FEATURE COMPLETE — RATE LIMITING & SECURITY HARDENING (session 3 — 2026-09-03)
  ✓ express-rate-limit installed on server
  ✓ server/middleware/rateLimit.middleware.js — globalLimiter (2000/15min prod, 50000 dev), authLimiter (50/15min prod, 1000 dev), aiLimiter (50/15min), telemetryLimiter (60/min prod, 300 dev)
  ✓ server/server.js — globalLimiter applied to /api, helmet configured with cross-origin resource policy & disabled CSP, security headers added
  ✓ server/routes/auth.routes.js — authLimiter attached to /register and /login
  ✓ server/routes/ai.routes.js — aiLimiter attached to /analyze
  ✓ server/utils/anthropic.js — hardened client initialization & regex markdown cleanup (prevents 502 on wrapped JSON)

FEATURE COMPLETE — CREDENTIALS, FIRST RUN & SEED SCRIPT (session 3 — 2026-09-03)
  ✓ server/scripts/seed.js — fixed Windows fileURLToPath path resolution
  ✓ server/config/db.js — added fallback to mongodb://localhost:27017/bugsense
  ✓ server/utils/generateToken.js & auth.middleware.js — fallback dev JWT secrets
  ✓ server/.env — configured with developer defaults for local startup

ALL BUILD PHASES 1 THROUGH 5 ARE NOW COMPLETE!
Deploy readiness:
  Backend  → Railway/Render (add env vars: PORT, MONGO_URI, JWT_SECRET, ANTHROPIC_API_KEY, CLIENT_URL)
  Frontend → Vercel (add env var: VITE_API_URL = deployed backend)

=============================================================
SESSION 3 — NEW/MODIFIED FILES SO FAR
=============================================================

NEW:
  server/config/socket.js
  client/src/context/SocketContext.jsx
  client/src/hooks/useSocket.js

MODIFIED:
  server/server.js              ← http.createServer + initSocket
  server/package.json           ← added socket.io
  server/controllers/bug.controller.js     ← emits socket events
  server/controllers/comment.controller.js ← emits socket events
  client/package.json           ← added socket.io-client
  client/src/main.jsx           ← added SocketProvider
  client/src/components/common/Navbar.jsx  ← Live indicator pill
  client/src/hooks/useBugs.js   ← exports setBugs, setBug
  client/src/pages/bugs/BugList.jsx ← real-time bug list updates

=============================================================
NEW FILES ADDED IN SESSION 2
=============================================================

  client/postcss.config.js          ← Tailwind v3 requires this
  server/scripts/seed.js            ← Seeds 3 users + 4 sample bugs
  server/package.json               ← Added "type":"module" + seed script

MODIFIED IN SESSION 2:
  client/src/components/common/Sidebar.jsx      ← Collapsible, icon-only mode
  client/src/components/common/ProtectedRoute.jsx ← Manages collapsed state
  client/src/pages/bugs/BugDetail.jsx           ← Annotation modal + history timeline
  server/models/Bug.model.js                    ← statusHistory[] array added
  server/controllers/bug.controller.js          ← Records status changes to history

=============================================================
FILES CREATED IN SESSION 1 (all complete, no truncation)
=============================================================

server/
  server.js, config/db.js
  models/User.model.js, Bug.model.js, Comment.model.js
  middleware/auth.middleware.js, upload.middleware.js, error.middleware.js
  controllers/auth.controller.js, bug.controller.js,
              comment.controller.js, ai.controller.js
  routes/auth.routes.js, bug.routes.js, comment.routes.js, ai.routes.js
  utils/generateToken.js, anthropic.js
  package.json, .env.example

client/
  index.html, vite.config.js, tailwind.config.cjs, package.json
  src/index.css, main.jsx, App.jsx
  src/api/axios.js
  src/utils/constants.js, helpers.js
  src/context/AuthContext.jsx
  src/hooks/useAuth.js, useBugs.js, useAI.js
  src/components/common/Loader.jsx, Badge.jsx, ProtectedRoute.jsx,
                         Navbar.jsx, Sidebar.jsx
  src/components/bugs/StepsReproducer.jsx, AnnotationCanvas.jsx,
                  BugCard.jsx, BugFilters.jsx, BugForm.jsx
  src/components/dashboard/StatsCard.jsx, BugChart.jsx, RecentBugs.jsx
  src/components/ai/ErrorInsights.jsx
  src/pages/auth/Login.jsx, Register.jsx
  src/pages/bugs/BugList.jsx, BugDetail.jsx, ReportBug.jsx
  src/pages/dashboard/Dashboard.jsx
  src/pages/ai/AIAnalyzer.jsx

root/
  .gitignore, README.md

=============================================================
SESSION 4 — SECURITY & CORRECTNESS HARDENING (2026-09-22)
=============================================================

Security:
  ✓ Stored XSS closed: rich text sanitized on write (server/utils/sanitize.js)
    and on render (DOMPurify in helpers.sanitizeHtml); stripHtml uses DOMParser
  ✓ Socket.io requires the JWT (handshake auth.token); client connects only when signed in
  ✓ Telemetry: optional TELEMETRY_INGEST_KEY, own CORS policy (TELEMETRY_ALLOWED_ORIGINS),
    64kb body limit, field clamping/enum coercion, TELEMETRY_AI_HOURLY_BUDGET cap
  ✓ SSRF: webhook URLs restricted to real Discord/Slack endpoints
  ✓ Authorization: screenshot/annotation/AI writes need canModifyBug; GitHub export,
    /audit, /health/metrics, /users/assignable are staff only; assignees must be staff
  ✓ Password change bumps User.tokenVersion → all old JWTs rejected; new token returned
  ✓ List filters validated (no operator injection), page size capped at 100
  ✓ SDK: no input values captured, URLs stripped of query/hash, safe console hook,
    double-load guard, BugSense.destroy()
  ✓ Dependencies: multer 2, fabric 7, react-router 7, vite 8, react-quill-new,
    qs override — server audit clean; client has one low quill advisory (no upstream fix)

Correctness:
  ✓ Manual reports never merge into existing bugs (possibleDuplicateOf hint instead)
  ✓ SDK dedup uses atomic $inc + unique partial index {fingerprint, source:'sdk'}
  ✓ All socket payloads are fully populated (services/bugEvents.service.js)
  ✓ Error middleware maps Multer/Cast/Validation/duplicate-key errors to 4xx
  ✓ Annotations uploaded as files (POST /api/bugs/:id/annotation), not base64
  ✓ Replaced uploads are deleted from disk
  ✓ Webhooks: per-user settings honoured; only 'created'/'regression' alert
  ✓ AI results carry source ('claude' | 'heuristic' | 'template' | 'unavailable');
    no fabricated fallback diffs
  ✓ Docker: nginx forwards X-Forwarded-For + 6m body limit; server NODE_ENV=production,
    not published; Mongo bound to 127.0.0.1
  ✓ Seed refuses to wipe a populated DB (npm run seed:reset to force)

Client:
  ✓ Assign dropdown in BugDetail edit panel (staff), server-side search with debounce,
    export of all matching bugs (CSV-injection safe), Kanban rollback + 100-bug notice,
    priority chart ordered/colored by priority, real status badges, mobile drawer
    sidebar, role-filtered nav + RoleRoute, Ctrl/⌘+K search, skeleton loaders

Tests: server/tests (36 cases) — run with `cd server && npm test`

Upgrade note for existing databases: the unique SDK fingerprint index will fail to
build if the DB already holds several source:'sdk' bugs with the same fingerprint;
merge or delete those duplicates, then restart the server.

=============================================================
SESSION 5 — PORTFOLIO POLISH (2026-09-22)
=============================================================

  ✓ Client tests: Vitest + React Testing Library (jsdom) in client/src/**/*.test.{js,jsx}
    (35 tests: helpers, RoleRoute, Sidebar, BugForm, AI labelling). Run: cd client && npm test
    Shared helper: client/src/test/renderWithProviders.jsx; CI runs them
  ✓ README: screenshots in docs/screenshots/ (near the top), Engineering Decisions +
    Known limitations sections, architecture diagram matches real dedup behaviour
  ✓ Wording toned down (no "Enterprise"/"Observability" labels, plainer AI prompts)
  ✓ BugDetail header: title on its own row, actions below
  ✓ Alerts fire on critical priority OR blocker severity; sockets retry indefinitely;
    SDK scrubs query strings from stack traces too
  ✓ USER-GUIDE.md and TESTING-SHEET.md rewritten (both gitignored)
  ✗ Not deployed yet (owner wants a full manual test pass first)

=============================================================
SESSION 6 — REVIEW FOLLOW-UPS (2026-09-27)
=============================================================

Owner decisions: developer sign-up behind an env flag; optional Cloudinary;
reporters may only close/reopen their own bugs.

Security / config:
  ✓ ALLOW_DEVELOPER_SIGNUP (unset: on in dev, off in prod) + GET /api/auth/config;
    admin Team page (/team) + GET /api/users, PUT /api/users/:id/role (not own role)
  ✓ Server GITHUB_TOKEN only for GITHUB_ALLOWED_REPOS (GET /api/bugs/github-config);
    users can always pass their own token
  ✓ SDK reports capped at high/major (critical/blocker page alert channels);
    env Discord/Slack channels follow the same alert rule; webhooks refuse redirects
  ✓ checkJwtSecret: prod refuses missing/published/<32-char JWT_SECRET unless
    ALLOW_INSECURE_JWT_SECRET=true (compose sets it for the local demo, with a banner)
  ✓ CLIENT_URL accepts a comma-separated list (utils/clientOrigins.js); TRUST_PROXY env
  ✓ .gitignore now ignores **/uploads/* (the old rule never matched server/uploads);
    tests upload into a temp UPLOADS_DIR

Features / behaviour:
  ✓ services/storage.service.js: local disk by default, Cloudinary when CLOUDINARY_URL set
  ✓ Edit Details dialog (BugForm mode="edit") for bug content; Triage panel for status/
    priority/assignee; canSetStatus + statusOptionsFor enforce reporter close/reopen
  ✓ New reports analysed in the background (services/autoAnalysis.service.js,
    REPORT_AI_HOURLY_BUDGET); BugDetail shows a pending skeleton until the socket result
  ✓ Saved AI patch reopened without a model call; Regenerate on request
  ✓ Duplicate hint toast links to the similar bug
  ✓ Broadcast bug:created/bug:updated are slim (LIST_EXCLUDED_FIELDS); full doc only
    to the bug's room
  ✓ List queries capped with maxTimeMS (503 on timeout); regex search kept on purpose
  ✓ SDK v1.2.0: XMLHttpRequest (axios) + replaceState breadcrumbs
  ✓ Dashboard self-reports render crashes (utils/selfReport.js, VITE_SELF_REPORT);
    page-level ErrorBoundary resets on navigation
  ✓ Audit events: USER_REGISTERED, LOGIN_FAILED, PASSWORD_CHANGED, ROLE_CHANGED,
    COMMENT_ADDED, COMMENT_DELETED (comment entries store the bug id)

Client quality:
  ✓ Fixed AI Analyzer: typed/pasted logs never enabled Analyze (onChange override)
  ✓ Route-level React.lazy; Fabric/Quill load on demand (first load ~132 kB gzip);
    manualChunks now only splits React
  ✓ Shared accessible Modal (Escape, focus trap/return) + ConfirmDialog; all dialogs use it
  ✓ Contexts moved to context/contexts.js; ESLint 0 warnings; no spinners left;
    webhook + GitHub forms use React Hook Form; auth inputs labelled
  ✓ BugDetail remounts per bug id (key) so state never leaks between bugs
  ✓ client/vercel.json (SPA rewrites), client/.env.example

Ops:
  ✓ Graceful SIGTERM/SIGINT shutdown; Dockerfile runs as `node`, HEALTHCHECK, `node server.js`;
    compose waits for a healthy Mongo; .gitattributes (LF everywhere)
  ✓ CI runs test:coverage for both packages

Tests: server 75 (npm test), client 70 incl. SDK jsdom tests (npm test).
Not yet verified: a real `docker compose up` run (Docker Desktop was not running).

=============================================================
KEY TECHNICAL RULES — ALWAYS FOLLOW
=============================================================

1. Never summarize code — always write complete files
2. Never skip a file — create every file fully
3. Follow the folder structure exactly as defined above
4. Two themes, light and dark. Light is the default palette (:root); a first
   visit follows the OS preference and the user's choice is remembered.
   Colours come from the semantic tokens, never hard-coded values, and every
   new component must work in both themes. See UI / DESIGN SYSTEM below.
5. JWT stored in localStorage
6. Axios instance reads base URL from VITE_API_URL env variable
7. Axios interceptor attaches Authorization: Bearer token
8. Anthropic model to use: claude-sonnet-5
9. AI response must return strict JSON: { possibleCause, suggestedFix }
10. All forms use React Hook Form
11. All notifications use React Hot Toast
12. All icons from Lucide React only
13. Loading states use skeleton loaders, not spinners
14. Rich text is sanitized on the server before storage and again before render
15. Every mutating route checks permissions (utils/permissions.js / authorize())
16. AI output must report its source; never present a fallback as model output
17. Status workflow, priority and assignment are staff-only; a reporter may only
    close or reopen their own bug (canSetStatus server-side, statusOptionsFor client-side)
18. Dialogs use components/common/Modal.jsx (or ConfirmDialog) — never window.confirm
19. Uploads go through services/storage.service.js (storeUpload / removeStoredFile)

=============================================================
ENVIRONMENT VARIABLES
=============================================================

server/.env:
  PORT=5000
  MONGO_URI=your_mongodb_connection_string
  JWT_SECRET=your_jwt_secret_key
  ANTHROPIC_API_KEY=your_anthropic_api_key
  CLIENT_URL=http://localhost:5173

client/.env:
  VITE_API_URL=http://localhost:5000/api

=============================================================
UI / DESIGN SYSTEM — ALWAYS FOLLOW
=============================================================

Source of truth: client/src/index.css (token values) and
client/tailwind.config.cjs (class names). If this section and those files
disagree, the files win -- fix this section.

How tokens work:
  - Every colour is a CSS variable holding bare "R G B" channels, mapped in
    the Tailwind config to rgb(var(--token) / <alpha-value>), so opacity
    modifiers work (bg-surface/70, border-border/30). No colour literals in
    components.
  - Two themes. :root is light; [data-theme="dark"] overrides it. An inline
    script in client/index.html sets data-theme before first paint (stored
    choice in localStorage "bugsense:theme", else prefers-color-scheme), so
    there is no flash. ThemeContext / useTheme / ThemeToggle switch it.
  - Every component must work in both themes. Check light AND dark.
  - JS that can't use classes (Recharts props, Fabric canvas) reads the same
    variables through utils/theme.js (readToken / readTokens). The only
    colour literals allowed are the annotation ink palette in
    AnnotationCanvas.jsx (drawing content, not interface).

Tokens (Tailwind key -> CSS variable; light / dark):

  Surfaces and structure
    bg          --bg          #FFFFFF / #09090B   inputs
    surface     --surface     #FFFFFF / #0E0E10   cards, columns, menus
    canvas      --canvas      #FAFAFA / #09090B   page background (body)
    border      --border      #E7E7EA / #1C1C20   card and control borders
    hairline    --hairline    #F0F0F2 / #141417   dividers between rows
    track       --track       #F0F0F2 / #19191D   hover fill, selected segment

  Text
    fg          --text        #18181B / #FAFAFA   body text (class: text-fg)
    muted       --muted       #52525B / #A1A1AA   secondary text
    subtle      --subtle      #71717A / #6E6E76   tertiary text, placeholders
    The class is text-fg, not text-text: Tailwind drops `text-text` because
    it collides with the text-<size> utilities.

  Accent and the primary action
    accent      --accent      #0F766E / #2DD4BF   teal: links, focus, active nav icon
    accent-dim  --accent-dim  #CCFBF1 / #1F3A38   accent tint fills (active nav row)
    on-accent   --on-accent   #FFFFFF / #09090B   text on an accent fill
    primary-bg  --primary-bg  #18181B / #FAFAFA   the one primary button
    primary-fg  --primary-fg  #FFFFFF / #09090B
    The shell has one primary action, "New bug" (.btn-primary, near-black in
    light, near-white in dark -- not the accent). Everything else is
    .btn-secondary or a quiet control; a segmented switch (ViewSwitch) marks
    the current option with bg-track, not with btn-primary.

  Danger
    danger      --danger      #B91C1C / #F87171   destructive actions, form errors

  Status
    status-open           --status-open           #1D4ED8 / #60A5FA
    status-progress       --status-progress       #92400E / #FBBF24   TEXT only
    status-progress-mark  --status-progress-mark  #C27803 / #FBBF24   GRAPHICS only
    status-resolved       --status-resolved       #166534 / #4ADE80
    closed has no colour of its own (mark uses bg-subtle).

    In progress has two tokens on purpose. --status-progress is dark enough
    to pass 4.5:1 as text on its own tint, but at that darkness it reads as
    brown, not amber, in a filled square. --status-progress-mark is a true
    amber for shapes (status squares, chart segments), which only need 3:1.
    Use status-progress for text and status-progress-mark for marks; never
    the mark colour for text. (In dark mode both are the same amber.)

  Priority
    priority-critical  --priority-critical  #B91C1C / #F87171
    priority-high      --priority-high      #9A3412 / #FB923C
    priority-medium / priority-low map to --muted: they have no colour.

  Elevation: shadow-card, shadow-popover (--shadow / --shadow-opacity, one
  step, theme-aware, no coloured glow).

DEPRECATED ALIASES -- do not use in new code:
  These keys are still in tailwind.config.cjs and still have call sites
  (counts as of 2026-10-19), so they compile and look right. That is why
  they're easy to copy by mistake. New or rewritten code uses the token on
  the right; replace the alias when you touch a line that has one.

    text-base           -> fg              (~85 uses: text-text-base etc.)
    primary             -> accent          (~75 uses)
    secondary           -> accent          (~20 uses)
    background          -> canvas          (6 uses)
    primary-hover       -> accent          (1 use)

  (surface-elevated, border-light, status-in-progress and status-closed
  were removed from the config on 2026-10-19 -- they no longer compile.)

  Careful: the colour alias text-base is the class `text-text-base`. A bare
  `text-base` is Tailwind's font-size utility, which is fine to use.
  primary-bg / primary-fg are real tokens, not aliases of primary.

How status and priority are shown (shared in components/common/Badge.jsx):
  - Status: StatusMark (small square + label) in tables and Board column
    headers, so a column and a row agree.
  - Priority: PriorityText -- plain text, coloured only for critical and
    high; medium and low are muted. On Board cards (12px) high also gets
    font-medium so its hue registers; critical is always font-medium.
  - Severity appears only on Board cards, and only Blocker, in
    priority-critical colour.
  - SDK occurrence badge (OccurrenceBadge, "×N"): only when occurrences > 1.

Type: IBM Plex Sans for the interface, IBM Plex Mono for data only (counts,
durations, timestamps, identifiers, code), self-hosted via @fontsource.

Component classes (index.css): .glass-card (surface + border + shadow-card,
14px radius -- solid, not translucent), .btn-primary, .btn-secondary,
.btn-danger, .input-field, .label, .skeleton.

Design Rules:
  - Light and dark themes, both first-class
  - Transitions: duration-200 ease-in-out
  - Border radius: .glass-card for cards, rounded-lg for buttons and controls
  - Sidebar: fixed left, collapsible, w-[244px] (lg:w-16 collapsed); it
    holds the account block
  - Skeleton loaders on all loading states
  - Hover states on all interactive elements

=============================================================
AUTO BROWSER CAPTURE (use in BugForm.jsx)
=============================================================

const browserInfo = {
  browser: navigator.userAgent,
  os: navigator.platform,
  screenSize: `${window.screen.width}x${window.screen.height}`,
  userAgent: navigator.userAgent
}

=============================================================
ANTHROPIC AI PROMPT (use in ai.controller.js)
=============================================================

System: "You are a senior debugging expert. Analyze the provided 
error log and return ONLY a valid JSON object with exactly two 
fields: possibleCause (string explaining the likely root cause) 
and suggestedFix (string with actionable fix steps). 
No markdown, no explanation outside the JSON."

User: the pasted error log from the user

=============================================================
SESSION START INSTRUCTION FOR CLAUDE CODE
=============================================================

At the start of every new VS Code session, paste this:

"Read CLAUDE.md for full project context.
I am currently working on: [describe current task]
The file I need help with is: [paste current file content]
Continue from where we left off."