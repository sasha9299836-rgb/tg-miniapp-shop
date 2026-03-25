create table if not exists public.tg_order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tg_orders(id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now(),
  source text not null default 'system',
  meta jsonb not null default '{}'::jsonb
);

create index if not exists tg_order_status_events_order_changed_idx
  on public.tg_order_status_events(order_id, changed_at desc);

create index if not exists tg_order_status_events_changed_idx
  on public.tg_order_status_events(changed_at desc);

create or replace function public.tg_log_order_status_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tg_order_status_events(order_id, status, changed_at, source, meta)
    values (
      new.id,
      new.status,
      coalesce(new.created_at, now()),
      'system',
      '{}'::jsonb
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.tg_order_status_events(order_id, status, changed_at, source, meta)
      values (
        new.id,
        new.status,
        now(),
        'system',
        '{}'::jsonb
      );
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists tg_orders_log_status_on_insert on public.tg_orders;
create trigger tg_orders_log_status_on_insert
after insert on public.tg_orders
for each row
execute function public.tg_log_order_status_event();

drop trigger if exists tg_orders_log_status_on_update on public.tg_orders;
create trigger tg_orders_log_status_on_update
after update of status on public.tg_orders
for each row
execute function public.tg_log_order_status_event();

create or replace function public.tg_get_order_with_timeline(
  p_order_id uuid,
  p_tg_user_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.tg_orders%rowtype;
  v_timeline jsonb;
begin
  select *
  into v_order
  from public.tg_orders
  where id = p_order_id
    and tg_user_id = p_tg_user_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', e.status,
        'changed_at', e.changed_at,
        'source', e.source,
        'meta', e.meta
      )
      order by e.changed_at asc
    ),
    '[]'::jsonb
  )
  into v_timeline
  from public.tg_order_status_events e
  where e.order_id = p_order_id;

  return jsonb_build_object(
    'order',
    to_jsonb(v_order),
    'timeline',
    v_timeline
  );
end;
$$;

grant execute on function public.tg_get_order_with_timeline(uuid, bigint) to anon, authenticated;

alter table public.tg_order_status_events enable row level security;

drop policy if exists tg_order_status_events_dev_full_access on public.tg_order_status_events;
create policy tg_order_status_events_dev_full_access on public.tg_order_status_events
for all
using (true)
with check (true);
