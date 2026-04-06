create index if not exists tg_shipment_status_history_uuid_code_time_idx
  on public.tg_shipment_status_history(cdek_uuid, status_code, status_date_time)
  where cdek_uuid is not null
    and status_code is not null
    and status_date_time is not null;

notify pgrst, 'reload schema';
