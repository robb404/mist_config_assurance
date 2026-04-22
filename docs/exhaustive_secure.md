# Security Overview

Honest, exhaustive description of the application's security posture: what's protected, how, and what limitations exist. Last reviewed against commit `03fb5d9`.

---

## 1. Threat model

**Assets being protected**
1. Mist API tokens — if stolen, an attacker can read and modify the customer's Mist network configuration.
2. Customer configuration data — WLAN settings, site layouts, credentials — stored as findings, incidents, remediation records.
3. Clerk user sessions / identity — if stolen, enables acting as an authenticated user.
4. The hourly Mist API call budget — if abused, legitimate operations lock up for an hour.

**Threats considered**
- Cross-tenant data access (one Clerk org querying another org's data)
- Stolen database service-role key
- Stolen reverse-proxy / replay of webhook POSTs
- CSRF from a malicious website against an authenticated user
- SQL injection
- Logging of secrets
- Privileged escalation via URL manipulation
- Runaway auto-remediation (own goal: DoS of the customer's own Mist account)

**Threats explicitly out of scope for now**
- Nation-state persistent adversaries with database or memory access.
- Insider threats where a workspace admin intentionally abuses their own access.
- Physical compromise of the host running Docker.
- Third-party SaaS compromise (Clerk, Supabase, Resend) — we accept their security posture.

---

## 2. Authentication & authorization

### 2.1 End-user auth — Clerk

- Users sign in via Clerk's hosted UI. All sessions are JWT-based.
- Every FastAPI endpoint that reads or writes tenant data depends on `get_org_id` (`backend/auth.py`), which:
  1. Requires an `Authorization: Bearer <JWT>` header
  2. Verifies signature against Clerk's JWKS
  3. Extracts the active `org_id` claim
  4. Raises 403 if no active org is selected
- The two public endpoints are:
  - `GET /health` — trivial, used by Docker healthcheck
  - `POST /api/webhooks/mist/{org_id}` — cryptographically authenticated via HMAC (§4)

### 2.2 Tenant isolation

Every table that holds customer data carries an `org_id` column. **Every** Supabase query in the app filters by `org_id` sourced from the verified JWT. Grep-auditable:

```
grep -n '.eq("org_id", org_id)' backend/main.py
```

Write paths were specifically audited after a recent pass:
- `PUT /api/standards/:id` — filters by id AND org_id
- `POST /api/remediation/:id/retry` — filters by id AND org_id (update now includes the filter)
- `_execute_remediation_action` — the incident-by-id UPDATE filters by org_id

Only the webhook endpoint reads `org_id` from the URL path (not the JWT). That's gated by HMAC verification of the request body using a per-org shared secret (§4.2).

### 2.3 Workspace-to-Mist-org binding

Two Clerk workspaces cannot monitor the same Mist org simultaneously (prevents duplicate API calls and remediation races):

- **App check** — connect endpoint queries for any existing `org_config` row with the same `mist_org_id` under a different workspace and rejects 409 with a clear message.
- **Database enforcement** — partial unique index `org_config_unique_mist_org_id` on `mist_org_id where mist_org_id is not null` (migration 010). This catches any race that slips past the app check.
- **Release flow** — `DELETE /api/org/connect` nulls `mist_token` and `mist_org_id` so a different workspace can claim the Mist org. Preserves standards, incidents, and sites.

---

## 3. Secrets management

### 3.1 Mist API tokens

- Users paste the token once; it's encrypted with `TOKEN_ENCRYPTION_KEY` (a Fernet symmetric key) and stored in `org_config.mist_token`.
- Decryption happens only when a Mist call is about to be made (`backend/crypto.py`).
- The token is **never** returned to the frontend. `GET /api/org` strips `mist_token` from the response body.
- Tokens are not written to any log line. Search `backend/` for `mist_token`: every usage either encrypts, decrypts within a function scope, or passes through to `httpx`.

### 3.2 Webhook secrets

- Generated via `secrets.token_hex(32)` when the user enables webhook mode. That's 256 bits of entropy from Python's `secrets` module (CSPRNG).
- Shown once in the UI (Settings → API Usage → Generate Secret), then stored Fernet-encrypted.
- Used for HMAC-SHA256 verification of inbound Mist webhooks.
- Regenerate invalidates the previous secret immediately — any in-flight Mist webhook with the old secret will 401.

### 3.3 Environment variables

The app reads the following secrets from env. Rotate any time; the app re-reads on container restart.

| Var | What it protects |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | Fernet key for at-rest Mist tokens + webhook secrets |
| `CLERK_SECRET_KEY` | Clerk Backend API access (used for email lookup for digests) |
| `CLERK_JWKS_URL` | Where to fetch Clerk's public keys for JWT verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Full-access DB key — bypasses RLS |
| `RESEND_API_KEY` | Transactional email API key |

**Do not commit `.env` files.** The repo's `.gitignore` excludes `.env` and `.env.*`. Only `.env.example` is tracked.

---

## 4. Data in transit

### 4.1 Frontend → backend

- In normal operation the browser never talks to the FastAPI backend directly. All browser requests go to Next.js (`/api/proxy/*`) which validates Clerk session server-side and forwards to the backend with a trusted `Authorization` header.
- Between the Next.js container and the backend container, traffic is plain HTTP on the internal Docker network (`http://backend:8001`). That network is not reachable from outside the host.
- For public exposure, terminate TLS at a reverse proxy (Caddy / Traefik / nginx) in front of Next.js. See `docs/DEPLOYMENT.md`.

### 4.2 Mist → backend webhook

- Path: `POST /api/webhooks/mist/{org_id}` on the Next.js public route, forwarded to the backend.
- Authentication: HMAC-SHA256 via the `X-Mist-Signature-v2` header, computed over the raw request body with the workspace's webhook secret.
- Verification uses `hmac.compare_digest` — constant-time, resistant to timing attacks.
- If verification fails: 401, no further processing, no logging of the payload body.
- Known gap: **no replay protection window**. A captured valid Mist POST could be replayed until the secret is rotated. Mitigation: rotate the webhook secret if you suspect compromise.

### 4.3 Backend → Mist

- All Mist API calls go out over HTTPS with `httpx` (certificate verification handled by `httpx` defaults).
- `verify=False` is currently set on the httpx client for compatibility with some on-prem Mist deployments. For cloud Mist this should be `verify=True` — tracked as a deployment-time config item.

### 4.4 Backend → Supabase

- Supabase client connects over HTTPS to the `SUPABASE_URL`. Certificate verified.
- Uses the service-role key, which bypasses row-level security. All tenant isolation is enforced by the app layer's `org_id` filters.

### 4.5 Backend → Resend

- Standard HTTPS to `https://api.resend.com`. Bearer auth via `RESEND_API_KEY`.

---

## 5. Input validation

- All request bodies use Pydantic models (`backend/models.py`). Type-coerces, rejects malformed input with 422.
- `ConnectRequest` — `mist_token` and `cloud_endpoint` both require `min_length=1`.
- `StandardCreate` — `name`, `check_field`, `check_condition`, `remediation_field` all require `min_length=1`.
- `DigestSettingsRequest` — `frequency` is a `Literal["daily", "weekly"] | None`.
- Supabase queries are parameterized by the client library. There is no string-interpolation SQL anywhere in the codebase (`grep -rn 'table(' backend/` shows only method-chained queries).

---

## 6. Network-layer protections

### 6.1 CORS

- `CORSMiddleware` is locked to `APP_URL` only (commit `169cead`).
- `allow_credentials=True`, so cookies and authorization headers work from the single allowed origin.
- Prevents drive-by CSRF if port 8001 is ever exposed directly to the internet.

### 6.2 Rate limiting (self-imposed, outbound)

Not about protecting the backend from abusive clients — about protecting the customer from us exhausting their Mist token's quota.

- `rate_limiter.py` enforces a per-org 5,000 calls/hour cap, with 4,000 reserved for checks and 1,000 for remediations.
- `increment_calls_atomic` (migration 009) applies the increment with a row lock so concurrent writers can't lose increments.
- Scheduler refuses to schedule new site checks if doing so would push the counter over the check budget.
- UI surfaces the budget live in Settings → API Usage.

### 6.3 Inbound rate limiting

**Not currently implemented.** The public webhook endpoint has no explicit rate limit beyond the HMAC check. An attacker who somehow guessed a valid webhook URL could probe it, but without the secret the probe returns 401.

If you expose port 8001 publicly (not recommended — proxy through Next.js), add rate limiting at the reverse proxy layer.

---

## 7. Dependencies

### 7.1 Backend (Python)

- `fastapi`, `uvicorn`, `httpx`, `pydantic` — mainstream, actively maintained.
- `pyjwt[crypto]` — JWT handling.
- `cryptography` — Fernet, symmetric encryption.
- `supabase` — official Supabase Python client.
- Pinned at `>=` minimums in `backend/requirements.txt`. For production, pin exact versions and refresh on a cadence.

### 7.2 Frontend (Node)

- `next`, `react`, `@clerk/nextjs`, `tailwindcss`, `lucide-react`.
- Lockfile `pnpm-lock.yaml` is committed; exact versions reproduce across builds.

### 7.3 Supply chain

- Docker base images: `python:3.11-slim`, `node:20-alpine`. Both official, rebuild regularly for CVE patches.
- No bespoke forks of third-party libraries.

**Recommendation for production:** run a vulnerability scanner (Trivy, Snyk, GitHub Dependabot) against the built images on every push.

---

## 8. Logging & observability

### 8.1 What gets logged

- Every HTTP request the backend serves (uvicorn access log).
- Business events: drift check starts/ends, remediation attempts, webhook receipts, digest sends.
- Errors with full traceback.

### 8.2 What does NOT get logged

- Mist API tokens (plaintext or encrypted)
- Webhook secrets
- Clerk JWTs
- Supabase service-role key
- Resend API key
- Recipient email addresses in digest logs (addresses appear in the remote Resend dashboard, not our logs)

If you find a log line that includes any of those, treat it as a bug — `grep` history, `git blame`, and open an issue.

### 8.3 Request correlation

- Every HTTP request is tagged with an `X-Request-ID` (generated by the backend middleware or propagated from the client).
- The ID is included in every log line produced during that request.
- Echoed back in the response header for the client to correlate.
- Debug Logs panel displays the first 8 chars of the ID inline.

### 8.4 Debug Logs panel

- Gated by `ENABLE_DEBUG_LOGS=true` env var — off by default.
- Any authenticated user in the workspace can see the stream.
- **Limitation**: there is no per-role restriction within a Clerk workspace. If a workspace has multiple members and you enable debug logs, all of them can see the stream. For shared workspaces, leave `ENABLE_DEBUG_LOGS=false` unless you explicitly trust every member.

### 8.5 In-memory buffer

The Debug Logs panel's backing buffer is an in-memory ring (500 lines) inside the Python process. It does not persist across restarts. Live log content is never written to disk by the app itself (though Docker's stdout capture will).

---

## 9. Database

### 9.1 Access model

- Single service-role Supabase client across the backend.
- All tenant isolation is enforced at the application layer through `org_id` filters.
- Row-level security (RLS) policies could be added as an additional defense-in-depth layer but are not currently required.

### 9.2 Migrations

- `supabase/migrations/001_init.sql` through `011_mist_token_nullable.sql`.
- Apply manually via the Supabase SQL Editor — the backend does not auto-migrate.
- Each migration is additive and idempotent where possible (`create table if not exists`, `do $$ ... end $$` blocks for conditional constraint drops).

### 9.3 Sensitive columns

| Table | Column | Notes |
|---|---|---|
| `org_config` | `mist_token` | Fernet-encrypted. Nullable (migration 011). |
| `org_config` | `webhook_secret` | Fernet-encrypted. |
| `org_config` | `calls_used_this_hour` / `calls_window_start` | Atomic via migration 009 RPC. |
| `incident` | (no direct secrets) | Some `actual_value` fields could contain WLAN names / VLAN IDs — treat incident export (CSV) as sensitive to the customer. |

---

## 10. Operational hardening for production

Not enforced by the code but required for a production deployment:

1. **TLS termination** at a reverse proxy in front of Next.js. Containers speak plain HTTP internally — never expose port 8001 or 3000 to the internet without TLS.
2. **Regular image rebuilds** to pick up base-image CVE fixes (`docker compose build --no-cache`).
3. **Secrets rotation**. `TOKEN_ENCRYPTION_KEY` rotation is manual and disruptive (all stored tokens become undecryptable). Generate a fresh key at deployment time and back it up. Clerk and Resend keys can be rotated via their dashboards; update `.env` and restart the container.
4. **Backup policy** for Supabase. Supabase has its own backup features — enable point-in-time recovery at the paid tier.
5. **Dependabot / Snyk** scanning of the GitHub repo.
6. **Private repo** unless you intend the code to be open source. At minimum, ensure no secrets have been committed historically (`git log --all -p | grep -i 'api.key\|secret\|token'`).
7. **Least-privilege Supabase project** — if you only need the backend to hit certain tables, create a narrower RLS policy and a per-service JWT instead of the service-role key. Not done currently; service-role key has full access.

---

## 11. Known gaps / roadmap

Ranked by priority. None are demo-blockers; all are reasonable future hardening.

1. **Webhook replay window**. A captured Mist POST body is valid until the workspace's secret is rotated. Add a timestamp check and reject payloads older than N minutes if Mist adds a `timestamp` claim to its audit events.
2. **Audit log**. No persistent record of who changed which standard, or who approved which remediation. Useful for compliance.
3. **Per-role restrictions inside a workspace**. Clerk organizations have roles; we don't currently check them. An "admin"-only guard on destructive endpoints (disconnect, delete standard) would close a risk if workspaces have low-trust members.
4. **2FA enforcement**. Delegated to Clerk. App does not currently require it at the workspace level.
5. **httpx `verify=True` for cloud Mist**. Currently `verify=False` in `mist_client.py` for on-prem compatibility. Should be config-gated.
6. **Atomic counter for pagination `total`**. The count query in the paginated list endpoints is a separate query from the page fetch. Under rapid concurrent writes `total` can drift. Acceptable for the use case.
7. **Inbound rate limiting** on the webhook endpoint. HMAC authenticates the payload; a rate limit would reduce the attack surface if a bad actor probes the endpoint.
8. **Secret scanning in CI**. GitHub's built-in secret scanning is the current backstop (it's why we had to scrub the Mist API docs from the repo history). A CI step that runs `gitleaks` or `trufflehog` on every push would catch this pre-merge.

---

## 12. Reporting vulnerabilities

If you discover a security issue:

1. **Do not open a public GitHub issue.** The repo is public (or may be).
2. Contact the maintainer directly via the GitHub profile email at https://github.com/robb404.
3. Include: vulnerable file/function, reproduction steps, expected vs actual behavior, your suggested fix if you have one.
4. Reasonable disclosure timeline: 14 days for acknowledgment, 90 days for a fix to ship or a joint disclosure plan.

No bug bounty program at this time.
