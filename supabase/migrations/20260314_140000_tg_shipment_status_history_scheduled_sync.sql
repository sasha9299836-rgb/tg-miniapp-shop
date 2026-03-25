alter table public.tg_shipment_status_history
  drop constraint if exists tg_shipment_status_history_event_source_check;

alter table public.tg_shipment_status_history
  add constraint tg_shipment_status_history_event_source_check
  check (event_source in ('webhook', 'manual_sync', 'scheduled_sync'));

notify pgrst, 'reload schema';
