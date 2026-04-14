alter table public.tg_posts
  add column if not exists video_url text null;

notify pgrst, 'reload schema';
