-- Stage 1 / Task 6 / Wave 1
-- Table: public.tg_settings
-- Goal: remove DEV-open broad policy and keep table server-only.

alter table if exists public.tg_settings enable row level security;

drop policy if exists tg_settings_dev_full_access on public.tg_settings;

notify pgrst, 'reload schema';
