alter table public.tg_posts
  add column if not exists status text not null default 'draft';

alter table public.tg_posts
  add column if not exists scheduled_at timestamptz null;

alter table public.tg_posts
  add column if not exists published_at timestamptz null;

alter table public.tg_posts
  alter column item_id drop not null;

alter table public.tg_posts
  drop constraint if exists tg_posts_status_check;

alter table public.tg_posts
  add constraint tg_posts_status_check check (status in ('draft', 'scheduled', 'published', 'archived'));

create index if not exists tg_posts_status_scheduled_at_idx
  on public.tg_posts(status, scheduled_at);
