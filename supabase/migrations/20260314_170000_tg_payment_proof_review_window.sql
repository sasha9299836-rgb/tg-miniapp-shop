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
  where id = v_order.post_id
    and reserved_order_id = p_order_id
    and sale_status = 'reserved';

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

notify pgrst, 'reload schema';
