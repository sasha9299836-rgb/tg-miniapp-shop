alter table public.tg_promo_codes
  add column if not exists active_from timestamptz null,
  add column if not exists active_to timestamptz null;

update public.tg_promo_codes
set active_from = coalesce(active_from, created_at)
where active_from is null;

update public.tg_promo_codes
set active_to = coalesce(active_to, expires_at)
where active_to is null
  and expires_at is not null;

alter table public.tg_promo_codes
  drop constraint if exists tg_promo_codes_active_range_check;

alter table public.tg_promo_codes
  add constraint tg_promo_codes_active_range_check
  check (
    active_from is null
    or active_to is null
    or active_to > active_from
  );

create index if not exists tg_promo_codes_active_from_idx
  on public.tg_promo_codes(active_from);

create index if not exists tg_promo_codes_active_to_idx
  on public.tg_promo_codes(active_to);

notify pgrst, 'reload schema';
