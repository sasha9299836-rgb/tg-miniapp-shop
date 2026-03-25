drop function if exists public.tg_create_order(
  bigint,
  uuid[],
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
  uuid,
  integer,
  integer,
  integer
);

create or replace function public.tg_create_order(
  p_tg_user_id bigint,
  p_post_ids uuid[],
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
  p_address_preset_id uuid default null,
  p_delivery_base_fee_rub integer default null,
  p_delivery_markup_rub integer default null,
  p_delivery_total_fee_rub integer default null
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
  v_post_ids uuid[] := coalesce(p_post_ids, '{}'::uuid[]);
  v_primary_post_id uuid;
  v_post public.tg_posts%rowtype;
  v_count_posts int := coalesce(array_length(v_post_ids, 1), 0);
  v_found_posts int := 0;
  v_total_price int := 0;
  v_origin_profile text;
  v_current_origin_profile text;
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
  v_delivery_base_fee_rub int := p_delivery_base_fee_rub;
  v_delivery_markup_rub int := p_delivery_markup_rub;
  v_delivery_total_fee_rub int := p_delivery_total_fee_rub;
  v_count_a2 int := 0;
  v_count_a3 int := 0;
  v_count_a4 int := 0;
  v_reserved_count int := 0;
begin
  if v_count_posts = 0 then
    raise exception 'CHECKOUT_POST_IDS_REQUIRED';
  end if;

  if v_count_posts <> (select count(distinct id) from unnest(v_post_ids) as id) then
    raise exception 'CHECKOUT_DUPLICATE_POST_IDS';
  end if;

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

  if v_delivery_base_fee_rub is null
    or v_delivery_markup_rub is null
    or v_delivery_total_fee_rub is null then
    raise exception 'CHECKOUT_DELIVERY_QUOTE_REQUIRED';
  end if;

  if v_delivery_base_fee_rub < 0 or v_delivery_markup_rub < 0 or v_delivery_total_fee_rub < 0 then
    raise exception 'CHECKOUT_DELIVERY_FEE_INVALID';
  end if;

  if v_delivery_total_fee_rub <> (v_delivery_base_fee_rub + v_delivery_markup_rub) then
    raise exception 'CHECKOUT_DELIVERY_TOTAL_MISMATCH';
  end if;

  for v_post in
    select *
    from public.tg_posts
    where id = any(v_post_ids)
    for update
  loop
    v_found_posts := v_found_posts + 1;
    v_total_price := v_total_price + coalesce(v_post.price, 0);

    if v_post.status <> 'published' or v_post.sale_status <> 'available' then
      raise exception 'NOT_AVAILABLE';
    end if;

    v_current_origin_profile := nullif(trim(coalesce(v_post.origin_profile, '')), '');
    if v_current_origin_profile is null or v_current_origin_profile not in ('ODN', 'YAN') then
      raise exception 'CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED';
    end if;

    -- mixed-origin is allowed; keep first origin_profile in tg_orders for legacy compatibility
    if v_origin_profile is null then
      v_origin_profile := v_current_origin_profile;
    end if;

    case nullif(trim(coalesce(v_post.packaging_preset, '')), '')
      when 'A2' then v_count_a2 := v_count_a2 + 1;
      when 'A3' then v_count_a3 := v_count_a3 + 1;
      when 'A4' then v_count_a4 := v_count_a4 + 1;
      else
        raise exception 'CHECKOUT_POST_PACKAGING_PRESET_REQUIRED';
    end case;
  end loop;

  if v_found_posts <> v_count_posts then
    raise exception 'POST_NOT_FOUND';
  end if;

  if v_count_posts >= 3 or v_count_a2 > 0 then
    v_packaging_preset := 'A2';
  elsif v_count_a3 >= 2 or (v_count_a3 > 0 and v_count_a4 > 0) then
    v_packaging_preset := 'A2';
  elsif v_count_a4 >= 2 then
    v_packaging_preset := 'A3';
  elsif v_count_a3 = 1 then
    v_packaging_preset := 'A3';
  else
    v_packaging_preset := 'A4';
  end if;

  v_package_weight := case v_packaging_preset
    when 'A2' then 900
    when 'A3' then 600
    when 'A4' then 400
    else null
  end;
  v_package_length := case v_packaging_preset
    when 'A2' then 49
    when 'A3' then 35
    when 'A4' then 15
    else null
  end;
  v_package_width := case v_packaging_preset
    when 'A2' then 58
    when 'A3' then 42
    when 'A4' then 10
    else null
  end;
  v_package_height := case v_packaging_preset
    when 'A2' then 7
    when 'A3' then 4
    when 'A4' then 4
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

  v_primary_post_id := v_post_ids[1];

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
    delivery_point,
    delivery_base_fee_rub,
    delivery_markup_rub,
    delivery_total_fee_rub
  )
  values (
    v_order_id,
    p_tg_user_id,
    v_primary_post_id,
    'awaiting_payment_proof',
    v_reserved_until,
    v_total_price,
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
    v_delivery_point,
    v_delivery_base_fee_rub,
    v_delivery_markup_rub,
    v_delivery_total_fee_rub
  );

  insert into public.tg_order_items(order_id, post_id, price_rub, position_index)
  select
    v_order_id,
    p.id,
    coalesce(p.price, 0),
    u.ord::integer
  from unnest(v_post_ids) with ordinality as u(post_id, ord)
  join public.tg_posts p on p.id = u.post_id;

  update public.tg_posts
  set
    sale_status = 'reserved',
    reserved_until = v_reserved_until,
    reserved_order_id = v_order_id
  where id = any(v_post_ids)
    and status = 'published'
    and sale_status = 'available';

  get diagnostics v_reserved_count = row_count;
  if v_reserved_count <> v_count_posts then
    raise exception 'NOT_AVAILABLE';
  end if;

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
      'delivery_base_fee_rub', v_delivery_base_fee_rub,
      'delivery_markup_rub', v_delivery_markup_rub,
      'delivery_total_fee_rub', v_delivery_total_fee_rub,
      'post_ids', v_post_ids,
      'items_count', v_count_posts,
      'snapshot_complete', true
    )
  );

  return query select v_order_id, v_reserved_until;
end;
$$;

grant execute on function public.tg_create_order(
  bigint,
  uuid[],
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
  uuid,
  integer,
  integer,
  integer
) to anon, authenticated;

notify pgrst, 'reload schema';
