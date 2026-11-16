@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1" %*
if errorlevel 1 (
  echo.
  echo La instalacion no pudo completarse. Revisa el mensaje anterior.
)
pause
