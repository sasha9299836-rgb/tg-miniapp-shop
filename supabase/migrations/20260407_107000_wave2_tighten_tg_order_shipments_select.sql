-- Stage 2 / Step 3
-- Table: public.tg_order_shipments
-- Goal: remove temporary direct SELECT policy after moving reads to server-side path.

alter table if exists public.tg_order_shipments enable row level security;

drop policy if exists tg_order_shipments_temp_select_only on public.tg_order_shipments;

notify pgrst, 'reload schema';
