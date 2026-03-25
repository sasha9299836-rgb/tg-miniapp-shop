alter table public.tg_post_photos
  add column if not exists item_id bigint;

update public.tg_post_photos p
set item_id = tp.item_id
from public.tg_posts tp
where p.post_id = tp.id
  and p.item_id is null;

alter table public.tg_post_photos
  alter column item_id set not null;

alter table public.tg_post_photos
  add column if not exists photo_no int;

with numbered as (
  select
    id,
    row_number() over (
      partition by post_id
      order by sort_order asc, created_at asc, id asc
    ) as rn
  from public.tg_post_photos
  where photo_no is null
)
update public.tg_post_photos p
set photo_no = n.rn
from numbered n
where p.id = n.id;

alter table public.tg_post_photos
  alter column photo_no set not null;

alter table public.tg_post_photos
  add constraint tg_post_photos_photo_no_check check (photo_no between 1 and 20);

alter table public.tg_post_photos
  add constraint tg_post_photos_post_id_photo_no_key unique (post_id, photo_no);

alter table public.tg_post_photos
  add column if not exists storage_key text;

update public.tg_post_photos
set storage_key = regexp_replace(url, '^https://[^/]+/', '')
where storage_key is null;

alter table public.tg_post_photos
  alter column storage_key set not null;

create index if not exists tg_post_photos_post_id_photo_no_idx
  on public.tg_post_photos(post_id, photo_no);
