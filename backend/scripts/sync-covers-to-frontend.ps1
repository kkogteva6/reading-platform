$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sourceDir = Join-Path $projectRoot "backend\data\covers"
$targetDir = Join-Path $projectRoot "frontend\public\covers"

if (-not (Test-Path $sourceDir)) {
  throw "Source covers directory not found: $sourceDir"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Copy-Item -Path (Join-Path $sourceDir "*") -Destination $targetDir -Recurse -Force

$count = (Get-ChildItem -Path $targetDir -File | Measure-Object).Count
Write-Host "Synced covers to frontend/public/covers. Files: $count"
