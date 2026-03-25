alter table public.tg_users
  add column if not exists last_name text null,
  add column if not exists first_name text null,
  add column if not exists middle_name text null,
  add column if not exists birth_date date null,
  add column if not exists email text null,
  add column if not exists phone text null;

notify pgrst, 'reload schema';
