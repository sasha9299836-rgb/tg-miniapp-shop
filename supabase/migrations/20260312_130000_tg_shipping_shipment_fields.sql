alter table public.tg_address_presets
  add column if not exists city_code text null,
  add column if not exists pvz_code text null;

alter table public.tg_orders
  add column if not exists origin_profile text null,
  add column if not exists receiver_city_code text null,
  add column if not exists delivery_point text null,
  add column if not exists packaging_preset text null,
  add column if not exists package_weight integer null,
  add column if not exists package_length integer null,
  add column if not exists package_width integer null,
  add column if not exists package_height integer null,
  add column if not exists cdek_uuid text null,
  add column if not exists cdek_track_number text null,
  add column if not exists cdek_status text null,
  add column if not exists cdek_tariff_code integer null;

alter table public.tg_orders
  drop constraint if exists tg_orders_origin_profile_check;

alter table public.tg_orders
  add constraint tg_orders_origin_profile_check
  check (origin_profile is null or origin_profile in ('MSK', 'YAN'));

alter table public.tg_orders
  drop constraint if exists tg_orders_packaging_preset_check;

alter table public.tg_orders
  add constraint tg_orders_packaging_preset_check
  check (packaging_preset is null or packaging_preset in ('A2', 'A3', 'A4'));

create index if not exists tg_orders_cdek_uuid_idx
  on public.tg_orders(cdek_uuid)
  where cdek_uuid is not null;

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
  p_name text default null,
  p_recipient_fio text default null,
  p_recipient_phone text default null,
  p_city text default null,
  p_pvz text default null,
  p_is_default boolean default false,
  p_city_code text default null,
  p_pvz_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preset_id uuid;
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if trim(coalesce(p_recipient_fio, '')) = '' then
    raise exception 'RECIPIENT_FIO_REQUIRED';
  end if;

  if trim(coalesce(p_recipient_phone, '')) = '' then
    raise exception 'RECIPIENT_PHONE_REQUIRED';
  end if;

  if trim(coalesce(p_city, '')) = '' then
    raise exception 'CITY_REQUIRED';
  end if;

  if trim(coalesce(p_pvz, '')) = '' then
    raise exception 'PVZ_REQUIRED';
  end if;

  if p_is_default then
    update public.tg_address_presets
    set is_default = false
    where tg_user_id = p_tg_user_id;
  end if;

  if p_preset_id is null then
    insert into public.tg_address_presets (
      tg_user_id,
      name,
      recipient_fio,
      recipient_phone,
      city,
      city_code,
      pvz,
      pvz_code,
      is_default
    )
    values (
      p_tg_user_id,
      trim(p_name),
      trim(p_recipient_fio),
      trim(p_recipient_phone),
      trim(p_city),
      nullif(trim(coalesce(p_city_code, '')), ''),
      trim(p_pvz),
      nullif(trim(coalesce(p_pvz_code, '')), ''),
      coalesce(p_is_default, false)
    )
    returning id into v_preset_id;
  else
    update public.tg_address_presets
    set
      name = trim(p_name),
      recipient_fio = trim(p_recipient_fio),
      recipient_phone = trim(p_recipient_phone),
      city = trim(p_city),
      city_code = nullif(trim(coalesce(p_city_code, '')), ''),
      pvz = trim(p_pvz),
      pvz_code = nullif(trim(coalesce(p_pvz_code, '')), ''),
      is_default = coalesce(p_is_default, false)
    where id = p_preset_id
      and tg_user_id = p_tg_user_id
    returning id into v_preset_id;

    if v_preset_id is null then
      raise exception 'PRESET_NOT_FOUND_OR_FORBIDDEN';
    end if;
  end if;

  return v_preset_id;
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
  v_packaging_preset text := case when p_packaging_type = 'box' then 'A2' else 'A3' end;
  v_origin_profile text;
  v_post_type text;
  v_preset public.tg_address_presets%rowtype;
begin
  select coalesce(p.post_type, 'warehouse')
  into v_post_type
  from public.tg_orders o
  join public.tg_posts p on p.id = o.post_id
  where o.id = p_order_id
    and o.tg_user_id = p_tg_user_id;

  if v_post_type is null then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  v_origin_profile := case when v_post_type = 'consignment' then 'YAN' else 'MSK' end;

  update public.tg_orders
  set
    packaging_type = v_packaging_type,
    packaging_fee_rub = v_packaging_fee,
    packaging_preset = v_packaging_preset,
    origin_profile = v_origin_profile,
    package_weight = coalesce(package_weight, 400),
    package_length = coalesce(package_length, 15),
    package_width = coalesce(package_width, 10),
    package_height = coalesce(package_height, 4)
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
    cdek_pvz_code = coalesce(v_preset.pvz_code, cdek_pvz_code),
    receiver_city_code = coalesce(v_preset.city_code, receiver_city_code),
    delivery_point = coalesce(v_preset.pvz_code, delivery_point),
    address_preset_id = v_preset.id
  where id = p_order_id
    and tg_user_id = p_tg_user_id
    and status = 'awaiting_payment_proof';
end;
$$;

grant execute on function public.tg_upsert_address_preset(bigint, uuid, text, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.tg_apply_checkout_options_to_order(uuid, bigint, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
