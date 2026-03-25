drop function if exists public.tg_create_order(
  bigint,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

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
  p_floor text default null,
  p_receiver_city_code text default null,
  p_delivery_point text default null,
  p_packaging_type text default 'standard',
  p_address_preset_id uuid default null
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
  v_packaging_type text := case when p_packaging_type = 'box' then 'box' else 'standard' end;
  v_packaging_fee int := case when p_packaging_type = 'box' then 150 else 0 end;
  v_receiver_city_code text := nullif(trim(coalesce(p_receiver_city_code, '')), '');
  v_delivery_point text := nullif(trim(coalesce(p_delivery_point, p_cdek_pvz_code, '')), '');
  v_fio text := nullif(trim(coalesce(p_fio, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_package_weight int;
  v_package_length int;
  v_package_width int;
  v_package_height int;
begin
  if coalesce(p_delivery_type, '') not in ('pickup', 'door') then
    raise exception 'CHECKOUT_DELIVERY_TYPE_NOT_SUPPORTED';
  end if;

  if v_fio is null or v_phone is null then
    raise exception 'CHECKOUT_RECIPIENT_REQUIRED';
  end if;

  if p_delivery_type = 'pickup' then
    if v_receiver_city_code is null then
      raise exception 'CHECKOUT_RECEIVER_CITY_CODE_REQUIRED';
    end if;
    if v_delivery_point is null then
      raise exception 'CHECKOUT_DELIVERY_POINT_REQUIRED';
    end if;
  end if;

  select *
  into v_post
  from public.tg_posts
  where id = p_post_id
  for update;

  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  v_origin_profile := nullif(trim(coalesce(v_post.origin_profile, '')), '');
  if v_origin_profile is null or v_origin_profile not in ('ODN', 'YAN') then
    raise exception 'CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED';
  end if;

  v_packaging_preset := nullif(trim(coalesce(v_post.packaging_preset, '')), '');
  if v_packaging_preset is null or v_packaging_preset not in ('A2', 'A3', 'A4') then
    raise exception 'CHECKOUT_POST_PACKAGING_PRESET_REQUIRED';
  end if;

  v_package_weight := case v_packaging_preset
    when 'A2' then 900
    when 'A4' then 300
    when 'A3' then 400
    else null
  end;
  v_package_length := case v_packaging_preset
    when 'A2' then 31
    when 'A4' then 12
    when 'A3' then 15
    else null
  end;
  v_package_width := case v_packaging_preset
    when 'A2' then 22
    when 'A4' then 9
    when 'A3' then 10
    else null
  end;
  v_package_height := case v_packaging_preset
    when 'A2' then 11
    when 'A4' then 2
    when 'A3' then 4
    else null
  end;

  if v_package_weight is null
    or v_package_length is null
    or v_package_width is null
    or v_package_height is null
    or v_package_weight <= 0
    or v_package_length <= 0
    or v_package_width <= 0
    or v_package_height <= 0
  then
    raise exception 'CHECKOUT_PACKAGE_DIMENSIONS_REQUIRED';
  end if;

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
    packaging_type,
    packaging_fee_rub,
    address_preset_id,
    origin_profile,
    packaging_preset,
    package_weight,
    package_length,
    package_width,
    package_height,
    receiver_city_code,
    delivery_point
  )
  values (
    v_order_id,
    p_tg_user_id,
    p_post_id,
    'awaiting_payment_proof',
    v_reserved_until,
    v_post.price,
    p_delivery_type,
    v_fio,
    v_phone,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_cdek_pvz_code, '')), ''),
    nullif(trim(coalesce(p_cdek_pvz_address, '')), ''),
    nullif(trim(coalesce(p_street, '')), ''),
    nullif(trim(coalesce(p_house, '')), ''),
    nullif(trim(coalesce(p_entrance, '')), ''),
    nullif(trim(coalesce(p_apartment, '')), ''),
    nullif(trim(coalesce(p_floor, '')), ''),
    v_packaging_type,
    v_packaging_fee,
    p_address_preset_id,
    v_origin_profile,
    v_packaging_preset,
    v_package_weight,
    v_package_length,
    v_package_width,
    v_package_height,
    v_receiver_city_code,
    v_delivery_point
  );

  insert into public.tg_order_events(order_id, event, payload)
  values (
    v_order_id,
    'created',
    jsonb_build_object(
      'reserved_until', v_reserved_until,
      'origin_profile', v_origin_profile,
      'packaging_preset', v_packaging_preset,
      'receiver_city_code', v_receiver_city_code,
      'delivery_point', v_delivery_point,
      'snapshot_complete', true
    )
  );

  return query select v_order_id, v_reserved_until;
end;
$$;

grant execute on function public.tg_create_order(
  bigint,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
) to anon, authenticated;

notify pgrst, 'reload schema';
