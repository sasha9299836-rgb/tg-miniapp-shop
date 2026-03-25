# Публикация отложенных постов

## 1) Применить миграции

```bash
npx supabase db push
```

## 2) Задеплоить Edge Function

```bash
npx supabase functions deploy publish_due_posts
npx supabase functions deploy yc_presign_put
```

## 3) Проверить secrets для `publish_due_posts`

В Supabase Dashboard → Edge Functions → Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Для `publish_due_posts` должен быть выключен Verify JWT.

## 4) Включить cron (раз в минуту)

В Supabase Dashboard:

1. `Database` → `Cron` → `New job`
2. Тип: HTTP request
3. URL:
   - `https://<project-ref>.supabase.co/functions/v1/publish_due_posts`
4. Метод: `POST`
5. Заголовок:
   - `content-type: application/json`
6. Расписание:
   - `* * * * *`

## 5) Проверка вручную

1. Создать черновик, поставить время на +1 минуту, нажать `Сохранить`.
   - Пост должен появиться во вкладке `Отложенные`.
2. Подождать 1–2 минуты.
   - Пост должен исчезнуть из `Отложенные`.
   - Пост должен появиться в `Каталоге`.
3. Открыть редактирование поста без ID.
   - В консоли не должно быть предупреждения: `The specified value "null" cannot be parsed, or is out of range.`
