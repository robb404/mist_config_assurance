# Mist Config Assurance

Continuously check Juniper Mist WLAN and site configuration against a library of standards, flag drift, and optionally auto-remediate — all from a clean web dashboard.

## What it does

- **Drift detection.** Periodically (or via Mist webhooks) pulls WLAN and site config from the Mist API, evaluates it against your configured standards, and records findings.
- **Self-healing.** When a standard supports it, the app can automatically PATCH the fix back to Mist. Remediations can be auto-applied or held for manual approval.
- **Template library.** One-click best-practice standards (Fast Roaming, ARP Filtering, Data Rates, RF Template, AP Config Persistence, and more).
- **Custom standards.** Paste real Mist JSON config and the app derives standards from the field/value pairs. Optional AI assistance converts English filter descriptions into structured filter JSON.
- **Email digests.** Daily or weekly summary of drift/remediation activity via Resend.
- **API rate awareness.** Built around Mist's 5,000 calls/hour limit. Staggered polling, per-site rate accounting, and a webhook mode for large organisations.
- **Live debug logs.** Toggleable in Settings — stream the Python backend's logs directly in the browser, with a pop-out window for side-by-side debugging.

## Tech stack

| Concern | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | FastAPI, APScheduler, Python 3.11 |
| Database | Supabase (Postgres) |
| Auth | Clerk |
| Email | Resend |
| AI (optional) | Anthropic, OpenAI, or Ollama |
| Container | Docker + docker-compose |

## Quick start (local development)

Prerequisites: Node.js 20+, pnpm, Python 3.11+, a Supabase project, a Clerk application.

```bash
# 1. Install deps
pnpm install
cd backend && pip install -r requirements.txt && cd ..

# 2. Configure env
cp .env.example .env.local     # frontend vars (NEXT_PUBLIC_*, CLERK_SECRET_KEY)
cp .env.example backend/.env   # backend vars (Supabase, TOKEN_ENCRYPTION_KEY, Resend, ...)

# 3. Apply all Supabase migrations in supabase/migrations/ via the Supabase SQL Editor

# 4. Run
# Terminal 1 — backend
uvicorn backend.main:app --port 8001 --reload
# Terminal 2 — frontend
pnpm dev
```

Open http://localhost:3000 and connect your Mist org on the Settings page.

For full setup instructions (env vars, Clerk config, Supabase migrations, Resend domain verification): see [`docs/SETUP.md`](docs/SETUP.md).

## Production deploy (Docker)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full Docker production walkthrough.

```bash
cp .env.example .env
# edit .env with real values
docker compose up -d --build
```

## Project layout

```
backend/               FastAPI app (drift engine, scheduler, Mist client, etc.)
src/                   Next.js app (App Router)
  app/                  Pages (dashboard, sites, standards, activity, settings, debug)
  components/           React components, grouped by concern
  lib/                  Shared types, API client, utils, template definitions
supabase/migrations/   SQL migrations (apply via Supabase SQL Editor)
docs/                  Setup, deployment, design system docs
  DESIGN.md              Visual design system — tokens, typography, patterns
  superpowers/           Specs and implementation plans for major features
```

## Design system

The UI follows an in-house design system documented in [`docs/DESIGN.md`](docs/DESIGN.md) — surface hierarchy, typography (Manrope + Inter), Signature Gradient for primary actions, status colors for healthy/drift/error states.

## License

Internal project — all rights reserved.
