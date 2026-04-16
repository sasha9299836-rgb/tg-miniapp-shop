create table if not exists public.tg_beta_access_whitelist (
  telegram_id bigint primary key,
  telegram_username text null,
  note text null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tg_beta_access_whitelist enable row level security;

revoke all on table public.tg_beta_access_whitelist from anon, authenticated;

drop policy if exists tg_beta_access_whitelist_dev_full_access on public.tg_beta_access_whitelist;

notify pgrst, 'reload schema';
