alter table public.tg_orders
  add column if not exists shipment_create_in_progress boolean not null default false,
  add column if not exists shipment_create_started_at timestamptz null;

create or replace function public.tg_try_start_shipment_create(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.tg_orders%rowtype;
begin
  update public.tg_orders
  set
    shipment_create_in_progress = true,
    shipment_create_started_at = now()
  where id = p_order_id
    and cdek_uuid is null
    and shipment_create_in_progress = false
  returning * into v_order;

  if found then
    return jsonb_build_object(
      'status', 'acquired',
      'order', to_jsonb(v_order)
    );
  end if;

  select *
  into v_order
  from public.tg_orders
  where id = p_order_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_order.cdek_uuid is not null then
    return jsonb_build_object(
      'status', 'existing',
      'order', to_jsonb(v_order)
    );
  end if;

  if v_order.shipment_create_in_progress then
    return jsonb_build_object(
      'status', 'in_progress',
      'order', to_jsonb(v_order)
    );
  end if;

  return jsonb_build_object(
    'status', 'unavailable',
    'order', to_jsonb(v_order)
  );
end;
$$;

grant execute on function public.tg_try_start_shipment_create(uuid) to anon, authenticated;

create or replace function public.tg_recover_stale_shipment_create(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.tg_orders%rowtype;
begin
  update public.tg_orders
  set
    shipment_create_in_progress = false,
    shipment_create_started_at = null
  where id = p_order_id
    and cdek_uuid is null
    and shipment_create_in_progress = true
    and shipment_create_started_at is not null
    and shipment_create_started_at <= now() - interval '15 minutes'
  returning * into v_order;

  if found then
    return jsonb_build_object(
      'status', 'recovered',
      'order', to_jsonb(v_order)
    );
  end if;

  select *
  into v_order
  from public.tg_orders
  where id = p_order_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_order.cdek_uuid is not null then
    return jsonb_build_object(
      'status', 'already_created',
      'order', to_jsonb(v_order)
    );
  end if;

  if coalesce(v_order.shipment_create_in_progress, false) = false then
    return jsonb_build_object(
      'status', 'not_locked',
      'order', to_jsonb(v_order)
    );
  end if;

  return jsonb_build_object(
    'status', 'not_stale',
    'order', to_jsonb(v_order)
  );
end;
$$;

grant execute on function public.tg_recover_stale_shipment_create(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
