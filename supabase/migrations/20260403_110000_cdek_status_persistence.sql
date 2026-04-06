alter table public.tg_order_shipments
  add column if not exists last_cdek_status_payload jsonb null,
  add column if not exists last_cdek_status_synced_at timestamptz null;

alter table public.tg_shipment_status_history
  add column if not exists event_key text null,
  add column if not exists status_code text null,
  add column if not exists status_name text null,
  add column if not exists status_date_time text null;

alter table public.tg_shipment_status_history
  drop constraint if exists tg_shipment_status_history_event_source_check;

alter table public.tg_shipment_status_history
  add constraint tg_shipment_status_history_event_source_check
  check (event_source in ('webhook', 'manual_sync', 'scheduled_sync', 'create_poll'));

create unique index if not exists tg_shipment_status_history_event_key_uidx
  on public.tg_shipment_status_history(event_key)
  where event_key is not null;

notify pgrst, 'reload schema';
