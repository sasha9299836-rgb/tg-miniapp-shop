alter table public.tg_posts
  add column if not exists has_defects boolean not null default false;

alter table public.tg_posts
  add column if not exists defects_text text null;

create table if not exists public.tg_post_defect_photos (
  id bigserial primary key,
  post_id uuid not null references public.tg_posts(id) on delete cascade,
  photo_no int not null,
  storage_key text not null,
  public_url text not null,
  created_at timestamptz not null default now(),
  constraint tg_post_defect_photos_post_photo_unique unique (post_id, photo_no),
  constraint tg_post_defect_photos_photo_no_check check (photo_no between 1 and 50)
);

alter table public.tg_post_defect_photos enable row level security;

drop policy if exists dev_full_access on public.tg_post_defect_photos;

create policy dev_full_access
on public.tg_post_defect_photos
for all
using (true)
with check (true);
