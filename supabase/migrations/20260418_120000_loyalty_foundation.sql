create table if not exists public.user_loyalty (
  user_id bigint primary key,
  total_spent integer not null default 0,
  level integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_loyalty_total_spent_check check (total_spent >= 0),
  constraint user_loyalty_level_check check (level >= 0 and level <= 5)
);

create index if not exists user_loyalty_level_idx
  on public.user_loyalty(level);

create index if not exists user_loyalty_updated_at_idx
  on public.user_loyalty(updated_at desc);

create or replace function public.tg_loyalty_level_from_total(p_total_spent integer)
returns integer
language plpgsql
immutable
as $$
declare
  v_total integer := greatest(coalesce(p_total_spent, 0), 0);
begin
  if v_total >= 150000 then
    return 5;
  end if;
  if v_total >= 80000 then
    return 4;
  end if;
  if v_total >= 40000 then
    return 3;
  end if;
  if v_total >= 15000 then
    return 2;
  end if;
  if v_total >= 1 then
    return 1;
  end if;
  return 0;
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
end;
$$;

create or replace function public.tg_loyalty_sync_on_sale_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.tg_loyalty_recalculate_for_user(old.tg_user_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.tg_user_id is distinct from new.tg_user_id then
      perform public.tg_loyalty_recalculate_for_user(old.tg_user_id);
    end if;
    perform public.tg_loyalty_recalculate_for_user(new.tg_user_id);
    return new;
  end if;

  perform public.tg_loyalty_recalculate_for_user(new.tg_user_id);
  return new;
end;
$$;

drop trigger if exists tg_sales_sync_loyalty_after_change on public.tg_sales;
create trigger tg_sales_sync_loyalty_after_change
after insert or update or delete on public.tg_sales
for each row
execute function public.tg_loyalty_sync_on_sale_change();

insert into public.user_loyalty(user_id, total_spent, level, updated_at)
select
  s.tg_user_id as user_id,
  coalesce(sum(s.sale_price_rub), 0)::integer as total_spent,
  public.tg_loyalty_level_from_total(coalesce(sum(s.sale_price_rub), 0)::integer) as level,
  now() as updated_at
from public.tg_sales s
where s.tg_user_id is not null
group by s.tg_user_id
on conflict (user_id) do update
set
  total_spent = excluded.total_spent,
  level = excluded.level,
  updated_at = now();

create or replace function public.tg_get_loyalty_state(p_tg_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_spent integer := 0;
  v_level integer := 0;
  v_next_level integer := null;
  v_next_threshold integer := null;
  v_amount_to_next integer := 0;
  v_permanent_discount_percent integer := 0;
  v_bonus jsonb;
begin
  if p_tg_user_id is null or p_tg_user_id <= 0 then
    raise exception 'TG_USER_ID_REQUIRED';
  end if;

  perform public.tg_loyalty_recalculate_for_user(p_tg_user_id);

  select
    coalesce(ul.total_spent, 0),
    coalesce(ul.level, 0)
  into
    v_total_spent,
    v_level
  from public.user_loyalty ul
  where ul.user_id = p_tg_user_id
  limit 1;

  if not found then
    v_total_spent := 0;
    v_level := 0;
  end if;

  if v_level < 1 then
    v_next_level := 1;
    v_next_threshold := 1;
  elsif v_level = 1 then
    v_next_level := 2;
    v_next_threshold := 15000;
  elsif v_level = 2 then
    v_next_level := 3;
    v_next_threshold := 40000;
  elsif v_level = 3 then
    v_next_level := 4;
    v_next_threshold := 80000;
  elsif v_level = 4 then
    v_next_level := 5;
    v_next_threshold := 150000;
  else
    v_next_level := null;
    v_next_threshold := null;
  end if;

  if v_next_threshold is not null then
    v_amount_to_next := greatest(v_next_threshold - v_total_spent, 0);
  end if;

  if v_level >= 5 then
    v_permanent_discount_percent := 15;
  elsif v_level >= 4 then
    v_permanent_discount_percent := 10;
  end if;

  v_bonus := jsonb_build_object(
    'level_1_one_time_discount_percent', case when v_level >= 1 then 10 else 0 end,
    'level_1_one_time_discount_cap_order_rub', case when v_level >= 1 then 10000 else 0 end,
    'level_1_one_time_discount_fixed_rub', case when v_level >= 1 then 1000 else 0 end,
    'level_2_preview_early_access_hours', case when v_level >= 2 then 24 else 0 end,
    'level_2_single_use_promocodes_7_percent', case when v_level >= 2 then 3 else 0 end,
    'level_3_delivery_discount_cap_rub', case when v_level >= 3 then 300 else 0 end,
    'level_3_preview_early_access_hours', case when v_level >= 3 then 24 else 0 end,
    'permanent_discount_percent', v_permanent_discount_percent
  );

  return jsonb_build_object(
    'total_spent', v_total_spent,
    'level', v_level,
    'next_level', v_next_level,
    'next_level_threshold', v_next_threshold,
    'amount_to_next_level', v_amount_to_next,
    'bonuses', v_bonus
  );
end;
$$;

alter table public.user_loyalty enable row level security;

grant execute on function public.tg_loyalty_level_from_total(integer) to anon, authenticated;
grant execute on function public.tg_loyalty_recalculate_for_user(bigint) to anon, authenticated;
grant execute on function public.tg_get_loyalty_state(bigint) to anon, authenticated;

notify pgrst, 'reload schema';
