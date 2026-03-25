create table if not exists public.tg_address_presets (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null,
  name text not null,
  recipient_fio text not null,
  recipient_phone text not null,
  city text not null,
  pvz text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tg_address_presets_tg_user_id_idx
  on public.tg_address_presets(tg_user_id);

create unique index if not exists tg_address_presets_one_default_per_user_idx
  on public.tg_address_presets(tg_user_id)
  where is_default = true;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tg_address_presets_set_updated_at on public.tg_address_presets;
create trigger tg_address_presets_set_updated_at
before update on public.tg_address_presets
for each row
execute function public.tg_set_updated_at();

alter table public.tg_address_presets enable row level security;

alter table public.tg_orders
  add column if not exists packaging_type text not null default 'standard',
  add column if not exists packaging_fee_rub integer not null default 0,
  add column if not exists pvz text null,
  add column if not exists address_preset_id uuid null references public.tg_address_presets(id) on delete set null;

alter table public.tg_orders
  drop constraint if exists tg_orders_packaging_type_check;

alter table public.tg_orders
  add constraint tg_orders_packaging_type_check
  check (packaging_type in ('standard', 'box'));

create or replace function public.tg_list_address_presets(
  p_tg_user_id bigint
)
returns setof public.tg_address_presets
language sql
security definer
set search_path = public
as $$
  select p.*
  from public.tg_address_presets p
  where p.tg_user_id = p_tg_user_id
  order by p.is_default desc, p.updated_at desc, p.created_at desc;
$$;

create or replace function public.tg_upsert_address_preset(
  p_tg_user_id bigint,
  p_preset_id uuid default null,
  p_name text,
  p_recipient_fio text,
  p_recipient_phone text,
  p_city text,
  p_pvz text,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preset_id uuid;
begin
  if p_preset_id is null then
    insert into public.tg_address_presets (
      tg_user_id,
      name,
      recipient_fio,
      recipient_phone,
      city,
      pvz,
      is_default
    )
    values (
      p_tg_user_id,
      trim(p_name),
      trim(p_recipient_fio),
      trim(p_recipient_phone),
      trim(p_city),
      trim(p_pvz),
      false
    )
    returning id into v_preset_id;
  else
    update public.tg_address_presets
    set
      name = trim(p_name),
      recipient_fio = trim(p_recipient_fio),
      recipient_phone = trim(p_recipient_phone),
      city = trim(p_city),
      pvz = trim(p_pvz)
    where id = p_preset_id
      and tg_user_id = p_tg_user_id
    returning id into v_preset_id;

    if v_preset_id is null then
      raise exception 'PRESET_NOT_FOUND_OR_FORBIDDEN';
    end if;
  end if;

  if p_is_default then
    update public.tg_address_presets
    set is_default = (id = v_preset_id)
    where tg_user_id = p_tg_user_id;
  end if;

  return v_preset_id;
end;
$$;

create or replace function public.tg_delete_address_preset(
  p_tg_user_id bigint,
  p_preset_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tg_address_presets
  where id = p_preset_id
    and tg_user_id = p_tg_user_id;

  if not found then
    raise exception 'PRESET_NOT_FOUND_OR_FORBIDDEN';
  end if;
end;
$$;

create or replace function public.tg_apply_checkout_options_to_order(
  p_order_id uuid,
  p_tg_user_id bigint,
  p_packaging_type text,
  p_address_preset_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packaging_type text := case when p_packaging_type = 'box' then 'box' else 'standard' end;
  v_packaging_fee int := case when p_packaging_type = 'box' then 150 else 0 end;
  v_preset public.tg_address_presets%rowtype;
begin
  update public.tg_orders
  set
    packaging_type = v_packaging_type,
    packaging_fee_rub = v_packaging_fee
  where id = p_order_id
    and tg_user_id = p_tg_user_id
    and status = 'awaiting_payment_proof';

  if not found then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if p_address_preset_id is null then
    return;
  end if;

  select *
  into v_preset
  from public.tg_address_presets
  where id = p_address_preset_id
    and tg_user_id = p_tg_user_id;

  if not found then
    raise exception 'PRESET_NOT_FOUND_OR_FORBIDDEN';
  end if;

  update public.tg_orders
  set
    fio = v_preset.recipient_fio,
    phone = v_preset.recipient_phone,
    city = v_preset.city,
    pvz = v_preset.pvz,
    cdek_pvz_address = v_preset.pvz,
    address_preset_id = v_preset.id
  where id = p_order_id
    and tg_user_id = p_tg_user_id
    and status = 'awaiting_payment_proof';
end;
$$;

grant execute on function public.tg_list_address_presets(bigint) to anon, authenticated;
grant execute on function public.tg_upsert_address_preset(bigint, uuid, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.tg_delete_address_preset(bigint, uuid) to anon, authenticated;
grant execute on function public.tg_apply_checkout_options_to_order(uuid, bigint, text, uuid) to anon, authenticated;
