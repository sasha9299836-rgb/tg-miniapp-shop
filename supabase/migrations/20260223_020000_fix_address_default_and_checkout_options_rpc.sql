do $$
declare
  v_user_id_type text;
  v_proc record;
begin
  select format_type(a.atttypid, a.atttypmod)
  into v_user_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'tg_orders'
    and a.attname = 'tg_user_id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_user_id_type is null then
    raise exception 'public.tg_orders.tg_user_id not found';
  end if;

  execute format($sql$
    create table if not exists public.tg_address_presets (
      id uuid primary key default gen_random_uuid(),
      tg_user_id %1$s not null,
      name text not null,
      recipient_fio text not null,
      recipient_phone text not null,
      city text not null,
      pvz text not null,
      is_default boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$, v_user_id_type);

  create index if not exists tg_address_presets_user_idx
    on public.tg_address_presets(tg_user_id);

  create unique index if not exists tg_address_presets_default_unique
    on public.tg_address_presets(tg_user_id)
    where is_default = true;

  create or replace function public.tg_set_updated_at()
  returns trigger
  language plpgsql
  as $fn$
  begin
    new.updated_at = now();
    return new;
  end;
  $fn$;

  drop trigger if exists tg_address_presets_set_updated_at on public.tg_address_presets;
  create trigger tg_address_presets_set_updated_at
  before update on public.tg_address_presets
  for each row
  execute function public.tg_set_updated_at();

  alter table public.tg_orders
    add column if not exists packaging_type text not null default 'standard',
    add column if not exists packaging_fee_rub int not null default 0,
    add column if not exists address_preset_id uuid null references public.tg_address_presets(id) on delete set null,
    add column if not exists pvz text null;

  alter table public.tg_orders
    drop constraint if exists tg_orders_packaging_type_check;

  alter table public.tg_orders
    add constraint tg_orders_packaging_type_check
    check (packaging_type in ('standard', 'box'));

  for v_proc in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'tg_list_address_presets',
        'tg_upsert_address_preset',
        'tg_delete_address_preset',
        'tg_apply_checkout_options_to_order'
      )
  loop
    execute format('drop function if exists %s', v_proc.signature);
  end loop;

  execute format($sql$
    create function public.tg_list_address_presets(
      p_tg_user_id %1$s
    )
    returns setof public.tg_address_presets
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      return query
      select *
      from public.tg_address_presets
      where tg_user_id = p_tg_user_id
      order by is_default desc, created_at asc;
    end;
    $fn$
  $sql$, v_user_id_type);

  execute format($sql$
    create function public.tg_upsert_address_preset(
      p_tg_user_id %1$s,
      p_preset_id uuid,
      p_name text,
      p_recipient_fio text,
      p_recipient_phone text,
      p_city text,
      p_pvz text,
      p_is_default boolean default false
    )
    returns uuid
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    declare
      v_id uuid;
      v_make_default boolean := coalesce(p_is_default, false);
    begin
      if nullif(trim(coalesce(p_name, '')), '') is null then
        raise exception 'NAME_REQUIRED';
      end if;
      if nullif(trim(coalesce(p_recipient_fio, '')), '') is null then
        raise exception 'FIO_REQUIRED';
      end if;
      if nullif(trim(coalesce(p_recipient_phone, '')), '') is null then
        raise exception 'PHONE_REQUIRED';
      end if;
      if nullif(trim(coalesce(p_city, '')), '') is null then
        raise exception 'CITY_REQUIRED';
      end if;
      if nullif(trim(coalesce(p_pvz, '')), '') is null then
        raise exception 'PVZ_REQUIRED';
      end if;

      if v_make_default then
        update public.tg_address_presets
        set is_default = false
        where tg_user_id = p_tg_user_id;
      end if;

      if p_preset_id is null then
        insert into public.tg_address_presets(
          tg_user_id,
          name,
          recipient_fio,
          recipient_phone,
          city,
          pvz,
          is_default
        )
        values (
          p_tg_user_id,
          trim(p_name),
          trim(p_recipient_fio),
          trim(p_recipient_phone),
          trim(p_city),
          trim(p_pvz),
          v_make_default
        )
        returning id into v_id;
      else
        update public.tg_address_presets
        set
          name = trim(p_name),
          recipient_fio = trim(p_recipient_fio),
          recipient_phone = trim(p_recipient_phone),
          city = trim(p_city),
          pvz = trim(p_pvz),
          is_default = v_make_default
        where id = p_preset_id
          and tg_user_id = p_tg_user_id
        returning id into v_id;

        if v_id is null then
          raise exception 'PRESET_NOT_FOUND_OR_FORBIDDEN';
        end if;
      end if;

      return v_id;
    end;
    $fn$
  $sql$, v_user_id_type);

  execute format($sql$
    create function public.tg_delete_address_preset(
      p_tg_user_id %1$s,
      p_preset_id uuid
    )
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      delete from public.tg_address_presets
      where id = p_preset_id
        and tg_user_id = p_tg_user_id;
    end;
    $fn$
  $sql$, v_user_id_type);

  execute format($sql$
    create function public.tg_apply_checkout_options_to_order(
      p_order_id uuid,
      p_tg_user_id %1$s,
      p_packaging_type text,
      p_address_preset_id uuid
    )
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    declare
      v_packaging_type text := case when p_packaging_type = 'box' then 'box' else 'standard' end;
      v_packaging_fee int := case when p_packaging_type = 'box' then 150 else 0 end;
      v_preset public.tg_address_presets%%rowtype;
    begin
      update public.tg_orders
      set
        packaging_type = v_packaging_type,
        packaging_fee_rub = v_packaging_fee
      where id = p_order_id
        and tg_user_id = p_tg_user_id
        and status = 'awaiting_payment_proof';

      if not found then
        raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
      end if;

      if p_address_preset_id is null then
        return;
      end if;

      select *
      into v_preset
      from public.tg_address_presets
      where id = p_address_preset_id
        and tg_user_id = p_tg_user_id;

      if not found then
        raise exception 'ADDRESS_NOT_FOUND_OR_FORBIDDEN';
      end if;

      update public.tg_orders
      set
        fio = v_preset.recipient_fio,
        phone = v_preset.recipient_phone,
        city = v_preset.city,
        pvz = v_preset.pvz,
        cdek_pvz_address = v_preset.pvz,
        address_preset_id = v_preset.id
      where id = p_order_id
        and tg_user_id = p_tg_user_id
        and status = 'awaiting_payment_proof';
    end;
    $fn$
  $sql$, v_user_id_type);

  execute format(
    'grant execute on function public.tg_list_address_presets(%1$s) to anon, authenticated',
    v_user_id_type
  );
  execute format(
    'grant execute on function public.tg_upsert_address_preset(%1$s, uuid, text, text, text, text, text, boolean) to anon, authenticated',
    v_user_id_type
  );
  execute format(
    'grant execute on function public.tg_delete_address_preset(%1$s, uuid) to anon, authenticated',
    v_user_id_type
  );
  execute format(
    'grant execute on function public.tg_apply_checkout_options_to_order(uuid, %1$s, text, uuid) to anon, authenticated',
    v_user_id_type
  );
end
$$;

notify pgrst, 'reload schema';
