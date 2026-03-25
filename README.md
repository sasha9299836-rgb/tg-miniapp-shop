# tg-miniapp-shop

## Установка

```bash
npm install
```

## Env фронта

Файл env для фронта лежит в корне проекта рядом с `package.json`.

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Запуск

```bash
npm run dev
```

## Сборка

```bash
npm run build
```

## Заказы и резерв

- SQL миграции: `supabase/migrations`
- Cron/резерв/истечение: `docs/orders.md`
- Публикация по времени: `docs/publishing.md`
