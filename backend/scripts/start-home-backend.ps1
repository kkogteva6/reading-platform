$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendRoot = Join-Path $projectRoot "backend"

Set-Location $backendRoot

if (-not (Test-Path ".\venv\Scripts\python.exe")) {
    Write-Error "Не найден backend\\venv. Сначала создай виртуальное окружение и установи зависимости."
}

$env:JWT_SECRET = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { "reading-platform-home-secret" }
$env:CORS_ORIGINS = if ($env:CORS_ORIGINS) { $env:CORS_ORIGINS } else { "http://localhost:5173,http://127.0.0.1:5173,https://reading-platform-iota.vercel.app" }
$env:NEO4J_URI = if ($env:NEO4J_URI) { $env:NEO4J_URI } else { "bolt://127.0.0.1:7687" }
$env:NEO4J_USER = if ($env:NEO4J_USER) { $env:NEO4J_USER } else { "neo4j" }
$env:NEO4J_PASSWORD = if ($env:NEO4J_PASSWORD) { $env:NEO4J_PASSWORD } else { "neo4j12345" }
$env:NEO4J_DATABASE = if ($env:NEO4J_DATABASE) { $env:NEO4J_DATABASE } else { "neo4j" }

& ".\venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

