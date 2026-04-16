create table if not exists public.tg_drop_teasers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_text text not null,
  details text null,
  preview_images text[] not null default '{}'::text[],
  item_count integer null,
  drop_date timestamptz null,
  highlights text[] not null default '{}'::text[],
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tg_drop_teasers
  add constraint tg_drop_teasers_preview_images_limit
  check (coalesce(array_length(preview_images, 1), 0) <= 4);

create unique index if not exists tg_drop_teasers_single_active_uidx
  on public.tg_drop_teasers (is_active)
  where is_active = true;

alter table public.tg_drop_teasers enable row level security;

drop policy if exists tg_drop_teasers_public_read on public.tg_drop_teasers;
create policy tg_drop_teasers_public_read on public.tg_drop_teasers
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.tg_drop_teasers from anon, authenticated;

notify pgrst, 'reload schema';
