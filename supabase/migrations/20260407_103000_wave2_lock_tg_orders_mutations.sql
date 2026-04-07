-- Stage 1 / Task 6 / Wave 2 (part 1)
-- Table: public.tg_orders
-- Goal:
--   1) close broad direct mutate access from client (insert/update/delete),
--   2) keep temporary read-path to avoid UI regressions until read flows are moved to server-side endpoints.

alter table if exists public.tg_orders enable row level security;

drop policy if exists tg_orders_dev_full_access on public.tg_orders;
drop policy if exists tg_orders_temp_select_only on public.tg_orders;

-- Temporary read-only policy.
-- NOTE: this policy intentionally keeps SELECT open for current UI flows.
-- Direct INSERT/UPDATE/DELETE remain blocked (no write policies).
create policy tg_orders_temp_select_only
on public.tg_orders
for select
to anon, authenticated
using (true);

notify pgrst, 'reload schema';
