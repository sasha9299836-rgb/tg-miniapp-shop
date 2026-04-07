-- Stage 2 / Step 2
-- Table: public.tg_orders
-- Goal: remove temporary direct SELECT policy.
-- Reads are moved to server-side path (supabase/functions/tg_orders_read).

alter table if exists public.tg_orders enable row level security;

drop policy if exists tg_orders_temp_select_only on public.tg_orders;

notify pgrst, 'reload schema';
