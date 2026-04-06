create table if not exists public.tg_user_favorites (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null,
  post_id uuid not null references public.tg_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tg_user_cart (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null,
  post_id uuid not null references public.tg_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists tg_user_favorites_user_post_uidx
  on public.tg_user_favorites(tg_user_id, post_id);

create unique index if not exists tg_user_cart_user_post_uidx
  on public.tg_user_cart(tg_user_id, post_id);

create index if not exists tg_user_favorites_user_created_idx
  on public.tg_user_favorites(tg_user_id, created_at desc);

create index if not exists tg_user_cart_user_created_idx
  on public.tg_user_cart(tg_user_id, created_at desc);

create or replace function public.tg_user_favorites_add(
  p_tg_user_id bigint,
  p_post_id uuid
)

returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_tg_user_id is null or p_post_id is null then
    return 'BAD_PAYLOAD';
  end if;

  if exists (
    select 1 from public.tg_user_favorites
    where tg_user_id = p_tg_user_id
      and post_id = p_post_id
  ) then
    return 'ALREADY_EXISTS';
  end if;

  select count(*)
    into v_count
  from public.tg_user_favorites
  where tg_user_id = p_tg_user_id;

  if v_count >= 50 then
    return 'LIMIT_REACHED';
  end if;

  insert into public.tg_user_favorites(tg_user_id, post_id)
  values (p_tg_user_id, p_post_id)
  on conflict (tg_user_id, post_id) do nothing;

  return 'ADDED';
end;
$$;

create or replace function public.tg_user_cart_add(
  p_tg_user_id bigint,
  p_post_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_tg_user_id is null or p_post_id is null then
    return 'BAD_PAYLOAD';
  end if;

  if exists (
    select 1 from public.tg_user_cart
    where tg_user_id = p_tg_user_id
      and post_id = p_post_id
  ) then
    return 'ALREADY_EXISTS';
  end if;

  select count(*)
    into v_count
  from public.tg_user_cart
  where tg_user_id = p_tg_user_id;

  if v_count >= 10 then
    return 'LIMIT_REACHED';
  end if;

  insert into public.tg_user_cart(tg_user_id, post_id)
  values (p_tg_user_id, p_post_id)
  on conflict (tg_user_id, post_id) do nothing;

  return 'ADDED';
end;
$$;

grant select, insert, delete on public.tg_user_favorites to anon, authenticated;
grant select, insert, delete on public.tg_user_cart to anon, authenticated;
grant execute on function public.tg_user_favorites_add(bigint, uuid) to anon, authenticated;
grant execute on function public.tg_user_cart_add(bigint, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
