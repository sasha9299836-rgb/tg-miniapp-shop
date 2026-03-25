create extension if not exists pgcrypto;

create table if not exists public.tg_posts (
  id uuid primary key default gen_random_uuid(),
  item_id bigint not null,
  title text not null,
  brand text null,
  size text null,
  price integer not null,
  description text not null,
  condition text not null,
  has_defects boolean not null default false,
  defects_text text null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id),
  constraint tg_posts_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.tg_post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.tg_posts(id) on delete cascade,
  url text not null,
  kind text not null default 'main',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint tg_post_photos_kind_check check (kind in ('main', 'defect'))
);

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

alter table public.tg_posts enable row level security;
alter table public.tg_post_photos enable row level security;

drop policy if exists dev_full_access on public.tg_posts;
drop policy if exists dev_full_access on public.tg_post_photos;

-- DEV ONLY: open access for rapid admin UI testing. Tighten policies later.
create policy dev_full_access
on public.tg_posts
for all
using (true)
with check (true);

-- DEV ONLY: open access for rapid admin UI testing. Tighten policies later.
create policy dev_full_access
on public.tg_post_photos
for all
using (true)
with check (true);
