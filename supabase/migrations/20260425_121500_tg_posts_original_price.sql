alter table public.tg_posts
  add column if not exists original_price integer null;

