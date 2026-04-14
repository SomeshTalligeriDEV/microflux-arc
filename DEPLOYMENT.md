# MicroFlux — deployment guide

This document matches the production readiness checklist: env, database migrations, API hosting, CORS, frontend build, and verification.

## Readiness

Suitable for **staging / public demo** on Algorand TestNet. For unattended production, also plan persistent Telegram state (see roadmap) and rate limits on public routes.

## 1. Environment (server)

Copy [`server/.env.example`](server/.env.example) to `server/.env` and set at minimum:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (e.g. Neon) connection string |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `GROQ_API_KEY` | AI intent engine |
| `CORS_ORIGINS` | Comma-separated browser origins, e.g. `https://your-app.vercel.app` |
| `MICROFLUX_TRIGGER_SECRET` | Random secret for `/api/triggers/*` in public deployments |
| `WEB_APP_URL` | Public frontend URL (Telegram approval links) |

Optional: `ALGORAND_SENDER_MNEMONIC` (server-side workflow runner payments), Google Sheets vars, `SARVAM_API_KEY`, `MICROFLUX_TIMER_TICK_MS`.

## 2. Database migrations

From the **`server/`** directory, with `DATABASE_URL` set:

```bash
cd server
npm ci
npm run migrate:deploy
```

On platforms with a **release phase** (e.g. Render), use the same command as the release command before `npm start`.

`postinstall` runs `prisma generate` so the client matches the schema after `npm ci`.

## 3. API deployment

**Option A — Node on a VM / PaaS**

```bash
cd server
npm ci
npm run build
NODE_ENV=production npm start
```

Listen on `PORT` (default `8080`). Terminate TLS at the reverse proxy or platform edge.

**Option B — Docker**

From repo root (build context must be `server/`):

```bash
docker build -t microflux-api -f server/Dockerfile server
docker run --env-file server/.env -p 8080:8080 microflux-api
```

Run migrations against production `DATABASE_URL` before or as part of first boot (recommended: separate release step).

The Dockerfile includes a **health check** against `GET /health`.

### Render (or similar PaaS)

[Render](https://render.com), [Fly.io](https://fly.io), and [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform) are common choices for a **long-lived Node** process (Telegram long polling). Pick based on pricing, regions, and whether the tier allows always-on processes.

**Render — typical setup**

1. New **Web Service**, connect the repo.
2. **Root directory:** `server` (monorepo).
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `npm start`
5. **Pre-deploy command** (if shown in the dashboard): `npm run migrate:deploy` — runs migrations before each deploy. If your plan has no pre-deploy step, run `migrate:deploy` once against production `DATABASE_URL` from your machine, or add a guarded one-liner only after you understand duplicate-migrate risks.
6. **Environment:** same variables as [§1](#1-environment-server). Set `PORT` only if the platform requires it (Render injects `PORT`).
7. **Health check path:** `/health` (JSON) or `/ping` (plain text `ok`, minimal bytes).

**Keep the service reachable (free / “sleepy” tiers)**

Platforms may **spin down** idle web services. **HTTP requests from outside** wake the process again. A timer *inside* your app does **not** run while the instance is stopped, so use an **external** pinger:

- [UptimeRobot](https://uptimerobot.com), [cron-job.org](https://cron-job.org), or another monitor: `GET` every **5–15 minutes** to `https://<your-service>.onrender.com/ping` (or `/health`).
- Optional: use the repo workflow [`.github/workflows/render-keepalive.yml`](.github/workflows/render-keepalive.yml) and add a GitHub secret `RENDER_HEALTH_URL` with that full URL (e.g. `https://your-service.onrender.com/ping`). Runs on a schedule plus manual dispatch.

**Caveat:** Waking the dyno reduces cold starts but does **not** guarantee Telegram long polling is as stable as on an always-on plan; for production traffic, prefer a non-sleeping tier or move Telegram to **webhooks** behind a stable URL.

## 4. Frontend (Vite)

Copy [`projects/microflux-frontend/.env.example`](projects/microflux-frontend/.env.example) and set:

- `VITE_API_BASE_URL` — public API base ending in `/api`
- `VITE_ALGOD_*` — TestNet algonode (see example)
- `VITE_APP_ID` — deployed WorkflowExecutor app id (TestNet)

Build:

```bash
cd projects/microflux-frontend
npm ci
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, Cloudflare Pages, or static hosting.

**Important:** Rebuild the frontend whenever `VITE_*` changes (values are baked in at build time).

## 5. CORS

The API allows:

- `http://localhost:5173`
- `https://microflux-frontend.vercel.app`
- Any extra origins in `CORS_ORIGINS`

After deploying the app to a new origin, add it to `CORS_ORIGINS` and redeploy the API.

## 6. Verification

With `API_BASE_URL` set to your API root including `/api` parent for health — health is at **server root**:

```bash
export API_HOST=https://your-api-host.example.com
curl -sf "$API_HOST/health"
```

Or use the helper script from repo root (defaults to `http://localhost:8080`):

```bash
API_HOST=https://your-api-host.example.com bash scripts/verify-deployment.sh
```

Manual smoke tests:

| Step | Check |
|------|--------|
| Health | `GET /health` returns JSON; `GET /ping` returns plain `ok` |
| DB | Save a workflow in the UI |
| Telegram | `/link` then a command |
| Triggers | `POST /api/triggers/webhook` with `{ "path": "..." }` and `X-Microflux-Trigger-Secret` if set |
| Contract | `execute()` after enabling public execution if non-creator wallets sign |

## 7. Operational notes

- **Single Telegram poller:** Only one process should call Telegram `getUpdates` per bot token (409 conflict if duplicated).
- **Secrets:** Never commit `.env`; use host secret managers in production.
- **Roadmap gaps:** In-memory Telegram chat state resets on restart; add DB persistence for stricter SLAs.
