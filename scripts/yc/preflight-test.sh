#!/usr/bin/env bash
set -euo pipefail

URL="https://storage.yandexcloud.net/items-photos-test/431/__cors_probe__.jpg"

echo "Preflight OPTIONS -> $URL"
curl -i -X OPTIONS "$URL" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type"
