# BugSense — Project Context for Claude Code

BugSense is a full-stack MERN bug tracker with an embeddable crash-reporting SDK
and AI-assisted debugging. It is a portfolio/CV project: code quality, folder
structure and UI must be production-grade at all times.

## Stack
Client: React 18 (Vite), Tailwind CSS 3, React Router 7, Axios, React Hook Form,
react-quill-new, Fabric.js, Lucide React, Recharts, React Hot Toast, date-fns.
Server: Node 22.13+, Express, MongoDB + Mongoose, JWT (jsonwebtoken + bcryptjs),
Multer, express-validator, helmet, Socket.io, Anthropic SDK.

## Commands
  cd server && npm run lint && npm test     node:test + Supertest, in-memory MongoDB
  cd client && npm run lint && npm test     Vitest + React Testing Library
  docker compose up --build                 full stack on http://localhost:8080
  docker compose exec server npm run seed   demo accounts (demo setups only)
ESLint stays at 0 warnings in both packages.

## Key technical rules — always follow
1. Never summarize code — always write complete files
2. Never skip a file — create every file fully
3. Follow the folder structure in docs/claude/folder-structure.md, and add new
   files to it
4. Two themes, light and dark. Light is the default palette (:root); a first
   visit follows the OS preference and the user's choice is remembered.
   Colours come from the semantic tokens, never hard-coded values, and every
   new component must work in both themes.
5. JWT stored in localStorage
6. Axios instance reads base URL from VITE_API_URL env variable
7. Axios interceptor attaches Authorization: Bearer token
8. Anthropic model to use: claude-sonnet-5-5 (via requestText() in ai.service.js:
   room for thinking in max_tokens, an explicit effort, the server-side refusal
   fallback, and a stop_reason check before any reply is used)
9. AI response must return strict JSON: { possibleCause, suggestedFix }
10. All forms use React Hook Form
11. All notifications use React Hot Toast
12. All icons from Lucide React only
13. Loading states use skeleton loaders, not spinners
14. Rich text is sanitized on the server before storage and again before render
15. Every mutating route checks permissions (utils/permissions.js / authorize())
16. AI output must report its source; never present a fallback as model output
17. Status workflow, priority and assignment are staff-only; a reporter may only
    close or reopen their own bug (canSetStatus server-side, statusOptionsFor client-side).
    This includes filing: a reporter's new bug starts at Medium priority, and only a
    level staff set (on filing or by escalating) may page the alert channels
18. Dialogs use components/common/Modal.jsx (or ConfirmDialog) — never window.confirm
19. Uploads go through services/storage.service.js (storeUpload / removeStoredFile),
    behind upload.single() + verifyImageContent on the route
20. AI results saved on a bug are computed from that bug's stored data, never from
    request text (ai.controller.js)
21. Form errors and destructive controls use the danger token, never priority-high

## UI essentials (full reference: docs/claude/design-system.md)
- Colours only from tokens: bg, surface, canvas, border, hairline, track, fg,
  muted, subtle, accent, danger, status-*, priority-*. The text class is
  text-fg, not text-text.
- Check every component in light AND dark.
- One primary action ("New bug", .btn-primary); everything else is
  .btn-secondary or a quiet control.
- status-progress is for text, status-progress-mark for graphics only.
- Cards use .glass-card; buttons and controls rounded-lg; transitions
  duration-200 ease-in-out; hover states on every interactive element.
- IBM Plex Sans for the interface, Plex Mono for data only.

## Where to look
- docs/claude/folder-structure.md — every file and what it holds
- docs/claude/design-system.md    — token values, deprecated aliases, status/priority display
- docs/claude/history.md          — build phases, session logs 1–7, owner decisions
- docs/API.md, docs/ARCHITECTURE.md, docs/CONFIGURATION.md, docs/SDK.md
- Before any deploy: the TRUST_PROXY check in docs/CONFIGURATION.md
