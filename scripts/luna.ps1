[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "restart", "status", "logs", "update")]
  [string]$Command = "status"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$EnvFile = Join-Path $Root ".env"
$ComposeFile = Join-Path $Root "docker-compose.yml"
$LibrariesFile = Join-Path $Root "docker-compose.libraries.yml"
$ComposeArgs = @("--env-file", $EnvFile, "-f", $ComposeFile, "-f", $LibrariesFile)

function Invoke-Compose([string[]]$Arguments) {
  & docker compose @ComposeArgs @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose no pudo completar la operación." }
}

function Wait-Luna {
  $port = (Get-Content $EnvFile | Where-Object { $_ -match "^LUNA_PORT=" } | Select-Object -First 1) -replace "^LUNA_PORT=", ""
  if (-not $port) { $port = "3001" }
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 3
      if ($health.status -eq "ok") { return }
    } catch { }
    Start-Sleep -Seconds 3
  }
  throw "Luna no respondió a tiempo. Ejecuta 'luna.ps1 logs' para revisar el servidor."
}

function Set-EnvImage([string]$Image) {
  $content = Get-Content $EnvFile
  $content = $content | ForEach-Object { if ($_ -match "^LUNA_IMAGE=") { "LUNA_IMAGE=$Image" } else { $_ } }
  Set-Content -Path $EnvFile -Value $content -Encoding ascii
}

function Update-Luna {
  $repository = (Get-Content $EnvFile | Where-Object { $_ -match "^LUNA_REPOSITORY=" } | Select-Object -First 1) -replace "^LUNA_REPOSITORY=", ""
  if (-not $repository) { $repository = "JosephSerpa/LunaMusync" }
  if ($repository -notmatch "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$") { throw "El repositorio configurado no es válido." }
  $releaseUrl = "https://github.com/$repository/releases/latest/download/luna-release.json"
  Write-Host "Buscando una versión verificada de Luna..." -ForegroundColor Cyan
  $release = Invoke-RestMethod -Uri $releaseUrl -TimeoutSec 30
  if ($release.version -notmatch "^v[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.-]*$") {
    throw "La release no contiene una versión válida."
  }
  $expectedImage = "ghcr.io/$($repository.Split('/')[0].ToLowerInvariant())/luna-musync@sha256:"
  if (-not $release.image.StartsWith($expectedImage) -or $release.image -notmatch "@sha256:[0-9a-f]{64}$") {
    throw "La imagen no pertenece al repositorio configurado o no tiene un digest válido."
  }
  if ($release.composeSha256 -notmatch "^[0-9a-f]{64}$") {
    throw "La release no contiene una suma válida para Docker Compose."
  }

  $backupDir = Join-Path $Root ("backups/" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  Copy-Item $ComposeFile (Join-Path $backupDir "docker-compose.yml")
  Copy-Item $EnvFile (Join-Path $backupDir ".env")
  $tempCompose = Join-Path $backupDir "docker-compose.downloaded.yml"
  Invoke-WebRequest -Uri "https://github.com/$repository/releases/download/$($release.version)/docker-compose.yml" -OutFile $tempCompose -TimeoutSec 30
  $actualHash = (Get-FileHash $tempCompose -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $release.composeSha256) { throw "La configuración descargada no supera la verificación SHA-256." }

  try {
    & docker compose --env-file $EnvFile -f $tempCompose -f $LibrariesFile config --quiet
    if ($LASTEXITCODE -ne 0) { throw "La configuración descargada no es válida." }
    Copy-Item $tempCompose $ComposeFile -Force
    Set-EnvImage $release.image
    Invoke-Compose @("pull", "luna")
    Invoke-Compose @("up", "-d")
    Wait-Luna
    Write-Host "Luna se actualizó a $($release.version) correctamente." -ForegroundColor Green
    Write-Host "La configuración anterior está en $backupDir"
  } catch {
    Copy-Item (Join-Path $backupDir "docker-compose.yml") $ComposeFile -Force
    Copy-Item (Join-Path $backupDir ".env") $EnvFile -Force
    & docker compose @ComposeArgs up -d | Out-Null
    throw "La actualización falló y se restauró la configuración anterior. $_"
  }
}

if (-not (Test-Path $EnvFile)) { throw "No se encontró la instalación de Luna en $Root" }
Push-Location $Root
try {
  switch ($Command) {
    "start" { Invoke-Compose @("up", "-d"); Wait-Luna; Write-Host "Luna está disponible." -ForegroundColor Green }
    "stop" { Invoke-Compose @("stop"); Write-Host "Luna se detuvo. Tus bibliotecas y datos se conservan." }
    "restart" { Invoke-Compose @("restart"); Wait-Luna }
    "status" { Invoke-Compose @("ps") }
    "logs" { Invoke-Compose @("logs", "--tail=100") }
    "update" { Update-Luna }
  }
} finally {
  Pop-Location
}
