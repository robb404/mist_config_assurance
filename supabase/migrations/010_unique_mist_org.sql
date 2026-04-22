-- One Mist org may only be monitored by one workspace (Clerk org_id) at a
-- time. Two workspaces connecting to the same Mist org would double the
-- hourly API call volume against a shared Mist ceiling and could race on
-- auto-remediations — both are unsafe.
--
-- Enforce at the DB level. Partial index because a fresh workspace has
-- mist_org_id = NULL, and we don't want to block multiple un-connected
-- workspaces from existing.

create unique index if not exists org_config_unique_mist_org_id
  on org_config (mist_org_id)
  where mist_org_id is not null;
