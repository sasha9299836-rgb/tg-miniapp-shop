create or replace function public.tg_create_order_with_pricing_snapshot(
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
  p_delivery_total_fee_rub integer default null,
  p_promo_id uuid default null,
  p_promo_code text default null,
  p_promo_type text default null,
  p_promo_discount_percent integer default null,
  p_subtotal_without_discount_rub integer default null,
  p_promo_discount_amount_rub integer default null,
  p_subtotal_with_discount_rub integer default null,
  p_final_total_rub integer default null,
  p_loyalty_level integer default null,
  p_loyalty_discount_kind text default null,
  p_loyalty_discount_percent integer default null,
  p_loyalty_discount_amount_rub integer default null,
  p_delivery_discount_amount_rub integer default null,
  p_subtotal_with_all_discounts_rub integer default null
)
returns table(order_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created record;
  v_loyalty_kind text := coalesce(nullif(trim(coalesce(p_loyalty_discount_kind, '')), ''), 'none');
  v_loyalty_percent integer := case
    when p_loyalty_discount_percent is null then null
    else greatest(1, p_loyalty_discount_percent)
  end;
  v_loyalty_amount integer := greatest(coalesce(p_loyalty_discount_amount_rub, 0), 0);
  v_delivery_total integer := greatest(coalesce(p_delivery_total_fee_rub, 0), 0);
  v_delivery_discount integer := least(greatest(coalesce(p_delivery_discount_amount_rub, 0), 0), v_delivery_total);
  v_packaging_fee integer := case when p_packaging_type = 'box' then 150 else 0 end;
  v_subtotal_with_all integer;
  v_final_total integer;
begin
  if v_loyalty_kind not in ('none', 'level1_one_time', 'level4_permanent', 'level5_permanent') then
    raise exception 'LOYALTY_SNAPSHOT_KIND_INVALID';
  end if;

  if v_loyalty_kind = 'none' then
    v_loyalty_percent := null;
  end if;

  if p_subtotal_with_all_discounts_rub is null then
    v_subtotal_with_all := greatest(coalesce(p_subtotal_with_discount_rub, 0) - v_loyalty_amount, 0);
  else
    v_subtotal_with_all := greatest(p_subtotal_with_all_discounts_rub, 0);
  end if;

  v_final_total := greatest(
    coalesce(
      p_final_total_rub,
      v_subtotal_with_all + greatest(v_delivery_total - v_delivery_discount, 0) + v_packaging_fee
    ),
    0
  );

  select *
  into v_created
  from public.tg_create_order(
    p_tg_user_id,
    p_post_ids,
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
    p_receiver_city_code,
    p_delivery_point,
    p_packaging_type,
    p_address_preset_id,
    p_delivery_base_fee_rub,
    p_delivery_markup_rub,
    p_delivery_total_fee_rub,
    p_promo_id,
    p_promo_code,
    p_promo_type,
    p_promo_discount_percent,
    p_subtotal_without_discount_rub,
    p_promo_discount_amount_rub,
    p_subtotal_with_discount_rub,
    p_final_total_rub
  );

  if not found then
    raise exception 'CREATE_ORDER_FAILED';
  end if;

  update public.tg_orders
  set
    price_rub = v_subtotal_with_all,
    final_total_rub = v_final_total,
    loyalty_level = case when p_loyalty_level is null then null else greatest(0, p_loyalty_level) end,
    loyalty_discount_kind = v_loyalty_kind,
    loyalty_discount_percent = v_loyalty_percent,
    loyalty_discount_amount_rub = v_loyalty_amount,
    delivery_discount_amount_rub = v_delivery_discount,
    subtotal_with_all_discounts_rub = v_subtotal_with_all
  where id = v_created.order_id;

  if not found then
    raise exception 'ORDER_PRICING_SNAPSHOT_SAVE_FAILED';
  end if;

  return query
  select v_created.order_id, v_created.reserved_until;
end;
$$;

grant execute on function public.tg_create_order_with_pricing_snapshot(
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
  integer,
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  integer,
  integer,
  integer,
  integer
) to anon, authenticated;

notify pgrst, 'reload schema';
