alter table public.tg_users
  drop column if exists birth_date;

notify pgrst, 'reload schema';
