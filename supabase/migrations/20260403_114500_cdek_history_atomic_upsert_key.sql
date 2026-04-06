alter table public.tg_shipment_status_history
  add column if not exists status_datetime text null;

update public.tg_shipment_status_history
set status_datetime = coalesce(status_datetime, status_date_time)
where status_datetime is null
  and status_date_time is not null;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by order_id, cdek_uuid, cdek_status, status_datetime
      order by created_at desc, id desc
    ) as rn
  from public.tg_shipment_status_history
  where order_id is not null
    and cdek_uuid is not null
    and cdek_status is not null
    and status_datetime is not null
)
delete from public.tg_shipment_status_history target
using ranked
where target.ctid = ranked.ctid
  and ranked.rn > 1;

drop index if exists public.tg_shipment_status_history_event_key_uidx;
drop index if exists public.tg_shipment_status_history_order_status_datetime_uidx;

alter table public.tg_shipment_status_history
  drop constraint if exists tg_shipment_status_history_order_uuid_status_datetime_key;

alter table public.tg_shipment_status_history
  add constraint tg_shipment_status_history_order_uuid_status_datetime_key
  unique (order_id, cdek_uuid, cdek_status, status_datetime);

notify pgrst, 'reload schema';
