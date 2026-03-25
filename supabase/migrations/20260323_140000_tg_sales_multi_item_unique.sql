-- Multi-item confirm flow: tg_sales must allow multiple rows per order_id
-- while preventing duplicate sale rows for the same order/post pair.

alter table public.tg_sales
  drop constraint if exists tg_sales_order_unique;

alter table public.tg_sales
  drop constraint if exists tg_sales_order_id_key;

drop index if exists public.tg_sales_order_unique;
drop index if exists public.tg_sales_order_id_key;

create unique index if not exists tg_sales_order_post_unique_idx
  on public.tg_sales(order_id, post_id);

