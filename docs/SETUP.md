# Setup Guide

Step-by-step walkthrough to get the app running locally.

## 1. Supabase

1. Create a project at https://supabase.com.
2. Note the **Project URL** and **Service Role Key** (Project Settings → API).
3. Open **SQL Editor** and run each migration in `supabase/migrations/` in order (001 → 007). Paste each file's contents into the editor and click Run.

You should end up with these tables in `Table Editor`:
`org_config`, `site`, `standard`, `validation_run`, `finding`, `incident`, `remediation_action`, `ai_config`.

## 2. Clerk

1. Create an application at https://clerk.com — enable **Organizations** in the dashboard.
2. Copy the **Publishable Key** and **Secret Key** from **API Keys**.
3. Copy the **JWKS URL** from **API Keys → Show JWT template → JWKS URL** (looks like `https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json`).

## 3. Generate encryption key

The backend encrypts your Mist API token at rest. Generate a Fernet key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Save the output — you'll paste it as `TOKEN_ENCRYPTION_KEY`.

## 4. (Optional) Resend — email digests

1. Sign up at https://resend.com.
2. **API Keys** → create a key (starts with `re_…`).
3. **Domains** → add and verify your sending domain (add the DNS records Resend provides, wait for "Verified" status). For quick testing you can skip this and use `onboarding@resend.dev` as the from address — Resend only lets you send to your own signed-in email in that mode.

## 5. (Optional) AI provider — smart filter/config parsing

Anthropic, OpenAI, or a local Ollama install. You configure the provider and key in **Settings → AI Provider** inside the app, not in env vars. This is only used by the Custom Config form; the app works fully without it.

## 6. Environment files

Copy `.env.example` to two locations and fill in the values:

```bash
cp .env.example .env.local     # used by Next.js dev server
cp .env.example backend/.env   # used by the FastAPI backend (auto-loaded via python-dotenv)
```

Key vars:

| Var | Where | What |
|---|---|---|
| `SUPABASE_URL` | backend | Project URL from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Service role key from step 1 |
| `CLERK_JWKS_URL` | backend | From step 2 |
| `CLERK_SECRET_KEY` | frontend + backend | Secret key from step 2 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | frontend | Publishable key from step 2 |
| `TOKEN_ENCRYPTION_KEY` | backend | Fernet key from step 3 |
| `APP_URL` | backend | Public URL of the app (used to build webhook URLs) |
| `NEXT_PUBLIC_APP_URL` | frontend | Same URL — used for Clerk redirects |
| `RESEND_API_KEY` | backend | From step 4 (optional) |
| `RESEND_FROM_EMAIL` | backend | A verified sender address in Resend |
| `ENABLE_DEBUG_LOGS` | backend | `true` to surface live logs in Settings |

Full list of vars lives in `.env.example`.

## 7. Install and run

```bash
pnpm install
cd backend && pip install -r requirements.txt && cd ..

# Terminal 1 — backend
uvicorn backend.main:app --port 8001 --reload

# Terminal 2 — frontend
pnpm dev
```

Open http://localhost:3000, sign in via Clerk, and go through the first-run flow:

1. **Settings → Mist Connection** — paste your Mist API token, pick your cloud endpoint.
2. **Settings → Drift Settings** — set a check interval and (optionally) enable self-healing org-wide.
3. **Dashboard** → **Sync Sites** to pull your Mist sites into the app.
4. **Standards** → **Templates** to add one-click best-practice standards.
5. **Dashboard** → **Check All** to run the first scan.

## Troubleshooting

- **500 errors on all pages** — a Supabase migration probably wasn't applied. Check `org_config` has all the columns from migrations 001–007.
- **"No sites yet"** — run **Sync Sites** on the Dashboard.
- **Auto-remediation doesn't fire** — verify org-level "Self-healing" is on in **Settings → Drift Settings**, or that the specific standard has its per-row Auto-fix (⚡) icon in orange.
- **Email digest says "no recipients configured"** — either reconnect the org (so `owner_user_id` is saved), or add extra recipients in **Settings → Email Digest**.
- **Debug Logs panel says "disabled"** — set `ENABLE_DEBUG_LOGS=true` in `backend/.env` and restart the backend.
