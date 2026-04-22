-- Allow mist_token to be NULL so a workspace can release its Mist claim
-- (DELETE /api/org/connect) without having to delete the whole
-- org_config row. Preserves standards, incidents, and sites.

alter table org_config
  alter column mist_token drop not null;
