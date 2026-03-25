do $$
declare
  v_user_id_type text;
  v_existing_type text;
  v_drop record;
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
    raise exception 'Column public.tg_orders.tg_user_id not found';
  end if;

  if to_regclass('public.tg_address_presets') is null then
    execute format($fmt$
      create table public.tg_address_presets (
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
    $fmt$, v_user_id_type);
  else
    select format_type(a.atttypid, a.atttypmod)
    into v_existing_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'tg_address_presets'
      and a.attname = 'tg_user_id'
      and a.attnum > 0
      and not a.attisdropped;

    if v_existing_type is null then
      execute format('alter table public.tg_address_presets add column tg_user_id %1$s', v_user_id_type);
    elsif v_existing_type is distinct from v_user_id_type then
      execute format(
        'alter table public.tg_address_presets alter column tg_user_id type %1$s using (tg_user_id::text::%1$s)',
        v_user_id_type
      );
    end if;
  end if;

  create index if not exists tg_address_presets_user_idx
    on public.tg_address_presets (tg_user_id);

  create unique index if not exists tg_address_presets_default_unique
    on public.tg_address_presets (tg_user_id)
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

  for v_drop in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'tg_list_address_presets',
        'tg_upsert_address_preset',
        'tg_delete_address_preset'
      )
  loop
    execute format('drop function if exists %s', v_drop.signature);
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
    begin
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
          p_name,
          p_recipient_fio,
          p_recipient_phone,
          p_city,
          p_pvz,
          coalesce(p_is_default,false)
        )
        returning id into v_id;
      else
        update public.tg_address_presets
        set
          name = p_name,
          recipient_fio = p_recipient_fio,
          recipient_phone = p_recipient_phone,
          city = p_city,
          pvz = p_pvz,
          is_default = coalesce(p_is_default,false)
        where id = p_preset_id
          and tg_user_id = p_tg_user_id
        returning id into v_id;

        if v_id is null then
          raise exception 'Preset not found or not owned by user';
        end if;
      end if;

      if coalesce(p_is_default,false) then
        update public.tg_address_presets
        set is_default = false
        where tg_user_id = p_tg_user_id
          and id <> v_id;
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
end
$$;

notify pgrst, 'reload schema';
