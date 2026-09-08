# BugSense — Smart Bug Reporting & AI Debug Assistant

[![CI Build](https://github.com/krishnendu-9/bugsense/actions/workflows/ci.yml/badge.svg)](https://github.com/krishnendu-9/bugsense/actions)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v3-38B2AC?logo=tailwind-css&logoColor=white)

> A production-grade, fault-tolerant MERN stack application that transforms chaotic bug reports into structured, real-time, AI-powered debug sessions.

---

## Why I Built This

Bug reports are the worst part of software development — not because bugs exist, but because reports are incomplete. Developers waste hours asking "what browser?", "what error?", "can you reproduce it?". BugSense eliminates that friction: it auto-captures browser context, guides reporters through structured reproduction steps, and uses Claude AI to instantly diagnose error logs and suggest fixes.

---

## Features

- **One-Click CSV & JSON Data Export** — Export filtered incident reports directly to standard spreadsheet CSV or JSON format for audits and sprint reviews
- **In-App Webhook Settings & Live Test Ping** — Configure Discord and Slack webhooks with alert preference toggles and 1-click test ping verification
- **Live System Vitals & Health Metrics (`/metrics`)** — Real-time Node.js process heap, MongoDB connectivity status, uptime counters, and telemetry deduplication efficiency analytics
- **Enterprise Compliance Audit Trail (`/audit`)** — SOC2-compliant activity ledger tracking all user mutations, status shifts, telemetry ingestions, and external tool syncs
- **Embeddable Client SDK (`bugsense.js`)** — Zero-dependency agent any web app can install to auto-capture crashes and inject an in-app bug report pill
- **Flight Recorder Breadcrumbs** — Automatically records the user's last 15 actions (DOM clicks, page navigation, fetch API calls, and console logs) leading up to an incident
- **Error Fingerprinting & Deduplication** — Deterministic SHA-256 stack trace hashing automatically groups recurring errors, increments frequency counters (e.g. `42x occurrences`), and flags regressions
- **AI Pull Request & Patch Generator** — Claude generates production-ready unified Git diffs with syntax highlighting and copyable `git apply` commands
- **Interactive SDK Sandbox (`/sdk-demo`)** — Built-in simulated customer storefront allowing developers to inject real-world browser exceptions, 500 API errors, and async rejections to demonstrate live telemetry ingestion
- **AI Incident Post-Mortem Generator** — Formal engineering post-mortem synthesis in GitHub-flavored Markdown covering Executive Summary, Breadcrumb Timeline, RCA, and Action Items with 1-click `.md` download
- **Real-Time Kanban Workflow Board (`/board`)** — Linear-style collaborative issue board featuring quick stage shifts (`Open`, `In Progress`, `Resolved`, `Closed`) synchronized via Socket.io
- **GitHub Issues 1-Click Export** — Convert any bug report into an official GitHub Issue via GitHub REST API with stack traces and AI diagnostics attached
- **Discord & Slack Webhooks** — Real-time automated incident alert dispatching to developer communication channels
- **Structured Bug Reporting** — Rich text descriptions, numbered reproduction steps, auto-captured browser/OS metadata
- **Screenshot Uploads & Fabric.js Markup** — Drag-and-drop screenshot upload with canvas markup (pencil, arrows, rectangles, circles)
- **Real-Time Collaboration** — Socket.io live updates for status changes, new alerts, and live threaded comments
- **AI-Powered Diagnostics** — Claude diagnoses root causes and suggests actionable fix steps with offline heuristic resilience
- **Profile & Settings** — Manage display names, secure bcrypt password updates, and avatar uploads
- **Enterprise Security** — Multi-tier rate limiting (global, auth, AI tiers), Helmet headers, and role-based access control
- **Developer Dashboard** — Recharts metrics, priority distributions, and recent incident streams
- **Dark Theme Glassmorphism** — Sleek modern aesthetic built entirely in Tailwind CSS

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18 (Vite) |
| Styling | Tailwind CSS v3 |
| Routing | React Router DOM v6 |
| HTTP Client | Axios |
| Forms | React Hook Form |
| Rich Text | React Quill |
| Canvas Annotations | Fabric.js |
| Icons | Lucide React |
| Charts | Recharts |
| Notifications | React Hot Toast |
| Date Formatting | date-fns |
| Backend | Node.js + Express.js |
| Database | MongoDB + Mongoose |
| Authentication | JWT + bcryptjs |
| File Uploads | Multer |
| Validation | express-validator |
| Real-time | Socket.io (server + client) |
| Security | Helmet, CORS, express-rate-limit |
| AI | Anthropic SDK (Claude Sonnet) |
| Logging | Morgan |
| Linting | ESLint 9 (flat config, both packages) |
| Containers | Docker + Docker Compose + nginx |
| CI | GitHub Actions (lint, build, image builds) |

---

## Project Structure

```
bugsense/
├── .github/workflows/        # CI: lint, build, docker image builds
├── docker-compose.yml        # Full stack: MongoDB + API + nginx client
├── client/                   # React frontend (Vite)
│   ├── eslint.config.js
│   ├── nginx.conf            # Proxies /api, /uploads, /sdk, /socket.io
│   ├── Dockerfile
│   └── src/
│       ├── api/              # Axios instance with auth interceptor
│       ├── components/
│       │   ├── ai/           # ErrorInsights, GitPatchModal, PostMortemModal
│       │   ├── bugs/         # BugCard, BugForm, BugFilters, StepsReproducer,
│       │   │                 # AnnotationCanvas, BreadcrumbTimeline
│       │   ├── common/       # Navbar, Sidebar, Loader, Badge, ProtectedRoute,
│       │   │                 # ErrorBoundary
│       │   └── dashboard/    # StatsCard, BugChart, RecentBugs
│       ├── context/          # AuthContext, SocketContext
│       ├── hooks/            # useAuth, useBugs, useAI, useSocket
│       ├── pages/            # auth/, bugs/ (list, detail, report, kanban),
│       │                     # dashboard/, ai/, audit/, metrics/,
│       │                     # playground/, profile/
│       └── utils/            # constants, helpers
└── server/                   # Express backend
    ├── eslint.config.js
    ├── Dockerfile
    ├── config/               # MongoDB, Socket.io
    ├── controllers/          # auth, bug, comment, ai, user, telemetry, audit
    ├── middleware/           # auth, upload, rateLimit, error
    ├── models/               # User, Bug, Comment, AuditLog
    ├── public/sdk/           # bugsense.js — the embeddable client SDK
    ├── routes/               # auth, bugs, comments, ai, users, telemetry, audit
    ├── scripts/              # seed.js
    ├── services/             # ai, token, audit, webhook
    ├── utils/                # fingerprint, backward-compat proxies
    └── uploads/              # Multer file storage
```

---

## Setup & Installation

### Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)
- Anthropic API key

### 1. Clone the repository

```bash
git clone https://github.com/krishnendu-9/bugsense.git
cd bugsense
```

### 2a. Run with Docker (fastest)

Run the full stack (MongoDB, Express API, and Nginx React Client) with a single command:

```bash
cp .env.example .env    # optional: add ANTHROPIC_API_KEY and a real JWT_SECRET
docker compose up --build
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:5000](http://localhost:5000)

The client image is built with `VITE_API_URL=/api`, so browser traffic goes
through nginx, which proxies `/api`, `/uploads`, `/sdk` and `/socket.io`
to the server container.

---

### 2b. Or run locally with Node.js

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/bugsense
JWT_SECRET=your_super_secret_jwt_key_here
ANTHROPIC_API_KEY=sk-ant-...
CLIENT_URL=http://localhost:5173
```

Start the backend:

```bash
npm run dev
```

### 3. Frontend setup

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

### 4. Seed demo data (optional)

```bash
cd server
npm run seed
```

Creates three demo accounts and four sample bugs.

### 5. Lint

Both packages are linted with ESLint (flat config); CI runs these on every push.

```bash
cd server && npm run lint
cd client && npm run lint
```

### 6. Open in browser

Navigate to [http://localhost:5173](http://localhost:5173)

---

## API Endpoints

### Authentication `/api/auth`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Register new user | — |
| POST | `/login` | Login, returns JWT | — |
| GET | `/me` | Get current user | Bearer |

### Bugs `/api/bugs`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List bugs (filter: `status`, `priority`, `assignedTo`, `reporter`, `project`, `search`, `page`, `limit`) | Bearer |
| POST | `/` | Create bug | Bearer |
| GET | `/stats` | Dashboard statistics | Bearer |
| GET | `/:id` | Single bug with comments | Bearer |
| PUT | `/:id` | Update bug (whitelisted fields only) | Bearer |
| DELETE | `/:id` | Delete bug | Admin only |
| POST | `/:id/screenshot` | Upload screenshot | Bearer |
| POST | `/:id/github` | Export bug as a GitHub Issue | Bearer |

### Comments `/api/comments`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Add comment | Bearer |
| GET | `/bug/:bugId` | Get comments for a bug | Bearer |
| DELETE | `/:id` | Delete comment | Author/Admin |

### AI `/api/ai`

| Method | Endpoint | Body | Returns | Auth |
|--------|----------|------|---------|------|
| POST | `/analyze` | `{ errorLog, bugContext?, bugId? }` | `{ possibleCause, suggestedFix }` | Bearer |
| POST | `/generate-patch` | `{ bugId?, errorLog?, bugDescription?, steps? }` | `{ diff, explanation, generatedAt }` | Bearer |
| POST | `/post-mortem` | `{ bugId }` | `{ markdown, generatedAt }` | Bearer |

All three fall back to deterministic heuristics when `ANTHROPIC_API_KEY` is unset, so the app stays fully demoable offline.

### Users `/api/users`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/profile` | Get current user profile | Bearer |
| PUT | `/profile` | Update name / change password | Bearer |
| POST | `/avatar` | Upload profile avatar | Bearer |
| PUT | `/webhooks` | Save Discord/Slack webhook settings | Bearer |
| POST | `/webhooks/test` | Send a test alert to a webhook | Bearer |

### Telemetry `/api/telemetry`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/report` | SDK crash/feedback ingestion with fingerprint deduplication | Public (rate limited) |

### Audit `/api/audit`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Paginated activity ledger (filter: `entityType`, `action`) | Bearer |

### Health `/api/health`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Liveness probe | — |
| GET | `/metrics` | Uptime, heap, Mongo status, dedup efficiency | — |

---

## Embedding the Client SDK

`bugsense.js` is a zero-dependency agent any web app can drop in. It records the
last 15 user actions, auto-reports uncaught errors and unhandled rejections, and
injects a floating "Report Bug" widget.

```html
<script
  src="http://localhost:5000/sdk/bugsense.js"
  data-api-url="http://localhost:5000"
  data-project="My Client App"
></script>
```

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-api-url` | `http://localhost:5000` | Base URL of the BugSense API |
| `data-project` | `Production Web App` | Project name recorded on every incident |
| `data-widget` | `true` | Set to `"false"` to suppress the floating report pill |

Manual capture:

```js
window.BugSense.captureError(err, 'Checkout failed');
window.BugSense.captureMessage('Coupon banner clicked', 'low');
window.BugSense.addBreadcrumb('click', 'User opened the cart drawer');
```

The SDK caps itself at 20 reports per page session and suppresses repeats of the
same error within 10 seconds, so a crash loop in the host page cannot flood the
ingestion endpoint. Try it live at `/sdk-demo`.

---

## Screenshots

> _Screenshots will be added after first deployment._

| Dashboard | Bug List | Bug Detail |
|-----------|----------|------------|
| _coming soon_ | _coming soon_ | _coming soon_ |

| Report Bug | AI Analyzer | Annotation Canvas |
|------------|-------------|-------------------|
| _coming soon_ | _coming soon_ | _coming soon_ |

---

## Live Demo

> _Live demo link will be added after deployment to Railway/Render._

**Demo credentials:**
- Admin: `admin@bugsense.dev` / `password123`
- Developer: `dev@bugsense.dev` / `password123`

---

## Environment Variables Reference

### server/.env

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Server port (default: 5000) |
| `MONGO_URI` | no | MongoDB connection string (defaults to `mongodb://localhost:27017/bugsense`) |
| `JWT_SECRET` | in production | Secret key for JWT signing. The server refuses to start without it when `NODE_ENV=production` |
| `ANTHROPIC_API_KEY` | no | Anthropic API key. Without it, AI features fall back to heuristics |
| `CLIENT_URL` | no | Frontend URL, used for CORS and links in webhook alerts |
| `NODE_ENV` | no | Set to `production` to enforce the JWT check and production rate limits |
| `DISCORD_WEBHOOK_URL` | no | Global Discord webhook for incident alerts |
| `SLACK_WEBHOOK_URL` | no | Global Slack webhook for incident alerts |
| `GITHUB_TOKEN` | no | Default token for GitHub Issue export (can also be supplied per request) |

### client/.env

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL |

---

## Design System

Built on a consistent dark theme with glass morphism cards:

- **Primary:** `#6366F1` (Indigo)
- **Secondary:** `#8B5CF6` (Purple)
- **Background:** `#090D16` (Near-black navy)
- **Surface:** `#111827` (Dark slate)
- **Cards:** `bg-white/5 backdrop-blur border border-white/10`

---

## License

MIT
