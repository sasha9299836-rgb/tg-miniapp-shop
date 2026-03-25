# CORS для Yandex Object Storage (`items-photos-test`)

Проект загружает фото напрямую в Yandex Object Storage через presigned PUT URL.

## Схема имен файлов

Имена ключей фиксированы:

- `<item_id>/<photo_no>.<ext>`
- Пример: `431/1.jpg`, `431/2.jpg`

`photo_no` уникален внутри одного поста, это контролируется в БД (`UNIQUE (post_id, photo_no)`).
Повторная загрузка того же номера возвращает ошибку `ALREADY_EXISTS` и не перезаписывает объект.

## Требуемые CORS-правила бакета

- AllowedOrigins:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
- AllowedMethods:
  - `GET`
  - `HEAD`
  - `PUT`
  - `POST`
  - `DELETE`
- AllowedHeaders:
  - `*`
- ExposeHeaders:
  - `ETag`
- MaxAgeSeconds:
  - `3000`

JSON-файл лежит в `scripts/yc/cors.json`.

## Применение через AWS CLI

PowerShell:

```powershell
.\scripts\yc\apply-cors.ps1
```

Bash:

```bash
bash ./scripts/yc/apply-cors.sh
```

Скрипты выполняют:

```bash
aws s3api put-bucket-cors --bucket items-photos-test --cors-configuration file://scripts/yc/cors.json --endpoint-url https://storage.yandexcloud.net
aws s3api get-bucket-cors --bucket items-photos-test --endpoint-url https://storage.yandexcloud.net
```

`get-bucket-cors` — источник истины. UI в консоли YC может показывать устаревшее состояние.

## Проверка preflight

PowerShell:

```powershell
.\scripts\yc\preflight-test.ps1
```

Bash:

```bash
bash ./scripts/yc/preflight-test.sh
```

Ожидаем `200/204` и заголовки:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

## Что смотреть в DevTools

Вкладка Network:

1. `OPTIONS` к `https://items-photos-test.storage.yandexcloud.net/...`
2. `PUT` к тому же URL.

Для `OPTIONS` должен быть `Access-Control-Allow-Origin`, для `PUT` — статус `200` или `204`.
