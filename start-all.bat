@echo off
title DragonBound - Launcher
set DBDIR=C:\Claude\dragonbound-db
set APPDIR=C:\Claude\dragonbound

echo [1/3] Iniciando MariaDB (porta 3306)...
start "DragonBound MariaDB" /D "%DBDIR%" "%DBDIR%\mariadb-11.4.4-winx64\bin\mariadbd.exe" --defaults-file="%DBDIR%\data\my.ini" --console
timeout /t 8 /nobreak >nul

echo [2/3] Iniciando Game Server (porta 9001)...
start "DragonBound Game" /D "%APPDIR%" cmd /c "npm run start:game"
timeout /t 3 /nobreak >nul

echo [3/3] Iniciando Web Server (porta 80)...
start "DragonBound Web" /D "%APPDIR%" cmd /c "npm run start:web"

echo.
echo Pronto. Abra http://localhost/ no navegador.
echo Para parar tudo, rode stop-all.bat
pause
