create or replace function public.tg_upsert_address_preset(
  p_tg_user_id bigint,
  p_preset_id uuid default null,
  p_name text default null,
  p_recipient_fio text default null,
  p_recipient_phone text default null,
  p_city text default null,
  p_pvz text default null,
  p_is_default boolean default false,
  p_city_code text default null,
  p_pvz_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preset_id uuid;
  v_city text := trim(coalesce(p_city, ''));
  v_city_code text := nullif(trim(coalesce(p_city_code, '')), '');
  v_pvz text := trim(coalesce(p_pvz, ''));
  v_pvz_code text := nullif(trim(coalesce(p_pvz_code, '')), '');
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if trim(coalesce(p_recipient_fio, '')) = '' then
    raise exception 'RECIPIENT_FIO_REQUIRED';
  end if;

  if trim(coalesce(p_recipient_phone, '')) = '' then
    raise exception 'RECIPIENT_PHONE_REQUIRED';
  end if;

  if v_city = '' then
    raise exception 'CITY_REQUIRED';
  end if;

  if v_pvz = '' then
    raise exception 'PVZ_REQUIRED';
  end if;

  if v_city_code is null then
    raise exception 'CITY_CODE_REQUIRED';
  end if;

  if v_pvz_code is null then
    raise exception 'PVZ_CODE_REQUIRED';
  end if;

  if p_is_default then
    update public.tg_address_presets
    set is_default = false
    where tg_user_id = p_tg_user_id;
  end if;

  if p_preset_id is null then
    insert into public.tg_address_presets (
      tg_user_id,
      name,
      recipient_fio,
      recipient_phone,
      city,
      city_code,
      pvz,
      pvz_code,
      is_default
    )
    values (
      p_tg_user_id,
      trim(p_name),
      trim(p_recipient_fio),
      trim(p_recipient_phone),
      v_city,
      v_city_code,
      v_pvz,
      v_pvz_code,
      coalesce(p_is_default, false)
    )
    returning id into v_preset_id;
  else
    update public.tg_address_presets
    set
      name = trim(p_name),
      recipient_fio = trim(p_recipient_fio),
      recipient_phone = trim(p_recipient_phone),
      city = v_city,
      city_code = v_city_code,
      pvz = v_pvz,
      pvz_code = v_pvz_code,
      is_default = coalesce(p_is_default, false)
    where id = p_preset_id
      and tg_user_id = p_tg_user_id
    returning id into v_preset_id;

    if v_preset_id is null then
      raise exception 'PRESET_NOT_FOUND_OR_FORBIDDEN';
    end if;
  end if;

  return v_preset_id;
end;
$$;

grant execute on function public.tg_upsert_address_preset(bigint, uuid, text, text, text, text, text, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
