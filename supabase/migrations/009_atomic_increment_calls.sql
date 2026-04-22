-- Atomic counter for the per-org hourly Mist API call budget.
-- Replaces the read-modify-write pattern in rate_limiter.increment_calls,
-- which could lose increments under concurrent load (multi-worker uvicorn,
-- horizontal scale-out, or simply a webhook check landing while a
-- scheduled drift loop is mid-write).
--
-- The function locks the org_config row for the transaction, resets the
-- counter if the hour window has expired, applies the increment, and
-- returns the new count — all in a single DB round-trip.

create or replace function increment_calls_atomic(
  p_org_id text,
  p_n      integer
) returns integer
language plpgsql
as $$
declare
  v_calls     integer;
  v_window    timestamptz;
  v_now       timestamptz := now();
begin
  -- Row lock prevents concurrent writers from reading stale values.
  select calls_used_this_hour, calls_window_start
    into v_calls, v_window
    from org_config
    where org_id = p_org_id
    for update;

  if not found then
    return 0;
  end if;

  -- Reset if no window yet or the current one has rolled over.
  if v_window is null or (v_now - v_window) >= interval '1 hour' then
    v_calls := 0;
    v_window := v_now;
  end if;

  v_calls := coalesce(v_calls, 0) + p_n;

  update org_config
    set calls_used_this_hour = v_calls,
        calls_window_start   = v_window
    where org_id = p_org_id;

  return v_calls;
end;
$$;
