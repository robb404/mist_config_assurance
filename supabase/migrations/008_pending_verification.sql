-- Add 'pending_verification' as a valid incident.status value.
-- Used when a remediation has fired and we're waiting for the next
-- scheduled drift cycle to independently verify the fix took effect.

do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
    where conrelid = 'incident'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table incident drop constraint %I', cname);
  end if;
end $$;

alter table incident
  add constraint incident_status_check
    check (status in ('open', 'resolved', 'suppressed', 'pending_verification'));
