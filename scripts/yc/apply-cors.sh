#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CORS_FILE="$ROOT_DIR/scripts/yc/cors.json"
BUCKET="items-photos-test"
ENDPOINT="https://storage.yandexcloud.net"

echo "Applying CORS to bucket: $BUCKET"
aws s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --cors-configuration "file://$CORS_FILE" \
  --endpoint-url "$ENDPOINT"

echo "Current CORS configuration:"
aws s3api get-bucket-cors \
  --bucket "$BUCKET" \
  --endpoint-url "$ENDPOINT"
