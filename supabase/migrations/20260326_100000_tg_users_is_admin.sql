alter table public.tg_users
  add column if not exists is_admin boolean not null default false;

update public.tg_users
set is_admin = true
where telegram_id = 6360613956;

notify pgrst, 'reload schema';
