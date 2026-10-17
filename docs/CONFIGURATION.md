# Configuration & Setup

Every environment variable, how to run the stack directly with Node instead
of Docker, and how to deploy it. For the Docker quick start, see the
[README](../README.md).

---

## Environment Variables Reference

### server/.env

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Server port (default: 5000) |
| `MONGO_URI` | no | MongoDB connection string (defaults to `mongodb://localhost:27017/bugsense`) |
| `JWT_SECRET` | in production | Secret key for JWT signing. In production the server refuses to start if it is missing, a published example value, or shorter than 32 characters. Generate one with `openssl rand -hex 32` |
| `ALLOW_INSECURE_JWT_SECRET` | no | `true` lets production start with a weak `JWT_SECRET` (with a warning banner). Only the Docker local demo sets this |
| `NODE_ENV` | no | Set to `production` to enforce the JWT check, production rate limits and the developer sign-up default |
| `CLIENT_URL` | no | Dashboard origin(s), comma-separated (e.g. production plus a Vercel preview). All pass CORS and the socket handshake; the first is used for links in alerts and GitHub issues |
| `TRUST_PROXY` | no | Express `trust proxy`: number of proxy hops (default `1`), `true`/`false`, or addresses. Use `0` when the API is reached directly, otherwise clients can spoof their IP past the rate limits |
| `ANTHROPIC_API_KEY` | no | Anthropic API key. Without it, AI features fall back to clearly labelled heuristics and templates |
| `REPORT_AI_HOURLY_BUDGET` | no | Max background analyses of new manual reports per hour (default: 100) |
| `ALLOW_DEVELOPER_SIGNUP` | no | `true`/`false`: may visitors sign up as developers? Unset = allowed in development, refused in production (admins promote people on the Team page) |
| `CLOUDINARY_URL` | no | `cloudinary://<key>:<secret>@<cloud>`. When set, screenshots, annotations and avatars are stored in Cloudinary instead of local disk (needed on hosts with ephemeral disks, like Render and Railway) |
| `CLOUDINARY_FOLDER` | no | Cloudinary folder for uploads (default: `bugsense`). Only files inside it are ever deleted |
| `UPLOADS_DIR` | no | Local upload directory (default: `server/uploads`) |
| `GITHUB_TOKEN` | no | Server token for GitHub Issue export. Users can always supply their own token per request instead |
| `GITHUB_ALLOWED_REPOS` | with `GITHUB_TOKEN` | Comma-separated `owner/repo` list the server token may file issues in; offered as one-click choices in the export dialog |
| `DISCORD_WEBHOOK_URL` | no | Workspace Discord channel for alerts (critical/blocker incidents and regressions) |
| `SLACK_WEBHOOK_URL` | no | Workspace Slack channel for the same alerts |
| `TELEMETRY_INGEST_KEY` | no | Key the SDK must send (`data-key`). It ships in page HTML, so it is not a secret; unset = open ingestion, fine for local demos |
| `TELEMETRY_ALLOWED_ORIGINS` | no | Comma-separated origins allowed to post telemetry (default: any). This is what actually limits who can report; include the dashboard's own origin, since it reports its own crashes |
| `TELEMETRY_AI_HOURLY_BUDGET` | no | Max background AI analyses started by public telemetry per hour (default: 20) |

### client/.env

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL — absolute (`https://api.example.com/api`) or relative (`/api`). Sockets and uploads use the same origin |
| `VITE_TELEMETRY_INGEST_KEY` | Same value as the server's `TELEMETRY_INGEST_KEY`, if set, so the SDK Playground and the dashboard's own crash reports are accepted |
| `VITE_SELF_REPORT` | `false` stops the dashboard reporting its own crashes (on by default in production builds); `true` enables it in development |

---

## Docker: the details

Run the full stack (MongoDB, Express API, and Nginx React Client) with a single command:

```bash
cp .env.example .env    # optional: add ANTHROPIC_API_KEY and a real JWT_SECRET
docker compose up --build
```

- App (and API under `/api`): [http://localhost:8080](http://localhost:8080)

The client is published on 8080 rather than Vite's 5173, so it can run alongside
a Vite dev server.

The client image is built with `VITE_API_URL=/api`, so all browser traffic goes
through nginx, which proxies `/api`, `/uploads`, `/sdk` and `/socket.io`
to the server container. Neither the server nor MongoDB is published on a host
port, so a MongoDB already installed on your machine does not get in the way.
All three containers have healthchecks: the API waits for MongoDB to be healthy
and the client waits for the API, so `docker compose ps` shows all three as
`healthy` once the app is usable. The API runs as the unprivileged `node` user.

To inspect the database with MongoDB Compass or `mongosh`, publish it on a spare
loopback port with a `docker-compose.override.yml` next to `docker-compose.yml`
(compose picks it up automatically, and it is gitignored):

```yaml
services:
  mongodb:
    ports:
      - "127.0.0.1:27018:27017"   # loopback only: the database has no auth
```

Then connect to `mongodb://localhost:27018/bugsense`. Port 27018 avoids a clash
with a local MongoDB on 27017.

The server runs with `NODE_ENV=production`. With no `JWT_SECRET` in `.env`, it
falls back to a public demo secret and starts only because compose sets
`ALLOW_INSECURE_JWT_SECRET=true` — it prints a warning banner saying so. Before
exposing the stack anywhere, set `JWT_SECRET` (`openssl rand -hex 32`) and
`ALLOW_INSECURE_JWT_SECRET=false` in `.env`.

---

An alternative to the Docker quick start in the [README](../README.md): run
the API and the Vite dev server directly against a MongoDB you provide.

## 1. Run the API with Node.js

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

## 2. Frontend setup

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

## 3. Seed demo data (optional)

```bash
cd server
npm run seed
```

Creates three demo accounts, four sample bugs and one comment. Seeding **deletes all data**, so it
refuses to run on a database that already has users; use `npm run seed:reset` to
wipe and reseed deliberately.

---

## 4. Deploying (API on Render/Railway, client on Vercel)

**API** — deploy `server/` (the Dockerfile works as-is, or `npm start`) and set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas connection string |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CLIENT_URL` | your Vercel URL(s), comma-separated |
| `CLOUDINARY_URL` | needed: these hosts wipe local disk on every deploy |
| `TRUST_PROXY` | `1` (one platform proxy in front) |
| `ALLOW_DEVELOPER_SIGNUP` | `true` only if visitors should be able to try staff features |

Optional: `ANTHROPIC_API_KEY`, `TELEMETRY_ALLOWED_ORIGINS`, `GITHUB_TOKEN` with
`GITHUB_ALLOWED_REPOS`, and alert webhooks. Seed the demo accounts once with
`npm run seed` from the service's shell.

**Client** — import `client/` into Vercel (framework: Vite) and set
`VITE_API_URL=https://<your-api-host>/api` (plus `VITE_TELEMETRY_INGEST_KEY` if you
set an ingest key). `client/vercel.json` already rewrites deep links such as
`/bugs/:id` to the SPA and caches hashed assets.
