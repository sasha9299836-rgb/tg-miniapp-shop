-- Stage 1 / Task 6 / Wave 2 (part 2)
-- Table: public.tg_order_events
-- Goal:
--   1) remove broad DEV-open access,
--   2) block direct client mutate-path,
--   3) keep access via server-side/RPC flows only.

alter table if exists public.tg_order_events enable row level security;

drop policy if exists tg_order_events_dev_full_access on public.tg_order_events;

notify pgrst, 'reload schema';
