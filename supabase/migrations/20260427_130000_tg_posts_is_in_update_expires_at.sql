alter table public.tg_posts
  add column if not exists is_in_update_expires_at timestamptz null;

create or replace function public.tg_posts_set_is_in_update_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.is_in_update is true then
    if tg_op = 'INSERT' then
      if new.is_in_update_expires_at is null then
        new.is_in_update_expires_at := now() + interval '24 hours';
      end if;
    elsif tg_op = 'UPDATE' then
      if old.is_in_update is distinct from true and new.is_in_update_expires_at is null then
        new.is_in_update_expires_at := now() + interval '24 hours';
      end if;
    end if;
  else
    new.is_in_update_expires_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tg_posts_set_is_in_update_expiry on public.tg_posts;

create trigger trg_tg_posts_set_is_in_update_expiry
before insert or update of is_in_update, is_in_update_expires_at
on public.tg_posts
for each row
execute function public.tg_posts_set_is_in_update_expiry();