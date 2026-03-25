alter table public.tg_posts
  add column if not exists scheduled_at timestamptz null;

alter table public.tg_posts
  add column if not exists published_at timestamptz null;

alter table public.tg_posts
  add column if not exists updated_at timestamptz not null default now();

alter table public.tg_posts
  drop constraint if exists tg_posts_status_check;

alter table public.tg_posts
  add constraint tg_posts_status_check check (status in ('draft', 'scheduled', 'published', 'archived'));

create index if not exists tg_posts_status_scheduled_at_idx on public.tg_posts(status, scheduled_at);
create index if not exists tg_posts_status_published_at_idx on public.tg_posts(status, published_at);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tg_posts_set_updated_at on public.tg_posts;

create trigger tg_posts_set_updated_at
before update on public.tg_posts
for each row
execute function public.tg_set_updated_at();

create or replace function public.tg_publish_due_posts(batch_size int default 50)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select p.id
    from public.tg_posts p
    where p.status = 'scheduled'
      and p.scheduled_at is not null
      and p.scheduled_at <= now()
    order by p.scheduled_at asc, p.id asc
    for update skip locked
    limit greatest(batch_size, 1)
  ),
  updated as (
    update public.tg_posts p
    set
      status = 'published',
      published_at = now(),
      scheduled_at = null,
      updated_at = now()
    from due
    where p.id = due.id
    returning p.id
  )
  select updated.id from updated;
end;
$$;
