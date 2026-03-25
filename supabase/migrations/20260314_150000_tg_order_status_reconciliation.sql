alter table public.tg_orders
  drop constraint if exists tg_orders_status_check;

alter table public.tg_orders
  add constraint tg_orders_status_check check (status in (
    'created',
    'awaiting_payment_proof',
    'payment_proof_submitted',
    'payment_confirmed',
    'paid',
    'ready_for_pickup',
    'completed',
    'rejected',
    'expired',
    'cancelled'
  ));

notify pgrst, 'reload schema';
