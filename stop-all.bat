@echo off
title DragonBound - Stop
echo Parando servidores DragonBound...
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'src.(web.main.server|game)\.js' } | ForEach-Object { Write-Host ('  node PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force };" ^
  "Get-CimInstance Win32_Process -Filter \"Name='mariadbd.exe'\" | Where-Object { $_.CommandLine -match 'dragonbound-db' } | ForEach-Object { Write-Host ('  mariadbd PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"
echo Feito.
pause
