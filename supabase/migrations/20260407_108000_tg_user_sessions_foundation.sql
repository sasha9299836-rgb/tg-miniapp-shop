-- Stage A foundation: server-verified Telegram identity sessions.
-- Creates short-lived opaque user session storage for Edge authorization.

create table if not exists public.tg_user_sessions (
  token text primary key,
  tg_user_id bigint not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists tg_user_sessions_tg_user_id_idx
  on public.tg_user_sessions(tg_user_id);

create index if not exists tg_user_sessions_expires_at_idx
  on public.tg_user_sessions(expires_at);

alter table public.tg_user_sessions enable row level security;

drop policy if exists tg_user_sessions_dev_full_access on public.tg_user_sessions;
drop policy if exists tg_user_sessions_public_access on public.tg_user_sessions;

revoke all on public.tg_user_sessions from anon, authenticated;
