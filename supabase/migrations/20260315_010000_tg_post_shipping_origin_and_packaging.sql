alter table public.tg_posts
  add column if not exists origin_profile text null,
  add column if not exists packaging_preset text null;

update public.tg_posts
set origin_profile = case when coalesce(post_type, 'warehouse') = 'consignment' then 'YAN' else 'ODN' end
where origin_profile is null or origin_profile = '' or origin_profile = 'MSK';

update public.tg_posts
set packaging_preset = coalesce(nullif(packaging_preset, ''), 'A3');

alter table public.tg_posts
  drop constraint if exists tg_posts_origin_profile_check;

alter table public.tg_posts
  add constraint tg_posts_origin_profile_check
  check (origin_profile is null or origin_profile in ('ODN', 'YAN'));

alter table public.tg_posts
  drop constraint if exists tg_posts_packaging_preset_check;

alter table public.tg_posts
  add constraint tg_posts_packaging_preset_check
  check (packaging_preset is null or packaging_preset in ('A2', 'A3', 'A4'));

update public.tg_orders
set origin_profile = 'ODN'
where origin_profile = 'MSK';

alter table public.tg_orders
  drop constraint if exists tg_orders_origin_profile_check;

alter table public.tg_orders
  add constraint tg_orders_origin_profile_check
  check (origin_profile is null or origin_profile in ('ODN', 'YAN'));

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
  v_post public.tg_posts%rowtype;
  v_origin_profile text;
  v_packaging_preset text;
  v_package_weight int;
  v_package_length int;
  v_package_width int;
  v_package_height int;
begin
  select *
  into v_post
  from public.tg_posts
  where id = p_post_id
  for update;

  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  v_origin_profile := coalesce(
    nullif(v_post.origin_profile, ''),
    case when coalesce(v_post.post_type, 'warehouse') = 'consignment' then 'YAN' else 'ODN' end
  );
  v_packaging_preset := coalesce(nullif(v_post.packaging_preset, ''), 'A3');

  v_package_weight := case v_packaging_preset
    when 'A2' then 900
    when 'A4' then 300
    else 400
  end;
  v_package_length := case v_packaging_preset
    when 'A2' then 31
    when 'A4' then 12
    else 15
  end;
  v_package_width := case v_packaging_preset
    when 'A2' then 22
    when 'A4' then 9
    else 10
  end;
  v_package_height := case v_packaging_preset
    when 'A2' then 11
    when 'A4' then 2
    else 4
  end;

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
    floor,
    origin_profile,
    packaging_preset,
    package_weight,
    package_length,
    package_width,
    package_height
  )
  values (
    v_order_id,
    p_tg_user_id,
    p_post_id,
    'awaiting_payment_proof',
    v_reserved_until,
    v_post.price,
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
    p_floor,
    v_origin_profile,
    v_packaging_preset,
    v_package_weight,
    v_package_length,
    v_package_width,
    v_package_height
  );

  insert into public.tg_order_events(order_id, event, payload)
  values (
    v_order_id,
    'created',
    jsonb_build_object(
      'reserved_until', v_reserved_until,
      'origin_profile', v_origin_profile,
      'packaging_preset', v_packaging_preset
    )
  );

  return query select v_order_id, v_reserved_until;
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
  v_post public.tg_posts%rowtype;
  v_origin_profile text;
  v_packaging_preset text;
  v_package_weight int;
  v_package_length int;
  v_package_width int;
  v_package_height int;
  v_preset public.tg_address_presets%rowtype;
begin
  select p.*
  into v_post
  from public.tg_orders o
  join public.tg_posts p on p.id = o.post_id
  where o.id = p_order_id
    and o.tg_user_id = p_tg_user_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  v_origin_profile := coalesce(
    nullif(v_post.origin_profile, ''),
    case when coalesce(v_post.post_type, 'warehouse') = 'consignment' then 'YAN' else 'ODN' end
  );
  v_packaging_preset := coalesce(nullif(v_post.packaging_preset, ''), 'A3');

  v_package_weight := case v_packaging_preset
    when 'A2' then 900
    when 'A4' then 300
    else 400
  end;
  v_package_length := case v_packaging_preset
    when 'A2' then 31
    when 'A4' then 12
    else 15
  end;
  v_package_width := case v_packaging_preset
    when 'A2' then 22
    when 'A4' then 9
    else 10
  end;
  v_package_height := case v_packaging_preset
    when 'A2' then 11
    when 'A4' then 2
    else 4
  end;

  update public.tg_orders
  set
    packaging_type = v_packaging_type,
    packaging_fee_rub = v_packaging_fee,
    packaging_preset = v_packaging_preset,
    origin_profile = v_origin_profile,
    package_weight = v_package_weight,
    package_length = v_package_length,
    package_width = v_package_width,
    package_height = v_package_height
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

notify pgrst, 'reload schema';
