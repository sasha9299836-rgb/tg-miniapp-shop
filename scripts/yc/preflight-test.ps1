$ErrorActionPreference = "Stop"

$url = "https://storage.yandexcloud.net/items-photos-test/431/__cors_probe__.jpg"
Write-Host "Preflight OPTIONS -> $url"

curl.exe -i -X OPTIONS $url `
  -H "Origin: http://localhost:5173" `
  -H "Access-Control-Request-Method: PUT" `
  -H "Access-Control-Request-Headers: content-type"
