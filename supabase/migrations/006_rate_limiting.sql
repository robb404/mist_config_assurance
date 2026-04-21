-- supabase/migrations/006_rate_limiting.sql
alter table org_config
  add column if not exists mode                 text not null default 'polling'
                                                  check (mode in ('polling','webhook')),
  add column if not exists webhook_secret       text,
  add column if not exists calls_used_this_hour integer not null default 0,
  add column if not exists calls_window_start   timestamptz;
