create or replace function public.tg_enforce_unique_post_nalichie_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nalichie_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.tg_posts p
    where p.nalichie_id = new.nalichie_id
      and p.id <> new.id
    limit 1
  ) then
    raise exception 'NALICHIE_ALREADY_USED:%', new.nalichie_id
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_posts_enforce_unique_nalichie_id on public.tg_posts;
create trigger tg_posts_enforce_unique_nalichie_id
before insert or update of nalichie_id on public.tg_posts
for each row
execute function public.tg_enforce_unique_post_nalichie_id();

notify pgrst, 'reload schema';
