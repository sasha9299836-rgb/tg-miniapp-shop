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

  return public.tg_admin_confirm_paid_and_record_sale(p_order_id);
end;
$$;

grant execute on function public.tg_admin_confirm_paid_and_record_sale_atomic(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
