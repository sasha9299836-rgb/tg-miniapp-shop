create table if not exists public.tg_order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tg_orders(id) on delete cascade,
  origin_profile text not null,
  cdek_uuid text null,
  cdek_track_number text null,
  cdek_status text null,
  cdek_tariff_code integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tg_order_shipments_origin_profile_check
    check (origin_profile in ('ODN', 'YAN'))
);

create unique index if not exists tg_order_shipments_order_origin_unique_idx
  on public.tg_order_shipments(order_id, origin_profile);

create index if not exists tg_order_shipments_order_id_idx
  on public.tg_order_shipments(order_id);

create index if not exists tg_order_shipments_cdek_uuid_idx
  on public.tg_order_shipments(cdek_uuid);

drop trigger if exists tg_order_shipments_set_updated_at on public.tg_order_shipments;
create trigger tg_order_shipments_set_updated_at
before update on public.tg_order_shipments
for each row
execute function public.tg_set_updated_at();

alter table public.tg_order_shipments enable row level security;

drop policy if exists tg_order_shipments_dev_full_access on public.tg_order_shipments;
create policy tg_order_shipments_dev_full_access on public.tg_order_shipments
for all
using (true)
with check (true);

