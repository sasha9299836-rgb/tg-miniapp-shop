create table if not exists public.tg_shipment_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tg_orders(id) on delete cascade,
  cdek_uuid text null,
  cdek_status text null,
  cdek_track_number text null,
  event_source text not null check (event_source in ('webhook', 'manual_sync')),
  created_at timestamptz not null default now()
);

create index if not exists tg_shipment_status_history_order_id_idx
  on public.tg_shipment_status_history(order_id);

create index if not exists tg_shipment_status_history_cdek_uuid_idx
  on public.tg_shipment_status_history(cdek_uuid)
  where cdek_uuid is not null;

notify pgrst, 'reload schema';
