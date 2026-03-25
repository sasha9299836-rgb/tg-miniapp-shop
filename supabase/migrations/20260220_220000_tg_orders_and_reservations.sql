create extension if not exists pgcrypto;

create table if not exists public.tg_settings (
  key text primary key,
  value text not null
);

insert into public.tg_settings(key, value)
values ('order_payment_timeout_seconds', '420')
on conflict (key) do nothing;

create or replace function public.tg_get_setting_int(p_key text, p_default int)
returns int
language plpgsql
stable
as $$
declare
  v_value text;
begin
  select s.value into v_value
  from public.tg_settings s
  where s.key = p_key;

  if v_value is null then
    return p_default;
  end if;

  return coalesce(nullif(trim(v_value), '')::int, p_default);
exception
  when others then
    return p_default;
end;
$$;

alter table public.tg_posts
  add column if not exists sale_status text not null default 'available',
  add column if not exists reserved_until timestamptz null,
  add column if not exists reserved_order_id uuid null;

alter table public.tg_posts
  drop constraint if exists tg_posts_sale_status_check;

alter table public.tg_posts
  add constraint tg_posts_sale_status_check
  check (sale_status in ('available', 'reserved', 'sold'));

create index if not exists tg_posts_sale_status_reserved_until_idx
  on public.tg_posts(sale_status, reserved_until);

create table if not exists public.tg_orders (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null,
  post_id uuid not null references public.tg_posts(id) on delete restrict,
  status text not null,
  reserved_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  price_rub int null,
  delivery_type text not null,
  fio text not null,
  phone text not null,
  city text null,
  cdek_pvz_code text null,
  cdek_pvz_address text null,
  street text null,
  house text null,
  entrance text null,
  apartment text null,
  floor text null,
  rejection_reason text null,
  payment_proof_key text null,
  payment_proof_uploaded_at timestamptz null,
  payment_confirmed_at timestamptz null,
  constraint tg_orders_status_check check (status in (
    'created',
    'awaiting_payment_proof',
    'payment_proof_submitted',
    'payment_confirmed',
    'rejected',
    'expired',
    'cancelled'
  )),
  constraint tg_orders_delivery_type_check check (delivery_type in ('pickup', 'door'))
);

create index if not exists tg_orders_status_reserved_until_idx
  on public.tg_orders(status, reserved_until);

create table if not exists public.tg_order_events (
  id bigserial primary key,
  order_id uuid not null references public.tg_orders(id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tg_order_events_order_id_created_at_idx
  on public.tg_order_events(order_id, created_at desc);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tg_orders_set_updated_at on public.tg_orders;
create trigger tg_orders_set_updated_at
before update on public.tg_orders
for each row
execute function public.tg_set_updated_at();

create or replace function public.tg_create_order(
  p_tg_user_id bigint,
  p_post_id uuid,
  p_delivery_type text,
  p_fio text,
  p_phone text,
  p_city text default null,
  p_cdek_pvz_code text default null,
  p_cdek_pvz_address text default null,
  p_street text default null,
  p_house text default null,
  p_entrance text default null,
  p_apartment text default null,
  p_floor text default null
)
returns table(order_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timeout_seconds int := public.tg_get_setting_int('order_payment_timeout_seconds', 420);
  v_order_id uuid := gen_random_uuid();
  v_reserved_until timestamptz := now() + make_interval(secs => greatest(1, v_timeout_seconds));
  v_price int;
begin
  select price into v_price
  from public.tg_posts
  where id = p_post_id;

  update public.tg_posts
  set
    sale_status = 'reserved',
    reserved_until = v_reserved_until,
    reserved_order_id = v_order_id
  where id = p_post_id
    and status = 'published'
    and sale_status = 'available';

  if not found then
    raise exception 'NOT_AVAILABLE';
  end if;

  insert into public.tg_orders(
    id,
    tg_user_id,
    post_id,
    status,
    reserved_until,
    price_rub,
    delivery_type,
    fio,
    phone,
    city,
    cdek_pvz_code,
    cdek_pvz_address,
    street,
    house,
    entrance,
    apartment,
    floor
  )
  values (
    v_order_id,
    p_tg_user_id,
    p_post_id,
    'awaiting_payment_proof',
    v_reserved_until,
    v_price,
    p_delivery_type,
    p_fio,
    p_phone,
    p_city,
    p_cdek_pvz_code,
    p_cdek_pvz_address,
    p_street,
    p_house,
    p_entrance,
    p_apartment,
    p_floor
  );

  insert into public.tg_order_events(order_id, event, payload)
  values (v_order_id, 'created', jsonb_build_object('reserved_until', v_reserved_until));

  return query select v_order_id, v_reserved_until;
end;
$$;

grant execute on function public.tg_create_order(
  bigint, uuid, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

create or replace function public.tg_submit_payment_proof(
  p_order_id uuid,
  p_tg_user_id bigint,
  p_payment_proof_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tg_orders
  set
    payment_proof_key = p_payment_proof_key,
    payment_proof_uploaded_at = now(),
    status = 'payment_proof_submitted'
  where id = p_order_id
    and tg_user_id = p_tg_user_id
    and status in ('awaiting_payment_proof', 'created');

  if not found then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  insert into public.tg_order_events(order_id, event, payload)
  values (p_order_id, 'payment_proof_submitted', jsonb_build_object('key', p_payment_proof_key));
end;
$$;

grant execute on function public.tg_submit_payment_proof(uuid, bigint, text) to anon, authenticated;

alter table public.tg_orders enable row level security;
alter table public.tg_order_events enable row level security;
alter table public.tg_settings enable row level security;

drop policy if exists tg_orders_dev_full_access on public.tg_orders;
drop policy if exists tg_order_events_dev_full_access on public.tg_order_events;
drop policy if exists tg_settings_dev_full_access on public.tg_settings;

-- DEV ONLY. Tighten on production with per-user checks and server-only writes.
create policy tg_orders_dev_full_access on public.tg_orders
for all
using (true)
with check (true);

-- DEV ONLY. Tighten on production with server-only writes.
create policy tg_order_events_dev_full_access on public.tg_order_events
for all
using (true)
with check (true);

-- DEV ONLY. Tighten on production with admin-only access.
create policy tg_settings_dev_full_access on public.tg_settings
for all
using (true)
with check (true);
