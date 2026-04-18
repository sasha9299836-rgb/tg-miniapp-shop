alter table public.user_loyalty
  add column if not exists level1_bonus_used_at timestamptz null,
  add column if not exists level2_promos_issued_at timestamptz null;

alter table public.tg_promo_codes
  add column if not exists owner_tg_user_id bigint null;

create index if not exists tg_promo_codes_owner_tg_user_id_idx
  on public.tg_promo_codes(owner_tg_user_id)
  where deleted_at is null;

alter table public.tg_orders
  add column if not exists loyalty_level integer null,
  add column if not exists loyalty_discount_kind text null,
  add column if not exists loyalty_discount_percent integer null,
  add column if not exists loyalty_discount_amount_rub integer null,
  add column if not exists delivery_discount_amount_rub integer null,
  add column if not exists subtotal_with_all_discounts_rub integer null;

alter table public.tg_orders
  drop constraint if exists tg_orders_loyalty_discount_kind_check;

alter table public.tg_orders
  add constraint tg_orders_loyalty_discount_kind_check
  check (
    loyalty_discount_kind is null
    or loyalty_discount_kind in ('none', 'level1_one_time', 'level4_permanent', 'level5_permanent')
  );

create table if not exists public.tg_loyalty_benefit_usages (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null,
  order_id uuid not null references public.tg_orders(id) on delete cascade,
  benefit_code text not null,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  finalized_at timestamptz null,
  constraint tg_loyalty_benefit_usages_benefit_code_check check (benefit_code in ('level1_one_time'))
);

create unique index if not exists tg_loyalty_benefit_usages_order_benefit_uidx
  on public.tg_loyalty_benefit_usages(order_id, benefit_code);

create unique index if not exists tg_loyalty_benefit_usages_user_benefit_final_uidx
  on public.tg_loyalty_benefit_usages(tg_user_id, benefit_code)
  where is_final = true;

create or replace function public.tg_generate_level2_loyalty_promo_code(p_tg_user_id bigint, p_index integer)
returns text
language sql
stable
as $$
  select upper(
    substr(md5(gen_random_uuid()::text || coalesce(p_tg_user_id, 0)::text || coalesce(p_index, 0)::text || clock_timestamp()::text), 1, 4)
    || '-' ||
    substr(md5(clock_timestamp()::text || gen_random_uuid()::text), 1, 4)
    || '-' ||
    substr(md5(gen_random_uuid()::text || now()::text), 1, 4)
  );
$$;

create or replace function public.tg_ensure_level2_loyalty_promos(p_tg_user_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loyalty public.user_loyalty%rowtype;
  v_code text;
  v_inserted integer := 0;
  v_idx integer;
  v_attempt integer;
begin
  if p_tg_user_id is null or p_tg_user_id <= 0 then
    return;
  end if;

  select *
  into v_loyalty
  from public.user_loyalty
  where user_id = p_tg_user_id
  for update;

  if not found then
    return;
  end if;

  if coalesce(v_loyalty.level, 0) < 2 then
    return;
  end if;

  if v_loyalty.level2_promos_issued_at is not null then
    return;
  end if;

  for v_idx in 1..3 loop
    for v_attempt in 1..15 loop
      v_code := public.tg_generate_level2_loyalty_promo_code(p_tg_user_id, v_idx);
      begin
        insert into public.tg_promo_codes(
          code,
          type,
          discount_percent,
          status,
          active_from,
          active_to,
          expires_at,
          owner_tg_user_id
        )
        values (
          v_code,
          'single_use',
          7,
          'active',
          now(),
          null,
          null,
          p_tg_user_id
        );

        v_inserted := v_inserted + 1;
        exit;
      exception
        when unique_violation then
          if strpos(lower(SQLERRM), 'tg_promo_codes_code_lower_uidx') > 0 then
            continue;
          end if;
          raise;
      end;
    end loop;
  end loop;

  if v_inserted = 3 then
    update public.user_loyalty
    set
      level2_promos_issued_at = now(),
      updated_at = now()
    where user_id = p_tg_user_id;
  end if;
end;
$$;

create or replace function public.tg_loyalty_recalculate_for_user(p_user_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_spent integer := 0;
  v_level integer := 0;
begin
  if p_user_id is null or p_user_id <= 0 then
    return;
  end if;

  select coalesce(sum(s.sale_price_rub), 0)::integer
  into v_total_spent
  from public.tg_sales s
  where s.tg_user_id = p_user_id;

  v_level := public.tg_loyalty_level_from_total(v_total_spent);

  insert into public.user_loyalty(user_id, total_spent, level, updated_at)
  values (p_user_id, v_total_spent, v_level, now())
  on conflict (user_id) do update
  set
    total_spent = excluded.total_spent,
    level = excluded.level,
    updated_at = now();

  perform public.tg_ensure_level2_loyalty_promos(p_user_id);
end;
$$;

create or replace function public.tg_build_checkout_pricing(
  p_tg_user_id bigint,
  p_post_ids uuid[],
  p_promo_code text default null,
  p_delivery_total_fee_rub integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_ids uuid[] := coalesce(p_post_ids, '{}'::uuid[]);
  v_count_posts integer := coalesce(array_length(v_post_ids, 1), 0);
  v_count_found integer := 0;
  v_row record;
  v_subtotal integer := 0;
  v_promo_code text := nullif(trim(coalesce(p_promo_code, '')), '');
  v_promo_id uuid := null;
  v_promo_type text := null;
  v_promo_percent integer := null;
  v_promo_discount integer := 0;
  v_subtotal_with_promo integer;
  v_loyalty_level integer := 0;
  v_level1_used boolean := false;
  v_perm_percent integer := 0;
  v_loyalty_discount integer := 0;
  v_loyalty_kind text := 'none';
  v_loyalty_discount_percent integer := null;
  v_delivery_fee integer := greatest(coalesce(p_delivery_total_fee_rub, 0), 0);
  v_delivery_discount integer := 0;
  v_subtotal_with_all integer;
  v_final_total integer;
  v_promo_row record;
begin
  if p_tg_user_id is null or p_tg_user_id <= 0 then
    raise exception 'TG_USER_ID_REQUIRED';
  end if;

  if v_count_posts = 0 then
    raise exception 'PROMO_POST_IDS_REQUIRED';
  end if;

  if v_count_posts <> (select count(distinct id) from unnest(v_post_ids) as id) then
    raise exception 'PROMO_POST_IDS_DUPLICATE';
  end if;

  for v_row in
    select id, price, status, sale_status
    from public.tg_posts
    where id = any(v_post_ids)
  loop
    v_count_found := v_count_found + 1;
    if coalesce(v_row.status, '') <> 'published' then
      raise exception 'PROMO_POST_NOT_PUBLISHED';
    end if;
    if coalesce(v_row.sale_status, '') <> 'available' then
      raise exception 'PROMO_POST_NOT_AVAILABLE';
    end if;
    v_subtotal := v_subtotal + greatest(coalesce(v_row.price, 0), 0);
  end loop;

  if v_count_found <> v_count_posts then
    raise exception 'PROMO_POST_NOT_FOUND';
  end if;

  if v_promo_code is not null then
    select
      p.id,
      p.code,
      p.type,
      p.discount_percent,
      p.status,
      p.active_from,
      coalesce(p.active_to, p.expires_at) as active_to,
      p.deleted_at,
      p.owner_tg_user_id
    into v_promo_row
    from public.tg_promo_codes p
    where lower(p.code) = lower(v_promo_code)
      and p.deleted_at is null
    limit 1;

    if not found then
      raise exception 'PROMO_NOT_FOUND';
    end if;

    if v_promo_row.status = 'disabled' then
      raise exception 'PROMO_DISABLED';
    end if;
    if v_promo_row.status = 'exhausted' then
      raise exception 'PROMO_EXHAUSTED';
    end if;
    if v_promo_row.status <> 'active' then
      raise exception 'PROMO_DISABLED';
    end if;

    if v_promo_row.active_from is not null and v_promo_row.active_from > now() then
      raise exception 'PROMO_NOT_STARTED';
    end if;

    if v_promo_row.active_to is not null and v_promo_row.active_to <= now() then
      raise exception 'PROMO_EXPIRED';
    end if;

    if v_promo_row.owner_tg_user_id is not null and v_promo_row.owner_tg_user_id <> p_tg_user_id then
      raise exception 'PROMO_NOT_AVAILABLE_FOR_USER';
    end if;

    v_promo_id := v_promo_row.id;
    v_promo_type := v_promo_row.type;
    v_promo_percent := greatest(1, least(95, coalesce(v_promo_row.discount_percent, 0)));

    if v_promo_type = 'single_use' then
      if exists (
        select 1
        from public.tg_promo_usages u
        where u.promo_id = v_promo_id
          and u.tg_user_id = p_tg_user_id
          and u.is_final = true
      ) then
        raise exception 'PROMO_ALREADY_USED_BY_USER';
      end if;
    end if;

    v_promo_discount := floor((v_subtotal::numeric * v_promo_percent::numeric) / 100)::integer;
  end if;

  v_subtotal_with_promo := greatest(v_subtotal - v_promo_discount, 0);

  select
    coalesce(level, 0),
    (level1_bonus_used_at is not null)
  into
    v_loyalty_level,
    v_level1_used
  from public.user_loyalty
  where user_id = p_tg_user_id
  limit 1;

  if not found then
    v_loyalty_level := 0;
    v_level1_used := false;
  end if;

  if v_loyalty_level >= 5 then
    v_perm_percent := 15;
  elsif v_loyalty_level >= 4 then
    v_perm_percent := 10;
  else
    v_perm_percent := 0;
  end if;

  if v_promo_id is not null then
    v_loyalty_discount := 0;
    v_loyalty_kind := 'none';
    v_loyalty_discount_percent := null;
  elsif v_perm_percent > 0 then
    v_loyalty_discount := floor((v_subtotal_with_promo::numeric * v_perm_percent::numeric) / 100)::integer;
    v_loyalty_kind := case when v_perm_percent = 15 then 'level5_permanent' else 'level4_permanent' end;
    v_loyalty_discount_percent := v_perm_percent;
  elsif v_loyalty_level >= 1 and not v_level1_used then
    if v_subtotal_with_promo <= 10000 then
      v_loyalty_discount := floor((v_subtotal_with_promo::numeric * 10::numeric) / 100)::integer;
      v_loyalty_discount_percent := 10;
    else
      v_loyalty_discount := least(v_subtotal_with_promo, 1000);
      v_loyalty_discount_percent := null;
    end if;
    v_loyalty_kind := 'level1_one_time';
  end if;

  v_subtotal_with_all := greatest(v_subtotal_with_promo - v_loyalty_discount, 0);

  if v_loyalty_level >= 3 then
    v_delivery_discount := least(v_delivery_fee, 300);
  end if;

  v_final_total := v_subtotal_with_all + greatest(v_delivery_fee - v_delivery_discount, 0);

  return jsonb_build_object(
    'promo_id', v_promo_id,
    'promo_code', case when v_promo_id is null then null else v_promo_row.code end,
    'promo_type', v_promo_type,
    'promo_discount_percent', v_promo_percent,
    'subtotal_without_discount_rub', v_subtotal,
    'promo_discount_amount_rub', v_promo_discount,
    'subtotal_with_discount_rub', v_subtotal_with_promo,
    'loyalty_level', v_loyalty_level,
    'loyalty_discount_kind', v_loyalty_kind,
    'loyalty_discount_percent', v_loyalty_discount_percent,
    'loyalty_discount_amount_rub', v_loyalty_discount,
    'delivery_total_fee_rub', v_delivery_fee,
    'delivery_discount_amount_rub', v_delivery_discount,
    'subtotal_with_all_discounts_rub', v_subtotal_with_all,
    'final_total_rub', v_final_total
  );
end;
$$;

grant execute on function public.tg_generate_level2_loyalty_promo_code(bigint, integer) to anon, authenticated;
grant execute on function public.tg_ensure_level2_loyalty_promos(bigint) to anon, authenticated;
grant execute on function public.tg_build_checkout_pricing(bigint, uuid[], text, integer) to anon, authenticated;

create or replace function public.tg_admin_confirm_paid_and_record_sale_atomic(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.tg_orders%rowtype;
  v_promo_type text;
  v_promo_code text;
  v_loyalty_kind text;
begin
  select * into v_order
  from public.tg_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.promo_id is not null
    and coalesce(v_order.status, '') in ('payment_proof_submitted', 'payment_confirmed')
  then
    v_promo_type := nullif(trim(coalesce(v_order.promo_type, '')), '');
    v_promo_code := nullif(trim(coalesce(v_order.promo_code, '')), '');

    if v_promo_type is null or v_promo_type not in ('single_use', 'multi_use') then
      raise exception 'PROMO_TYPE_INVALID';
    end if;

    if v_promo_code is null then
      select nullif(trim(coalesce(code, '')), '')
      into v_promo_code
      from public.tg_promo_codes
      where id = v_order.promo_id;
    end if;

    if v_promo_code is null then
      raise exception 'PROMO_CODE_INVALID';
    end if;

    begin
      insert into public.tg_promo_usages (
        promo_id,
        promo_code,
        promo_type,
        order_id,
        tg_user_id,
        is_final,
        finalized_at
      )
      values (
        v_order.promo_id,
        v_promo_code,
        v_promo_type,
        v_order.id,
        v_order.tg_user_id,
        true,
        now()
      )
      on conflict (order_id, promo_id)
      do update set
        promo_code = excluded.promo_code,
        promo_type = excluded.promo_type,
        is_final = true,
        finalized_at = coalesce(public.tg_promo_usages.finalized_at, excluded.finalized_at);
    exception
      when unique_violation then
        if strpos(lower(SQLERRM), 'tg_promo_usages_single_final_user_uidx') > 0 then
          raise exception 'PROMO_ALREADY_USED_BY_USER';
        end if;
        raise;
    end;
  end if;

  v_loyalty_kind := nullif(trim(coalesce(v_order.loyalty_discount_kind, '')), '');
  if v_loyalty_kind = 'level1_one_time'
    and coalesce(v_order.loyalty_discount_amount_rub, 0) > 0
    and coalesce(v_order.status, '') in ('payment_proof_submitted', 'payment_confirmed')
  then
    begin
      insert into public.tg_loyalty_benefit_usages (
        tg_user_id,
        order_id,
        benefit_code,
        is_final,
        finalized_at
      )
      values (
        v_order.tg_user_id,
        v_order.id,
        'level1_one_time',
        true,
        now()
      )
      on conflict (order_id, benefit_code)
      do update set
        is_final = true,
        finalized_at = coalesce(public.tg_loyalty_benefit_usages.finalized_at, excluded.finalized_at);
    exception
      when unique_violation then
        if strpos(lower(SQLERRM), 'tg_loyalty_benefit_usages_user_benefit_final_uidx') > 0 then
          raise exception 'LOYALTY_LEVEL1_ALREADY_USED';
        end if;
        raise;
    end;

    insert into public.user_loyalty (user_id, total_spent, level, level1_bonus_used_at, updated_at)
    values (v_order.tg_user_id, 0, 0, now(), now())
    on conflict (user_id) do update
    set
      level1_bonus_used_at = coalesce(public.user_loyalty.level1_bonus_used_at, excluded.level1_bonus_used_at),
      updated_at = now();
  end if;

  return public.tg_admin_confirm_paid_and_record_sale(p_order_id);
end;
$$;

grant execute on function public.tg_admin_confirm_paid_and_record_sale_atomic(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
