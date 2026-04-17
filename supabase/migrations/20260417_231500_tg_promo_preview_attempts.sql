create table if not exists public.tg_promo_preview_attempts (
  id bigserial primary key,
  tg_user_id bigint not null,
  promo_code text not null,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists tg_promo_preview_attempts_user_time_idx
  on public.tg_promo_preview_attempts(tg_user_id, attempted_at desc);

create index if not exists tg_promo_preview_attempts_failed_user_time_idx
  on public.tg_promo_preview_attempts(tg_user_id, attempted_at desc)
  where success = false;

