# Публикация отложенных постов

## 1) Применить миграции

```bash
npx supabase db push
```

## 2) Задеплоить Edge Functions

```bash
npx supabase functions deploy publish_due_posts
npx supabase functions deploy tg_publish_due_posts
```

## 3) Обязательные secrets

Для `publish_due_posts` и `tg_publish_due_posts`:

- `SUPABASE_URL` (или `PROJECT_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (или `SERVICE_ROLE_KEY`)
- `PUBLISH_DUE_POSTS_CRON_SECRET` (или `CRON_SECRET`)

## 4) Безопасный cron-вызов

Endpoint нельзя оставлять в public-open режиме.  
Scheduler должен передавать заголовок:

- `x-cron-secret: <PUBLISH_DUE_POSTS_CRON_SECRET>`

Пример HTTP cron:

1. URL: `https://<project-ref>.supabase.co/functions/v1/publish_due_posts`
2. Метод: `POST`
3. Headers:
   - `content-type: application/json`
   - `x-cron-secret: <PUBLISH_DUE_POSTS_CRON_SECRET>`
4. Расписание: `* * * * *`

## 5) Проверка

1. Создать отложенный пост на ближайшую минуту.
2. Дождаться выполнения cron.
3. Проверить, что пост перешел в `published`.

