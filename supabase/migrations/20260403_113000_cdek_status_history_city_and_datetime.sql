alter table public.tg_shipment_status_history
  add column if not exists status_datetime text null,
  add column if not exists city text null;

update public.tg_shipment_status_history
set status_datetime = coalesce(status_datetime, status_date_time)
where status_datetime is null
  and status_date_time is not null;

create unique index if not exists tg_shipment_status_history_order_status_datetime_uidx
  on public.tg_shipment_status_history(order_id, cdek_status, status_datetime)
  where order_id is not null
    and cdek_status is not null
    and status_datetime is not null;

notify pgrst, 'reload schema';
