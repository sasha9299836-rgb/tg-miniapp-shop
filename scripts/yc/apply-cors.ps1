$ErrorActionPreference = "Stop"

$rootDir = Resolve-Path "$PSScriptRoot\..\.."
$corsFile = Join-Path $rootDir "scripts\yc\cors.json"
$bucket = "items-photos-test"
$endpoint = "https://storage.yandexcloud.net"

Write-Host "Применяем CORS для бакета $bucket"
aws s3api put-bucket-cors `
  --bucket $bucket `
  --cors-configuration "file://$corsFile" `
  --endpoint-url $endpoint

Write-Host "Текущее CORS-правило бакета:"
aws s3api get-bucket-cors `
  --bucket $bucket `
  --endpoint-url $endpoint
