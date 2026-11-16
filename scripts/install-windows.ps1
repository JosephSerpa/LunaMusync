[CmdletBinding()]
param(
  [string]$InstallDir = "$env:USERPROFILE\LunaMusync",
  [string[]]$LibraryPaths = @(),
  [string]$LunaImage = "ghcr.io/josephserpa/luna-musync:latest",
  [string]$Repository = "JosephSerpa/LunaMusync",
  [string]$LunaPort = "3001",
  [switch]$NoStart,
  [switch]$NoBrowser,
  [switch]$NoGui
)

$ErrorActionPreference = "Stop"
$SourceRoot = if (Test-Path (Join-Path $PSScriptRoot "docker-compose.yml")) {
  $PSScriptRoot
} else {
  Split-Path -Parent $PSScriptRoot
}

function Write-Utf8([string]$Path, [string[]]$Lines) {
  [System.IO.File]::WriteAllLines($Path, $Lines, (New-Object System.Text.UTF8Encoding($false)))
}

function Find-FreePort([int]$Preferred) {
  if ($Preferred -lt 1 -or $Preferred -gt 65535) { throw "El puerto debe estar entre 1 y 65535." }
  $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
  for ($port = $Preferred; $port -le [Math]::Min($Preferred + 100, 65535); $port++) {
    if ($listeners -notcontains $port) { return [string]$port }
  }
  throw "No se encontró un puerto libre a partir de $Preferred."
}

function Select-LibraryFolders {
  $paths = @()
  if (-not $NoGui) {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $continue = $true
    while ($continue) {
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = "Selecciona una carpeta que contenga tu música"
      $dialog.ShowNewFolderButton = $false
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $paths += $dialog.SelectedPath
        $answer = [System.Windows.Forms.MessageBox]::Show("¿Quieres añadir otra biblioteca?", "Luna Musync", [System.Windows.Forms.MessageBoxButtons]::YesNo)
        $continue = $answer -eq [System.Windows.Forms.DialogResult]::Yes
      } else {
        $continue = $false
      }
    }
  } else {
    while ($true) {
      $path = Read-Host "Carpeta de música (deja vacío para terminar)"
      if (-not $path) { break }
      $paths += $path
    }
  }
  return $paths
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "No se encontró Docker. Instala Docker Desktop, ábrelo y vuelve a ejecutar este asistente: https://www.docker.com/products/docker-desktop/"
}
& docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker está instalado, pero no está abierto. Inicia Docker Desktop y vuelve a intentarlo." }

if ($LibraryPaths.Count -eq 0) { $LibraryPaths = Select-LibraryFolders }
$unique = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($path in $LibraryPaths) {
  if (-not $path) { continue }
  if (-not (Test-Path $path -PathType Container)) { throw "No existe la carpeta: $path" }
  $resolved = (Resolve-Path $path).Path
  [void]$unique.Add($resolved)
}
if ($unique.Count -eq 0) { throw "Selecciona al menos una biblioteca de música." }

Write-Host "Preparando Luna en $InstallDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$copies = @(
  @((Join-Path $SourceRoot "docker-compose.yml"), (Join-Path $InstallDir "docker-compose.yml")),
  @((Join-Path $PSScriptRoot "luna.ps1"), (Join-Path $InstallDir "luna.ps1")),
  @((Join-Path $PSScriptRoot "luna.sh"), (Join-Path $InstallDir "luna.sh")),
  @($PSCommandPath, (Join-Path $InstallDir "install-windows.ps1"))
)
foreach ($copy in $copies) {
  if ([IO.Path]::GetFullPath($copy[0]) -ne [IO.Path]::GetFullPath($copy[1])) {
    Copy-Item $copy[0] $copy[1] -Force
  }
}

$volumeLines = @("services:", "  navidrome:", "    volumes:")
$index = 1
foreach ($path in $unique) {
  $dockerPath = $path.Replace("\", "/").Replace('"', '\"')
  $volumeLines += "      - `"$dockerPath`:/music/Biblioteca_$index`:ro`""
  $hasAudio = Get-ChildItem -LiteralPath $path -Recurse -File -Include *.mp3,*.flac,*.m4a,*.ogg,*.opus,*.wav,*.aac -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $hasAudio) { Write-Warning "No se encontraron archivos de audio compatibles en $path" }
  Write-Host "  Biblioteca ${index}: $path"
  $index++
}
Write-Utf8 (Join-Path $InstallDir "docker-compose.libraries.yml") $volumeLines

$envPath = Join-Path $InstallDir ".env"
if (-not (Test-Path $envPath) -and -not $PSBoundParameters.ContainsKey("LunaPort")) {
  $LunaPort = Find-FreePort ([int]$LunaPort)
}
$cookieSecure = "false"
if (Test-Path $envPath) {
  $existingEnv = Get-Content $envPath
  $settings = @{}
  foreach ($line in $existingEnv) {
    if ($line -match "^([A-Z_]+)=(.*)$") { $settings[$matches[1]] = $matches[2] }
  }
  if (-not $PSBoundParameters.ContainsKey("LunaImage") -and $settings.LUNA_IMAGE) { $LunaImage = $settings.LUNA_IMAGE }
  if (-not $PSBoundParameters.ContainsKey("Repository") -and $settings.LUNA_REPOSITORY) { $Repository = $settings.LUNA_REPOSITORY }
  if (-not $PSBoundParameters.ContainsKey("LunaPort") -and $settings.LUNA_PORT) { $LunaPort = $settings.LUNA_PORT }
  if ($settings.COOKIE_SECURE) { $cookieSecure = $settings.COOKIE_SECURE }
}
$envLines = @(
  "LUNA_IMAGE=$LunaImage",
  "LUNA_REPOSITORY=$Repository",
  "LUNA_PORT=$LunaPort",
  "COOKIE_SECURE=$cookieSecure"
)
Set-Content -Path $envPath -Value $envLines -Encoding ascii

$openCmd = "@echo off`r`nstart `"`" http://localhost:$LunaPort`r`n"
Set-Content -Path (Join-Path $InstallDir "Abrir Luna.cmd") -Value $openCmd -Encoding ascii
$updateCmd = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"%~dp0luna.ps1`" update`r`npause`r`n"
Set-Content -Path (Join-Path $InstallDir "Actualizar Luna.cmd") -Value $updateCmd -Encoding ascii
$stopCmd = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"%~dp0luna.ps1`" stop`r`npause`r`n"
Set-Content -Path (Join-Path $InstallDir "Detener Luna.cmd") -Value $stopCmd -Encoding ascii
$librariesCmd = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"%~dp0install-windows.ps1`" -InstallDir `"%~dp0`"`r`npause`r`n"
Set-Content -Path (Join-Path $InstallDir "Cambiar bibliotecas.cmd") -Value $librariesCmd -Encoding ascii

if (-not $NoStart) {
  Push-Location $InstallDir
  try {
    & docker compose --env-file .env -f docker-compose.yml -f docker-compose.libraries.yml up -d
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose no pudo iniciar Luna." }
  } finally { Pop-Location }

  $healthy = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "http://localhost:$LunaPort/api/health" -TimeoutSec 3
      if ($health.status -eq "ok") { $healthy = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
  }
  if (-not $healthy) { throw "Los contenedores se crearon, pero Luna no respondió. Revisa Docker Desktop y luna.ps1 logs." }

  Write-Host "`nLuna está funcionando." -ForegroundColor Green
  Write-Host "Abre http://localhost:$LunaPort y crea tu usuario en la pantalla de bienvenida."
  Write-Host "Tus bibliotecas se indexarán automáticamente; la primera vez puede tardar."
  if (-not $NoBrowser) {
    Start-Process "http://localhost:$LunaPort"
  }
} else {
  Write-Host "Instalación preparada en $InstallDir" -ForegroundColor Green
}
