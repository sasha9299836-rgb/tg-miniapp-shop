create or replace function public.tg_admin_get_nalichie(p_nalichie_id bigint)
returns public.nalichie
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.nalichie%rowtype;
begin
  select *
  into v_row
  from public.nalichie
  where id = p_nalichie_id
    and status::text in ('in_stock', 'in_transit')
  limit 1;

  return v_row;
end;
$$;

grant execute on function public.tg_admin_get_nalichie(bigint) to anon, authenticated;

create or replace function public.tg_validate_post_nalichie_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if new.nalichie_id is null then
    return new;
  end if;

  select n.status::text
  into v_status
  from public.nalichie n
  where n.id = new.nalichie_id
  limit 1;

  if v_status is null then
    raise exception 'NALICHIE_NOT_FOUND:%', new.nalichie_id;
  end if;

  if v_status not in ('in_stock', 'in_transit') then
    raise exception 'NALICHIE_STATUS_NOT_ALLOWED:%', v_status;
  end if;

  return new;
end;
$$;

drop trigger if exists tg_posts_validate_nalichie_status on public.tg_posts;
create trigger tg_posts_validate_nalichie_status
before insert or update of nalichie_id on public.tg_posts
for each row
execute function public.tg_validate_post_nalichie_status();

notify pgrst, 'reload schema';
