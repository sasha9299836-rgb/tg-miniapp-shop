ALTER TABLE public.tg_posts
ADD COLUMN is_in_update boolean NOT NULL DEFAULT false;