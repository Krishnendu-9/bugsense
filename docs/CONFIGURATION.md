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
| `TRUST_PROXY` | **verify before deploying** | Express `trust proxy`: number of proxy hops (default `1`), `false`, or proxy addresses. Must match what is really in front of the server: too high, or `1` while Node is reachable directly, lets clients spoof their IP past every rate limit. See [Before the first deploy](#before-the-first-deploy-verify-trust_proxy) |
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

### Before the first deploy: verify TRUST_PROXY

**This is a required check, not an optional setting.** Do it on the first deploy
and again whenever anything changes in front of the API: a new host, a CDN, a
second load balancer, a published port.

Every rate limit counts requests per client IP: sign-in (50 per 15 minutes), AI
analysis, SDK ingestion and the global API limit. Failed sign-ins are recorded in
the audit log under the same address. Express takes that address from the
`X-Forwarded-For` header, trusting as many entries, counted from the right, as
`TRUST_PROXY` says. The header is written by proxies, but a client can send one
too, so the setting must match what is really in front of the server.

**When it is dangerous.** `TRUST_PROXY` is larger than the number of proxies a
request actually passes through. The usual way this happens is the default `1`
while the Node process can also be reached directly: a VPS with port 5000 open,
`docker run -p 5000:5000`, or a compose override that publishes the server's
port. A client then writes any address it likes into `X-Forwarded-For` and the
server believes it. Every request can claim a new address and get a fresh
rate-limit bucket. Password guessing on sign-in becomes unlimited, any signed-in
account can make unlimited on-demand AI calls (analyze, patch, post-mortem), and
the public SDK endpoint accepts unlimited reports. The audit log records invented
addresses. The hourly budgets for *background* AI analysis are global, not
per-IP, so those still hold. Nothing fails and nothing is logged as an error; the
per-IP limits simply stop applying.

The opposite mistake is not a spoofing risk but still breaks the limits: too few
hops (`0` behind a proxy, or `1` behind a CDN *and* a platform load balancer)
puts every user behind the same proxy into one bucket, so 50 failed sign-ins from
anyone lock everyone out of signing in for 15 minutes.

**How to verify**, against the deployed API, from your own machine:

1. *The proxy is the only way in.* On a platform such as Render or Railway the
   container port is not publicly routable; only the platform's hostname is. On a
   host you run yourself, a direct request from outside must fail to connect:

   ```bash
   curl -m 5 http://<server-public-ip>:5000/api/health   # must time out or be refused
   ```

2. *Spoofed addresses are ignored.* Send three requests that each claim a
   different address, and read the rate-limit header the API returns:

   ```bash
   for ip in 203.0.113.1 203.0.113.2 203.0.113.3; do
     curl -s -o /dev/null -D - -H "X-Forwarded-For: $ip" \
       https://<api-host>/api/health | grep -i '^ratelimit:'
   done
   ```

   - **Safe:** `remaining` goes down on each request (for example 1999, 1998,
     1997). The server is counting your real address and ignoring the header.
   - **Spoofable, do not ship:** `remaining` is the same every time. Each made-up
     address got its own bucket. The platform's access log will also show
     `203.0.113.x` as the client address.

3. *Users are not sharing one bucket.* Send one more request from a different
   network (a phone hotspot, say). Its `remaining` should be near the limit, not
   one less than your last result from step 2. If it carries on from your count,
   all users share a bucket: the hop count is too low.

**What to set**:

| What is in front of the Node process | `TRUST_PROXY` |
|---|---|
| Nothing: clients connect to Node directly | `0` |
| Exactly one proxy, and it is the only way in (the bundled `docker compose` nginx; a single platform load balancer) | `1` |
| N proxies, each appending to `X-Forwarded-For` (for example a CDN in front of the platform's load balancer) | `N` |
| Fixed, known proxy addresses | the addresses or subnets, comma-separated (`loopback, 10.0.0.0/8`). Write IPv4 ranges in plain IPv4 notation, not as `::ffff:` IPv6 |

Never use `true`: it trusts every hop, so it is always spoofable.

If step 2 fails while a proxy is supposed to be in front, close the direct
route (firewall the port, stop publishing it) rather than lowering
`TRUST_PROXY` to `0`: with `0` behind a proxy, every user shares one bucket.
After any change, run steps 2 and 3 again.

### Environment

**API** — deploy `server/` (the Dockerfile works as-is, or `npm start`) and set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas connection string |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CLIENT_URL` | your Vercel URL(s), comma-separated |
| `CLOUDINARY_URL` | needed: these hosts wipe local disk on every deploy |
| `TRUST_PROXY` | the measured hop count; **verify it first** ([above](#before-the-first-deploy-verify-trust_proxy)) |
| `ALLOW_DEVELOPER_SIGNUP` | `true` only if visitors should be able to try staff features |

Optional: `ANTHROPIC_API_KEY`, `TELEMETRY_ALLOWED_ORIGINS`, `GITHUB_TOKEN` with
`GITHUB_ALLOWED_REPOS`, and alert webhooks. Seed the demo accounts once with
`npm run seed` from the service's shell.

**Client** — import `client/` into Vercel (framework: Vite) and set
`VITE_API_URL=https://<your-api-host>/api` (plus `VITE_TELEMETRY_INGEST_KEY` if you
set an ingest key). `client/vercel.json` already rewrites deep links such as
`/bugs/:id` to the SPA and caches hashed assets.
