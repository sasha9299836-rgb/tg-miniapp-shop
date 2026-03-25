create table if not exists public.tg_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tg_orders(id) on delete cascade,
  post_id uuid not null references public.tg_posts(id) on delete restrict,
  price_rub integer not null,
  position_index integer null,
  created_at timestamptz not null default now()
);

create index if not exists tg_order_items_order_id_idx
  on public.tg_order_items(order_id);

create index if not exists tg_order_items_post_id_idx
  on public.tg_order_items(post_id);

create unique index if not exists tg_order_items_order_post_unique_idx
  on public.tg_order_items(order_id, post_id);

insert into public.tg_order_items(order_id, post_id, price_rub, position_index)
select o.id, o.post_id, coalesce(o.price_rub, 0), 1
from public.tg_orders o
where o.post_id is not null
  and not exists (
    select 1
    from public.tg_order_items oi
    where oi.order_id = o.id
  );

alter table public.tg_sales
  drop constraint if exists tg_sales_order_id_key;

create unique index if not exists tg_sales_order_post_unique_idx
  on public.tg_sales(order_id, post_id);

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

    if v_origin_profile is null then
      v_origin_profile := v_current_origin_profile;
    elsif v_origin_profile <> v_current_origin_profile then
      raise exception 'CHECKOUT_MIXED_ORIGIN_NOT_SUPPORTED';
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
declare
  v_order public.tg_orders%rowtype;
begin
  select *
  into v_order
  from public.tg_orders
  where id = p_order_id
    and tg_user_id = p_tg_user_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if v_order.status = 'payment_proof_submitted' then
    return;
  end if;

  if v_order.status not in ('awaiting_payment_proof', 'created') then
    raise exception 'ORDER_STATUS_NOT_SUBMITTABLE:%', v_order.status;
  end if;

  if v_order.reserved_until is null or v_order.reserved_until <= now() then
    raise exception 'ORDER_RESERVATION_EXPIRED';
  end if;

  update public.tg_orders
  set
    payment_proof_key = p_payment_proof_key,
    payment_proof_uploaded_at = now(),
    status = 'payment_proof_submitted',
    reserved_until = null
  where id = p_order_id
    and tg_user_id = p_tg_user_id
    and status in ('awaiting_payment_proof', 'created');

  update public.tg_posts
  set reserved_until = null
  where reserved_order_id = p_order_id
    and sale_status = 'reserved'
    and (
      id in (select post_id from public.tg_order_items where order_id = p_order_id)
      or (
        not exists (select 1 from public.tg_order_items where order_id = p_order_id)
        and id = v_order.post_id
      )
    );

  insert into public.tg_order_events(order_id, event, payload)
  values (
    p_order_id,
    'payment_proof_submitted',
    jsonb_build_object(
      'key', p_payment_proof_key,
      'previous_status', v_order.status,
      'current_status', 'payment_proof_submitted'
    )
  );
end;
$$;

grant execute on function public.tg_submit_payment_proof(uuid, bigint, text) to anon, authenticated;

create or replace function public.tg_admin_confirm_paid_and_record_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.tg_orders%rowtype;
  v_item record;
  v_post public.tg_posts%rowtype;
  v_nalichie public.nalichie%rowtype;
  v_existing_count int;
  v_prodazhi_id bigint;
  v_data_prodazhi date := (now() at time zone 'Europe/Moscow')::date;
  v_sale_price numeric;
  v_cost_price numeric;
  v_dni_prodazhi int;
  v_chistie numeric;
  v_s_vichetom numeric;
  v_copilka numeric;
  v_nacenca numeric;
  v_snapshot jsonb;
  v_post_type text;
  v_previous_status text;
  v_current_status text;
  v_payment_already_confirmed boolean;
  v_stock_deduction_status text := 'applied';
  v_previous_post_sale_status text := null;
  v_current_post_sale_status text := null;
  v_previous_nalichie_status text := null;
  v_current_nalichie_status text := null;
  v_return_post_id uuid := null;
  v_return_nalichie_id bigint := null;
  v_items_count int := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));

  select * into v_order
  from public.tg_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  v_previous_status := coalesce(v_order.status, '');

  if v_previous_status in ('created', 'awaiting_payment_proof') then
    raise exception 'PAYMENT_CONFIRM_NOT_ALLOWED:%', v_previous_status;
  end if;

  if v_previous_status in ('rejected', 'expired', 'cancelled') then
    raise exception 'ORDER_STATUS_NOT_CONFIRMABLE:%', v_previous_status;
  end if;

  if v_previous_status not in ('payment_proof_submitted', 'payment_confirmed', 'paid', 'ready_for_pickup', 'completed') then
    raise exception 'ORDER_STATUS_NOT_CONFIRMABLE:%', v_previous_status;
  end if;

  v_payment_already_confirmed := v_previous_status in ('paid', 'ready_for_pickup', 'completed');
  v_current_status := case
    when v_previous_status in ('ready_for_pickup', 'completed') then v_previous_status
    else 'paid'
  end;

  select count(*) into v_existing_count
  from public.tg_sales
  where order_id = p_order_id;

  if v_existing_count > 0 then
    update public.tg_orders
    set
      status = v_current_status,
      payment_confirmed_at = coalesce(payment_confirmed_at, now()),
      reserved_until = null
    where id = p_order_id;

    update public.tg_posts
    set
      sale_status = 'sold',
      reserved_until = null,
      reserved_order_id = null
    where id in (
      select post_id from public.tg_order_items where order_id = p_order_id
      union
      select v_order.post_id where not exists (select 1 from public.tg_order_items where order_id = p_order_id)
    );

    return jsonb_build_object(
      'ok', true,
      'existing', true,
      'payment_already_confirmed', v_payment_already_confirmed,
      'recorded_to_prodazhi', true,
      'prodazhi_id', null,
      'previous_status', v_previous_status,
      'current_status', v_current_status,
      'post_id', coalesce((select post_id from public.tg_order_items where order_id = p_order_id order by position_index nulls first, created_at, id limit 1), v_order.post_id),
      'nalichie_id', null,
      'stock_deduction_status', 'existing',
      'previous_post_sale_status', null,
      'current_post_sale_status', 'sold',
      'previous_nalichie_status', null,
      'current_nalichie_status', null,
      'items_count', (select count(*) from public.tg_order_items where order_id = p_order_id)
    );
  end if;

  update public.tg_orders
  set
    status = v_current_status,
    payment_confirmed_at = coalesce(payment_confirmed_at, now()),
    reserved_until = null
  where id = v_order.id;

  for v_item in
    with items as (
      select oi.post_id, oi.price_rub, coalesce(oi.position_index, 2147483647) as position_index, oi.created_at, oi.id
      from public.tg_order_items oi
      where oi.order_id = p_order_id
      union all
      select v_order.post_id, coalesce(v_order.price_rub, 0), 1, v_order.created_at, gen_random_uuid()
      where not exists (select 1 from public.tg_order_items where order_id = p_order_id)
    )
    select * from items
    order by position_index, created_at, id
  loop
    v_items_count := v_items_count + 1;

    select * into v_post
    from public.tg_posts
    where id = v_item.post_id
    for update;

    if not found then
      raise exception 'POST_NOT_FOUND';
    end if;

    if v_return_post_id is null then
      v_return_post_id := v_post.id;
    end if;

    v_previous_post_sale_status := coalesce(v_post.sale_status, '');
    if v_previous_post_sale_status = 'sold' then
      raise exception 'STOCK_CONFLICT:POST_ALREADY_SOLD';
    end if;
    if v_previous_post_sale_status = 'reserved' and v_post.reserved_order_id is distinct from v_order.id then
      raise exception 'STOCK_CONFLICT:POST_RESERVED_BY_ANOTHER_ORDER';
    end if;
    if v_previous_post_sale_status <> 'reserved' or v_post.reserved_order_id is distinct from v_order.id then
      raise exception 'STOCK_CONFLICT:POST_NOT_RESERVED_FOR_ORDER';
    end if;

    update public.tg_posts
    set
      sale_status = 'sold',
      reserved_until = null,
      reserved_order_id = null
    where id = v_post.id;

    v_current_post_sale_status := 'sold';
    v_post_type := coalesce(v_post.post_type, 'warehouse');
    v_sale_price := coalesce(v_item.price_rub::numeric, v_post.price::numeric, v_order.price_rub::numeric);

    if v_sale_price is null then
      raise exception 'PRICE_NOT_FOUND';
    end if;

    v_prodazhi_id := null;
    v_previous_nalichie_status := null;
    v_current_nalichie_status := null;

    if v_post_type = 'warehouse' then
      if v_post.nalichie_id is null then
        raise exception 'WAREHOUSE_POST_REQUIRES_NALICHIE_ID';
      end if;

      select * into v_nalichie
      from public.nalichie
      where id = v_post.nalichie_id;

      if not found then
        raise exception 'NALICHIE_NOT_FOUND';
      end if;

      v_previous_nalichie_status := coalesce(v_nalichie.status, '');
      if v_previous_nalichie_status = 'sold' then
        raise exception 'STOCK_CONFLICT:NALICHIE_ALREADY_SOLD';
      end if;

      v_cost_price := case
        when coalesce(v_nalichie.obh_summa::numeric, 0) > 0 then v_nalichie.obh_summa::numeric
        else coalesce(v_nalichie.vikup_rub::numeric, 0)
      end;
      v_dni_prodazhi := case
        when v_nalichie.data_pokupki is null then null
        else (v_data_prodazhi - v_nalichie.data_pokupki::date)
      end;
      v_chistie := v_sale_price - v_cost_price;
      v_s_vichetom := round(v_chistie * 0.9);
      v_copilka := v_chistie - v_s_vichetom;
      v_nacenca := round(v_sale_price / nullif(v_cost_price, 0), 3);

      insert into public.prodazhi(
        nalichie_id,
        opisanie_veshi,
        tip_veshi,
        brend,
        razmer,
        vikup_rub,
        valuta_vikupa,
        kol_vo_valuti,
        kurs,
        dostavka,
        obh_summa,
        defekt_marker,
        defekt_text,
        data_pokupki,
        data_postupleniya,
        sezon,
        data_prodazhi,
        cena_prodazhi,
        dni_prodazhi,
        chistie,
        s_vichetom,
        copilka,
        nacenca
      )
      values (
        v_nalichie.id,
        v_nalichie.opisanie_veshi,
        v_nalichie.tip_veshi,
        v_nalichie.brend,
        v_nalichie.razmer,
        v_nalichie.vikup_rub,
        v_nalichie.valuta_vikupa,
        v_nalichie.kol_vo_valuti,
        v_nalichie.kurs,
        v_nalichie.dostavka,
        v_cost_price,
        v_nalichie.defekt_marker,
        v_nalichie.defekt_text,
        v_nalichie.data_pokupki,
        v_nalichie.data_postupleniya,
        v_nalichie.sezon,
        v_data_prodazhi,
        v_sale_price,
        v_dni_prodazhi,
        v_chistie,
        v_s_vichetom,
        v_copilka,
        v_nacenca
      )
      returning id into v_prodazhi_id;

      update public.nalichie
      set status = 'sold'
      where id = v_post.nalichie_id
        and status is distinct from 'sold';

      v_current_nalichie_status := 'sold';
      if v_return_nalichie_id is null then
        v_return_nalichie_id := v_post.nalichie_id;
      end if;
    end if;

    v_snapshot := jsonb_build_object(
      'post_id', v_post.id,
      'post_type', v_post_type,
      'title', v_post.title,
      'brand', v_post.brand,
      'size', v_post.size,
      'price_rub', v_sale_price,
      'nalichie_id', v_post.nalichie_id
    );

    insert into public.tg_sales(
      order_id,
      post_id,
      tg_user_id,
      nalichie_id,
      sale_price_rub,
      sale_date,
      recorded_to_prodazhi,
      prodazhi_id,
      post_snapshot
    )
    values (
      v_order.id,
      v_post.id,
      v_order.tg_user_id,
      case when v_post_type = 'warehouse' then v_post.nalichie_id else null end,
      v_sale_price::integer,
      v_data_prodazhi,
      v_prodazhi_id is not null,
      v_prodazhi_id,
      v_snapshot
    )
    on conflict (order_id, post_id) do nothing;
  end loop;

  insert into public.tg_order_events(order_id, event, payload)
  values (
    v_order.id,
    'confirmed',
    jsonb_build_object(
      'previous_status', v_previous_status,
      'current_status', v_current_status,
      'stock_deduction_status', v_stock_deduction_status,
      'items_count', v_items_count,
      'previous_post_sale_status', v_previous_post_sale_status,
      'current_post_sale_status', v_current_post_sale_status,
      'previous_nalichie_status', v_previous_nalichie_status,
      'current_nalichie_status', v_current_nalichie_status
    )
  );

  return jsonb_build_object(
    'ok', true,
    'existing', false,
    'payment_already_confirmed', v_payment_already_confirmed,
    'recorded_to_prodazhi', true,
    'prodazhi_id', null,
    'previous_status', v_previous_status,
    'current_status', v_current_status,
    'post_id', v_return_post_id,
    'nalichie_id', v_return_nalichie_id,
    'stock_deduction_status', v_stock_deduction_status,
    'previous_post_sale_status', v_previous_post_sale_status,
    'current_post_sale_status', v_current_post_sale_status,
    'previous_nalichie_status', v_previous_nalichie_status,
    'current_nalichie_status', v_current_nalichie_status,
    'items_count', v_items_count
  );
end;
$$;

grant execute on function public.tg_admin_confirm_paid_and_record_sale(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
