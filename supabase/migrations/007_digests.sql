-- supabase/migrations/007_digests.sql
alter table org_config
  add column if not exists digest_frequency         text
    check (digest_frequency in ('daily','weekly')),
  add column if not exists digest_extra_recipients  text[] not null default '{}',
  add column if not exists digest_last_sent_at      timestamptz,
  add column if not exists digest_last_error        text,
  add column if not exists owner_user_id            text;
