create table if not exists public.tg_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  telegram_username text null,
  telegram_first_name text null,
  telegram_last_name text null,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tg_users_telegram_id_uidx
  on public.tg_users (telegram_id);

alter table public.tg_users enable row level security;

drop policy if exists tg_users_dev_full_access on public.tg_users;

create policy tg_users_dev_full_access on public.tg_users
  for all
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.tg_upsert_telegram_user(
  p_telegram_id bigint,
  p_telegram_username text default null,
  p_telegram_first_name text default null,
  p_telegram_last_name text default null
)
returns table(
  id uuid,
  telegram_id bigint,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  registered_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_telegram_id is null or p_telegram_id <= 0 then
    raise exception 'TG_USER_TELEGRAM_ID_REQUIRED';
  end if;

  insert into public.tg_users(
    telegram_id,
    telegram_username,
    telegram_first_name,
    telegram_last_name
  )
  values (
    p_telegram_id,
    nullif(trim(coalesce(p_telegram_username, '')), ''),
    nullif(trim(coalesce(p_telegram_first_name, '')), ''),
    nullif(trim(coalesce(p_telegram_last_name, '')), '')
  )
  on conflict (telegram_id) do update
  set
    telegram_username = excluded.telegram_username,
    telegram_first_name = excluded.telegram_first_name,
    telegram_last_name = excluded.telegram_last_name,
    updated_at = now();

  return query
  select
    u.id,
    u.telegram_id,
    u.telegram_username,
    u.telegram_first_name,
    u.telegram_last_name,
    u.registered_at,
    u.updated_at
  from public.tg_users u
  where u.telegram_id = p_telegram_id
  limit 1;
end;
$$;

grant execute on function public.tg_upsert_telegram_user(bigint, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
