# Заказы, резерв и подтверждение оплаты

## Деплой функций

```bash
npx supabase functions deploy tg_expire_orders
npx supabase functions deploy tg_yc_presign_payment_proof_put
npx supabase functions deploy tg_yc_presign_payment_proof_get
```

Для `tg_expire_orders` и `tg_yc_presign_payment_proof_put` выключите Verify JWT.

## Обязательные secrets

- `SUPABASE_URL` (или `PROJECT_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (или `SERVICE_ROLE_KEY`)
- `YC_BUCKET`
- `YC_REGION` (`ru-central1`)
- `YC_ACCESS_KEY`
- `YC_SECRET_KEY`

## Cron для истечения резерва

```sql
select cron.schedule(
  'tg_expire_orders_every_minute',
  '* * * * *',
  $$
  select
    net.http_post(
      url := 'https://<project_ref>.supabase.co/functions/v1/tg_expire_orders',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

## Настройка таймера резерва

```sql
update public.tg_settings
set value = '420'
where key = 'order_payment_timeout_seconds';
```

`420` секунд = 7 минут.
