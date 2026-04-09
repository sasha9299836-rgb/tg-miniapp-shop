alter table public.tg_post_defect_photos
  add column if not exists media_type text;

update public.tg_post_defect_photos
set media_type = 'image'
where media_type is null or media_type = '';

alter table public.tg_post_defect_photos
  alter column media_type set default 'image';

alter table public.tg_post_defect_photos
  alter column media_type set not null;

alter table public.tg_post_defect_photos
  drop constraint if exists tg_post_defect_photos_media_type_check;

alter table public.tg_post_defect_photos
  add constraint tg_post_defect_photos_media_type_check
  check (media_type in ('image', 'video'));
