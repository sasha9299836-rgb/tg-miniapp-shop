alter table if exists public.tg_users enable row level security;

drop policy if exists tg_users_dev_full_access on public.tg_users;

revoke all on table public.tg_users from anon, authenticated;

notify pgrst, 'reload schema';
