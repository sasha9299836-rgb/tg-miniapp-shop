alter table public.tg_posts
  add column if not exists post_type text not null default 'warehouse';

update public.tg_posts
set post_type = 'warehouse'
where post_type is null;

alter table public.tg_posts
  drop constraint if exists tg_posts_post_type_check;

alter table public.tg_posts
  add constraint tg_posts_post_type_check
  check (post_type in ('warehouse', 'consignment'));

create or replace function public.tg_admin_confirm_paid_and_record_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.tg_orders%rowtype;
  v_post public.tg_posts%rowtype;
  v_nalichie public.nalichie%rowtype;
  v_existing public.tg_sales%rowtype;
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
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));

  select * into v_existing
  from public.tg_sales
  where order_id = p_order_id;

  if found then
    update public.tg_orders
    set
      status = 'paid',
      payment_confirmed_at = coalesce(payment_confirmed_at, now()),
      reserved_until = null
    where id = p_order_id
      and status is distinct from 'paid';

    update public.tg_posts
    set
      sale_status = 'sold',
      reserved_until = null,
      reserved_order_id = null
    where id = v_existing.post_id
      and sale_status is distinct from 'sold';

    if v_existing.recorded_to_prodazhi and v_existing.nalichie_id is not null then
      update public.nalichie
      set status = 'sold'
      where id = v_existing.nalichie_id
        and status is distinct from 'sold';
    end if;

    return jsonb_build_object(
      'ok', true,
      'existing', true,
      'recorded_to_prodazhi', v_existing.recorded_to_prodazhi,
      'prodazhi_id', v_existing.prodazhi_id
    );
  end if;

  select * into v_order
  from public.tg_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  select * into v_post
  from public.tg_posts
  where id = v_order.post_id
  for update;

  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  v_post_type := coalesce(v_post.post_type, 'warehouse');
  v_sale_price := coalesce(v_order.price_rub::numeric, v_post.price::numeric);
  if v_sale_price is null then
    raise exception 'PRICE_NOT_FOUND';
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

  update public.tg_orders
  set
    status = 'paid',
    payment_confirmed_at = coalesce(payment_confirmed_at, now()),
    reserved_until = null
  where id = v_order.id;

  update public.tg_posts
  set
    sale_status = 'sold',
    reserved_until = null,
    reserved_order_id = null
  where id = v_post.id;

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
  else
    v_prodazhi_id := null;
  end if;

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
    v_order.post_id,
    v_order.tg_user_id,
    case when v_post_type = 'warehouse' then v_post.nalichie_id else null end,
    v_sale_price::integer,
    v_data_prodazhi,
    v_prodazhi_id is not null,
    v_prodazhi_id,
    v_snapshot
  );

  insert into public.tg_order_events(order_id, event, payload)
  values (
    v_order.id,
    'confirmed',
    jsonb_build_object(
      'prodazhi_id', v_prodazhi_id,
      'nalichie_id', case when v_post_type = 'warehouse' then v_post.nalichie_id else null end,
      'post_type', v_post_type
    )
  );

  return jsonb_build_object(
    'ok', true,
    'existing', false,
    'recorded_to_prodazhi', v_prodazhi_id is not null,
    'prodazhi_id', v_prodazhi_id
  );
end;
$$;

notify pgrst, 'reload schema';
