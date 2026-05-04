alter table public.tg_drop_teasers
  add column if not exists is_public_immediately boolean not null default false;

create or replace function public.tg_get_active_drop_teaser_for_user(p_tg_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teaser public.tg_drop_teasers%rowtype;
  v_level integer := 0;
  v_published_at timestamptz;
  v_has_early_access boolean := false;
  v_is_open_for_all boolean := false;
  v_is_public_immediately boolean := false;
begin
  if p_tg_user_id is null or p_tg_user_id <= 0 then
    raise exception 'TG_USER_ID_REQUIRED';
  end if;

  select *
  into v_teaser
  from public.tg_drop_teasers
  where is_active = true
  order by coalesce(published_at, updated_at, created_at) desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(level, 0)
  into v_level
  from public.user_loyalty
  where user_id = p_tg_user_id
  limit 1;

  if not found then
    v_level := 0;
  end if;

  v_published_at := coalesce(v_teaser.published_at, v_teaser.updated_at, v_teaser.created_at);
  v_has_early_access := v_level >= 2;
  v_is_open_for_all := now() >= (v_published_at + interval '24 hours');
  v_is_public_immediately := coalesce(v_teaser.is_public_immediately, false);

  if not (v_is_public_immediately or v_has_early_access or v_is_open_for_all) then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_teaser.id,
    'title', v_teaser.title,
    'short_text', v_teaser.short_text,
    'details', v_teaser.details,
    'preview_images', coalesce(v_teaser.preview_images, '{}'::text[]),
    'item_count', v_teaser.item_count,
    'drop_date', v_teaser.drop_date,
    'highlights', coalesce(v_teaser.highlights, '{}'::text[]),
    'is_active', v_teaser.is_active,
    'updated_at', v_teaser.updated_at,
    'published_at', v_published_at,
    'is_public_immediately', v_is_public_immediately
  );
end;
$$;

notify pgrst, 'reload schema';
