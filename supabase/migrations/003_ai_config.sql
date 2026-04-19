create table if not exists ai_config (
  org_id              text primary key references org_config(org_id) on delete cascade,
  provider            text not null check (provider in ('anthropic', 'openai', 'ollama')),
  openai_auth_method  text check (openai_auth_method in ('key', 'oauth')),
  api_key             text,
  oauth_access_token  text,
  oauth_refresh_token text,
  oauth_token_expiry  timestamptz,
  model               text not null default 'gpt-4o-mini',
  base_url            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_ai_config_org on ai_config(org_id);
