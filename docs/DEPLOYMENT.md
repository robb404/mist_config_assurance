# Production Deployment (Docker)

The app ships with a two-container Docker setup — `frontend` (Next.js standalone) and `backend` (FastAPI). Supabase hosts the database; Clerk hosts auth; Resend hosts email. This doc covers deploying the two containers.

## Prerequisites

- A host with Docker + Docker Compose (Docker Desktop on Mac/Windows, or Linux with docker-compose v2).
- A Supabase project with all migrations in `supabase/migrations/` applied. See [SETUP.md](SETUP.md).
- A Clerk application with Organizations enabled.
- (Optional) A verified Resend domain for email digests.

## 1. Clone and configure

```bash
git clone https://github.com/robb404/mist_config_assurance.git
cd mist_config_assurance
cp .env.example .env
```

Edit `.env` with real values. For Docker Compose specifically, **every** var your containers need must be in this `.env` file at the project root. See `.env.example` for the full list; required vars:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_JWKS_URL=https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json
TOKEN_ENCRYPTION_KEY=<fernet key>
NEXT_PUBLIC_APP_URL=http://your-host:3000
APP_URL=http://your-host:3000
```

Optional:
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notifications@yourdomain.com
ENABLE_DEBUG_LOGS=false
```

> **NEXT_PUBLIC_* vars are inlined at build time.** If you change them later, you must rebuild the frontend image.

## 2. Build and start

```bash
docker compose up -d --build
```

This:
- Builds the backend image (`python:3.11-slim` + deps + app code).
- Builds the frontend image with your `NEXT_PUBLIC_*` values baked in.
- Starts both containers, backend first (frontend waits on backend health).

Check they're healthy:
```bash
docker compose ps
```

You should see both services as `running (healthy)`.

Logs:
```bash
docker compose logs -f frontend
docker compose logs -f backend
```

The app is live at http://localhost:3000 (or whatever host you're running on).

## 3. First-time config

Same flow as development — sign in via Clerk → Settings → Mist Connection → Sync Sites → Templates. See [SETUP.md §7](SETUP.md).

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

The `build` step picks up code changes; `up -d` recreates the containers. Supabase migrations need to be applied manually in the Supabase SQL Editor (the backend doesn't auto-migrate).

## Stopping

```bash
docker compose down
```

No persistent volumes — all state lives in Supabase. Safe to destroy and recreate containers any time.

## Reverse proxy / TLS

For real production exposure, front both containers with Caddy / nginx / Traefik and terminate TLS there. The containers themselves speak plain HTTP on 3000 and 8001.

Example Caddyfile:

```
your-app.example.com {
  reverse_proxy localhost:3000
}
```

Then set `APP_URL=https://your-app.example.com` and `NEXT_PUBLIC_APP_URL=https://your-app.example.com` in `.env` and rebuild.

Port 8001 (backend) does **not** need to be exposed publicly. The Next.js container reaches it over the internal Docker network at `http://backend:8001`. You can safely remove the `ports: ["8001:8001"]` mapping for the backend service if you don't need to hit the FastAPI endpoints directly from the host.

## Common issues

**Frontend build fails with "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not defined"** — the `.env` at project root is missing that var or has a typo. Remember these values are baked in at build time.

**Backend container crashes on startup with "SUPABASE_URL not set"** — same, check `.env`.

**"Webhook not configured for this org"** when Mist tries to push a webhook — you haven't completed the webhook setup in Settings → API Usage → Generate Secret, or `mode` wasn't switched to `webhook`.

**Docker Compose says "networks unavailable"** on Windows — usually Docker Desktop needs a restart. `docker compose down && docker compose up -d`.
