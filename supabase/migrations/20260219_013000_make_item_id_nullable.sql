alter table public.tg_posts
  alter column item_id drop not null;

alter table public.tg_post_photos
  alter column item_id drop not null;
