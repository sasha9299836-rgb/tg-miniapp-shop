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

      -- FIX: status_enum -> text before coalesce, to avoid casting '' to enum
      v_previous_nalichie_status := coalesce(v_nalichie.status::text, '');
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
