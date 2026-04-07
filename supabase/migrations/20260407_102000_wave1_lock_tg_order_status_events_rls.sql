-- Stage 1 / Task 6 / Wave 1
-- Table: public.tg_order_status_events
-- Goal: remove DEV-open broad policy and keep access via RPC/server-side flows.

alter table if exists public.tg_order_status_events enable row level security;

drop policy if exists tg_order_status_events_dev_full_access on public.tg_order_status_events;

notify pgrst, 'reload schema';
