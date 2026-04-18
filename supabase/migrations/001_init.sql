create table if not exists org_config (
  org_id          text primary key,
  mist_token      text not null,
  cloud_endpoint  text not null,
  org_name        text not null,
  drift_interval_mins int not null default 0,
  auto_remediate  boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists site (
  id              text not null,
  org_id          text not null references org_config(org_id) on delete cascade,
  name            text not null,
  monitored       boolean not null default true,
  last_checked_at timestamptz,
  primary key (id, org_id)
);

create table if not exists standard (
  id                  uuid primary key default gen_random_uuid(),
  org_id              text not null references org_config(org_id) on delete cascade,
  name                text not null,
  description         text,
  scope               text not null check (scope in ('wlan','site')),
  filter              jsonb,
  check_field         text not null,
  check_condition     text not null,
  check_value         jsonb,
  remediation_field   text not null,
  remediation_value   jsonb not null,
  auto_remediate      boolean,
  enabled             boolean not null default true,
  created_at          timestamptz not null default now()
);

create table if not exists validation_run (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  site_id     text not null,
  site_name   text not null,
  run_at      timestamptz not null default now(),
  triggered_by text not null check (triggered_by in ('manual','scheduled')),
  passed      int not null default 0,
  failed      int not null default 0,
  skipped     int not null default 0
);

create table if not exists finding (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references validation_run(id) on delete cascade,
  standard_id uuid not null references standard(id) on delete cascade,
  wlan_id     text,
  ssid        text,
  status      text not null check (status in ('pass','fail','skip')),
  actual_value text
);

create table if not exists incident (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  site_id     text not null,
  site_name   text not null,
  standard_id uuid not null references standard(id) on delete cascade,
  title       text not null,
  wlan_id     text,
  ssid        text,
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  status      text not null default 'open' check (status in ('open','resolved','suppressed'))
);

create table if not exists remediation_action (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references incident(id) on delete cascade,
  org_id       text not null,
  site_id      text not null,
  wlan_id      text,
  standard_id  uuid not null references standard(id) on delete cascade,
  desired_value jsonb not null,
  attempted_at timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected','success','failed')),
  error_detail text
);

create index if not exists idx_site_org        on site(org_id);
create index if not exists idx_std_org         on standard(org_id);
create index if not exists idx_run_org_site    on validation_run(org_id, site_id);
create index if not exists idx_finding_run     on finding(run_id);
create index if not exists idx_incident_org    on incident(org_id);
create index if not exists idx_incident_status on incident(status);
create index if not exists idx_ra_incident     on remediation_action(incident_id);
create index if not exists idx_ra_status       on remediation_action(status);
