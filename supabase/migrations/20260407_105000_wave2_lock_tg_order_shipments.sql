-- Stage 1 / Task 6 / Wave 2 (part 3)
-- Table: public.tg_order_shipments
-- Goal:
--   1) remove broad DEV-open access,
--   2) block direct client mutate-path,
--   3) keep temporary read-path for current UI until read flows are moved server-side.

alter table if exists public.tg_order_shipments enable row level security;

drop policy if exists tg_order_shipments_dev_full_access on public.tg_order_shipments;
drop policy if exists tg_order_shipments_temp_select_only on public.tg_order_shipments;

-- Temporary read-only policy (Wave 2 transitional state).
-- NOTE: No INSERT/UPDATE/DELETE policies are created, so direct client writes are blocked.
create policy tg_order_shipments_temp_select_only
on public.tg_order_shipments
for select
to anon, authenticated
using (true);

notify pgrst, 'reload schema';
