alter table public.tg_posts
  add column if not exists nalichie_id bigint null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tg_posts_nalichie_id_fkey'
      and conrelid = 'public.tg_posts'::regclass
  ) then
    alter table public.tg_posts
      add constraint tg_posts_nalichie_id_fkey
      foreign key (nalichie_id) references public.nalichie(id) on delete set null;
  end if;
end
$$;

create index if not exists tg_posts_nalichie_id_idx
  on public.tg_posts(nalichie_id);

create table if not exists public.tg_sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.tg_orders(id) on delete cascade,
  post_id uuid not null references public.tg_posts(id) on delete restrict,
  tg_user_id bigint not null,
  nalichie_id bigint null references public.nalichie(id) on delete set null,
  sale_price_rub integer not null,
  sale_date date not null default ((now() at time zone 'Europe/Moscow')::date),
  recorded_to_prodazhi boolean not null default false,
  prodazhi_id bigint null,
  post_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tg_sales
  add column if not exists sale_price_rub integer,
  add column if not exists sale_date date,
  add column if not exists recorded_to_prodazhi boolean,
  add column if not exists post_snapshot jsonb;

update public.tg_sales
set
  sale_price_rub = coalesce(sale_price_rub, 0),
  sale_date = coalesce(sale_date, (now() at time zone 'Europe/Moscow')::date),
  recorded_to_prodazhi = coalesce(recorded_to_prodazhi, prodazhi_id is not null, false),
  post_snapshot = coalesce(post_snapshot, '{}'::jsonb)
where sale_price_rub is null
   or sale_date is null
   or recorded_to_prodazhi is null
   or post_snapshot is null;

alter table public.tg_sales
  alter column sale_price_rub set not null,
  alter column sale_date set not null,
  alter column recorded_to_prodazhi set not null,
  alter column post_snapshot set not null;

alter table public.tg_sales
  alter column sale_date set default ((now() at time zone 'Europe/Moscow')::date),
  alter column recorded_to_prodazhi set default false,
  alter column post_snapshot set default '{}'::jsonb;

create index if not exists tg_sales_post_id_idx
  on public.tg_sales(post_id);

create index if not exists tg_sales_nalichie_id_idx
  on public.tg_sales(nalichie_id);

create index if not exists idx_tg_sales_tg_user_id
  on public.tg_sales(tg_user_id);

create index if not exists idx_tg_sales_sale_date
  on public.tg_sales(sale_date desc);

drop function if exists public.tg_admin_get_nalichie(bigint);

create function public.tg_admin_get_nalichie(p_nalichie_id bigint)
returns public.nalichie
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.nalichie%rowtype;
begin
  select *
  into v_row
  from public.nalichie
  where id = p_nalichie_id
  limit 1;

  return v_row;
end;
$$;

grant execute on function public.tg_admin_get_nalichie(bigint) to anon, authenticated;

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
  v_cena_prodazhi numeric;
  v_cost_price numeric;
  v_dni_prodazhi int;
  v_chistie numeric;
  v_s_vichetom numeric;
  v_copilka numeric;
  v_nacenca numeric;
  v_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));

  select *
  into v_existing
  from public.tg_sales s
  where s.order_id = p_order_id;

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

    return jsonb_build_object(
      'ok', true,
      'existing', true,
      'recorded_to_prodazhi', v_existing.recorded_to_prodazhi,
      'prodazhi_id', v_existing.prodazhi_id
    );
  end if;

  select *
  into v_order
  from public.tg_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  select *
  into v_post
  from public.tg_posts
  where id = v_order.post_id
  for update;

  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  v_cena_prodazhi := coalesce(v_order.price_rub::numeric, v_post.price::numeric);
  if v_cena_prodazhi is null then
    raise exception 'PRICE_NOT_FOUND';
  end if;

  v_snapshot := jsonb_build_object(
    'post_id', v_post.id,
    'title', v_post.title,
    'brand', v_post.brand,
    'size', v_post.size,
    'price_rub', v_cena_prodazhi,
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

  if v_post.nalichie_id is not null then
    select *
    into v_nalichie
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
    v_chistie := v_cena_prodazhi - v_cost_price;
    v_s_vichetom := round(v_chistie * 0.9);
    v_copilka := v_chistie - v_s_vichetom;
    v_nacenca := round(v_cena_prodazhi / nullif(v_cost_price, 0), 3);

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
      v_cena_prodazhi,
      v_dni_prodazhi,
      v_chistie,
      v_s_vichetom,
      v_copilka,
      v_nacenca
    )
    returning id into v_prodazhi_id;
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
    v_post.nalichie_id,
    v_cena_prodazhi::integer,
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
      'nalichie_id', v_post.nalichie_id
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

grant execute on function public.tg_admin_confirm_paid_and_record_sale(uuid) to anon, authenticated;

alter table public.tg_orders
  drop constraint if exists tg_orders_status_check;

alter table public.tg_orders
  add constraint tg_orders_status_check check (status in (
    'created',
    'awaiting_payment_proof',
    'payment_proof_submitted',
    'payment_confirmed',
    'paid',
    'rejected',
    'expired',
    'cancelled'
  ));

notify pgrst, 'reload schema';
