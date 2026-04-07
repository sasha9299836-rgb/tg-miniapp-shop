# Заказы, резервы и истечение оплаты

## Деплой функций

```bash
npx supabase functions deploy tg_expire_orders
npx supabase functions deploy tg_yc_presign_payment_proof_put
npx supabase functions deploy tg_yc_presign_payment_proof_get
```

## Обязательные secrets

- `SUPABASE_URL` (или `PROJECT_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (или `SERVICE_ROLE_KEY`)
- `YC_BUCKET`
- `YC_REGION` (`ru-central1`)
- `YC_ACCESS_KEY`
- `YC_SECRET_KEY`
- `EXPIRE_ORDERS_CRON_SECRET` (или `CRON_SECRET`)

## Безопасный вызов tg_expire_orders

`tg_expire_orders` нельзя оставлять публичным/open.  
Вызов scheduler должен отправлять секретный заголовок:

- Header: `x-cron-secret: <EXPIRE_ORDERS_CRON_SECRET>`

Пример SQL cron:

```sql
select cron.schedule(
  'tg_expire_orders_every_minute',
  '* * * * *',
  $$
  select
    net.http_post(
      url := 'https://<project_ref>.supabase.co/functions/v1/tg_expire_orders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '<EXPIRE_ORDERS_CRON_SECRET>'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

## Таймер резерва

```sql
update public.tg_settings
set value = '420'
where key = 'order_payment_timeout_seconds';
```

