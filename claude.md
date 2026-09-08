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
├── README.md
├── client/
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/
│       │   └── axios.js
│       ├── assets/
│       ├── components/
│       │   ├── common/
│       │   │   ├── Navbar.jsx
│       │   │   ├── Sidebar.jsx
│       │   │   ├── Loader.jsx
│       │   │   ├── ProtectedRoute.jsx
│       │   │   └── Badge.jsx
│       │   ├── bugs/
│       │   │   ├── BugCard.jsx
│       │   │   ├── BugForm.jsx
│       │   │   ├── BugFilters.jsx
│       │   │   ├── StepsReproducer.jsx
│       │   │   └── AnnotationCanvas.jsx
│       │   ├── dashboard/
│       │   │   ├── StatsCard.jsx
│       │   │   ├── BugChart.jsx
│       │   │   └── RecentBugs.jsx
│       │   └── ai/
│       │       └── ErrorInsights.jsx
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useBugs.js
│       │   └── useAI.js
│       ├── pages/
│       │   ├── auth/
│       │   │   ├── Login.jsx
│       │   │   └── Register.jsx
│       │   ├── bugs/
│       │   │   ├── BugList.jsx
│       │   │   ├── BugDetail.jsx
│       │   │   └── ReportBug.jsx
│       │   ├── dashboard/
│       │   │   └── Dashboard.jsx
│       │   └── ai/
│       │       └── AIAnalyzer.jsx
│       └── utils/
│           ├── constants.js
│           └── helpers.js
│
└── server/
    ├── server.js
    ├── package.json
    ├── .env
    ├── .env.example
    ├── uploads/
    ├── config/
    │   └── db.js
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── bug.controller.js
    │   ├── comment.controller.js
    │   └── ai.controller.js
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── upload.middleware.js
    │   └── error.middleware.js
    ├── models/
    │   ├── User.model.js
    │   ├── Bug.model.js
    │   └── Comment.model.js
    ├── routes/
    │   ├── auth.routes.js
    │   ├── bug.routes.js
    │   ├── comment.routes.js
    │   └── ai.routes.js
    └── utils/
        ├── generateToken.js
        └── anthropic.js

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
  - /api/ai/analyze route (Anthropic API, claude-sonnet-4-20250514) ✓
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
  ✓ server/middleware/rateLimit.middleware.js — globalLimiter (100/15min), authLimiter (20/15min), aiLimiter (10/15min)
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
  index.html, vite.config.js, tailwind.config.js, package.json
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
KEY TECHNICAL RULES — ALWAYS FOLLOW
=============================================================

1. Never summarize code — always write complete files
2. Never skip a file — create every file fully
3. Follow the folder structure exactly as defined above
4. Dark theme throughout — no light mode components
5. JWT stored in localStorage
6. Axios instance reads base URL from VITE_API_URL env variable
7. Axios interceptor attaches Authorization: Bearer token
8. Anthropic model to use: claude-sonnet-5
9. AI response must return strict JSON: { possibleCause, suggestedFix }
10. All forms use React Hook Form
11. All notifications use React Hot Toast
12. All icons from Lucide React only
13. Loading states use skeleton loaders, not spinners

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

Color Palette:
  Primary:    #6366F1  (Indigo)
  Secondary:  #8B5CF6  (Purple)
  Background: #0F172A  (Dark navy)
  Surface:    #1E293B  (Dark slate)
  Border:     #334155
  Text:       #F1F5F9
  Muted:      #94A3B8

Priority Colors:
  low:      #22C55E (green)
  medium:   #F59E0B (amber)
  high:     #EF4444 (red)
  critical: #7C3AED (purple)

Status Colors:
  open:        #3B82F6 (blue)
  in-progress: #F59E0B (amber)
  resolved:    #22C55E (green)
  closed:      #6B7280 (gray)

Design Rules:
  - Dark theme only
  - Glass morphism cards: bg-white/5 backdrop-blur border border-white/10
  - Transitions: duration-200 ease-in-out
  - Border radius: rounded-xl for cards, rounded-lg for buttons
  - Sidebar: fixed left, collapsible, w-64
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