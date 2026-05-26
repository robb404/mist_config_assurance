# Demo-Readiness Fixes

Branch: `fix/demo-readiness-bugs` (off `master`). Backend suite: **91 passed** (was 76 pass / 6 fail).
All backend changes were written test-first (RED→GREEN). Frontend changes have no unit
harness in this repo and are verified by running the app (see "Verify after deploy").

## What was fixed (code)

| Bug | Root cause | Fix |
|---|---|---|
| **BUG-006** (500s) | `maybe_single().execute()` returns `None` on zero rows (supabase-py 2.30); `get_org`/`get_org_usage`/`_get_org_or_404`/`get_digest_settings`/etc. dereferenced `row.data` without a `None` check → `AttributeError` → HTTP 500 for any workspace with no `org_config` row. | `None`-guard on every `maybe_single` caller (now matches the pattern already used in `get_findings`/`retry_action`). Unconnected workspace now returns a clean **404**. |
| **BUG-002** (raw error / "connected" lie) | Disconnected org (token nulled) → `decrypt(None)` → `'NoneType'…encode`; `/api/org` never exposed connection status, so UI showed "✓ connected" + a broken site list. | New `_get_connected_org_or_409` guard on token endpoints (`sync_sites`, `run_site`, `get_raw_wlans`, `list_rftemplates`) → clean **409**. `/api/org` now returns a `connected` boolean. Dashboard + `MistConnectionForm` use it to show a reconnect state. Background paths (scheduler, remediation) skip gracefully when disconnected. |
| **OBS-005** (stale usage) | `get_org_usage` returned the raw stored counter, ignoring the hourly-window reset. | Applies `_reset_window_if_needed` for display → an expired window shows 0. |
| **BUG-003** (refresh 500 / 5 test fails) | `field-reference.md` was scrubbed from the repo; `build_field_dict()`/tests hard-depended on it. | `fields.json` (committed) is now the tested source of truth; `build_field_dict()` raises a clear error when the doc is absent; `/api/fields/refresh` returns a clean **503** instead of a 500. |
| **BUG-004** (flaky test) | `test_get_org_id_no_org_in_payload` called the dependency directly, leaving `x_org_id` as its truthy `Header(None)` sentinel. | Test now passes `x_org_id=None` to mirror FastAPI injection. (No production change — auth was already correct.) |

Files: `backend/main.py`, `backend/field_dict.py`, `backend/rate_limiter.py`,
`backend/tests/{test_org_endpoints.py (new), test_auth.py, test_field_dict.py}`,
`src/lib/types.ts`, `src/app/dashboard/page.tsx`, `src/components/settings/MistConnectionForm.tsx`.

## Actions you need to take (I can't do these)

1. **Supabase — release the orphaned Mist-org claim** (so The Lab can connect in your demo workspace):
   ```sql
   select org_id, org_name, mist_org_id, (mist_token is not null) as has_token
   from org_config where mist_org_id = '44a01486-189a-4822-9cbc-20212d972962';
   delete from org_config where mist_org_id = '44a01486-189a-4822-9cbc-20212d972962';
   ```
2. **Deploy the fix branch** to the Docker box: pull `fix/demo-readiness-bugs`, then
   `docker compose up -d --build`.
3. **Set `APP_URL` (BUG-001 — config, not code):** in the production `.env`,
   `APP_URL=https://mca.knowhere.place`, and ensure the reverse proxy in front of Next.js
   forwards `X-Forwarded-Proto: https`. (Fixes the localhost webhook URL; the http auth
   redirect already works for real browsers via Cloudflare's https upgrade.)
4. **Connect The Lab** in "Robert's Organization" (Settings → Mist Connection).

## Verify after deploy (I will do this)

- Switch to the still-disconnected **"test"** workspace → it should now show a clean
  "reconnect" state (no `NoneType` error, no contradictory tiles, no "✓ connected").
- `GET /api/org` in an unconnected workspace → **404** (not 500); response includes `connected`.
- API Usage panel shows a real webhook URL (https, not localhost) and sane call budget.
- Then run the full P0→P2 live suite (drift → detect → heal) in "Robert's Organization".
