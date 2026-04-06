create or replace function public.tg_cancel_pending_order(
  p_order_id uuid,
  p_tg_user_id bigint
)
returns table(order_id uuid, previous_status text, current_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_order record;
  v_post_ids uuid[];
begin
  select id, tg_user_id, status, post_id
    into v_order
  from public.tg_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.tg_user_id is distinct from p_tg_user_id then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  if v_order.status in ('payment_proof_submitted', 'payment_confirmed', 'paid', 'ready_for_pickup', 'completed') then
    raise exception 'ORDER_ALREADY_IN_PROCESS:%', v_order.status;
  end if;

  if v_order.status in ('rejected', 'expired', 'cancelled') then
    return query select v_order.id, v_order.status::text, v_order.status::text;
    return;
  end if;

  if v_order.status not in ('created', 'awaiting_payment_proof') then
    raise exception 'ORDER_STATUS_NOT_CANCELLABLE:%', v_order.status;
  end if;

  update public.tg_orders
  set
    status = 'cancelled',
    reserved_until = null,
    updated_at = v_now
  where id = v_order.id;

  select coalesce(array_agg(distinct item.post_id), '{}'::uuid[])
    into v_post_ids
  from public.tg_order_items as item
  where item.order_id = v_order.id;

  if coalesce(array_length(v_post_ids, 1), 0) = 0 and v_order.post_id is not null then
    v_post_ids := array[v_order.post_id];
  end if;

  if coalesce(array_length(v_post_ids, 1), 0) > 0 then
    update public.tg_posts
    set
      sale_status = 'available',
      reserved_until = null,
      reserved_order_id = null
    where id = any(v_post_ids)
      and reserved_order_id = v_order.id;
  end if;

  insert into public.tg_order_events(order_id, event, payload)
  values (
    v_order.id,
    'cancelled',
    jsonb_build_object(
      'at', v_now,
      'previous_status', v_order.status,
      'current_status', 'cancelled',
      'reason', 'user_abandoned_payment'
    )
  );

  return query select v_order.id, v_order.status::text, 'cancelled'::text;
end;
$$;

grant execute on function public.tg_cancel_pending_order(uuid, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
