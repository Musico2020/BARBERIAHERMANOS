@echo off
rem Arranca Salon Hermanos en este computador: Docker Desktop, la base de datos local y la web.
rem Doble clic para usarlo. Para apagar la web, cierra la ventana "Salon Hermanos - web".
chcp 65001 >nul
title Salon Hermanos - inicio
cd /d "%~dp0"

echo.
echo  ===============================================
echo    SALON HERMANOS - Club de Caballeros
echo  ===============================================
echo.

if not exist ".env" (
  echo  Falta el archivo .env con los datos de la base local.
  echo  Copia .env.example como .env y pon la llave que muestra "npx supabase start".
  pause
  exit /b 1
)

rem ---------------------------------------------------------------- 1. Docker
echo  [1/3] Revisando Docker Desktop...
docker info >nul 2>&1
if not errorlevel 1 goto docker_listo
echo        Abriendo Docker Desktop, espera un momento...
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a intentos=0
:esperar_docker
"%SystemRoot%\System32\timeout.exe" /t 3 /nobreak >nul
set /a intentos+=1
docker info >nul 2>&1
if not errorlevel 1 goto docker_listo
if %intentos% GEQ 80 goto docker_fallo
goto esperar_docker
:docker_fallo
echo.
echo  Docker Desktop no responde. Cierralo, reinicia el computador si sigue igual, y vuelve a dar doble clic en este archivo.
pause
exit /b 1
:docker_listo
echo        Docker listo.

rem ---------------------------------------------------------------- 2. Base de datos
echo  [2/3] Iniciando la base de datos (la primera vez puede tardar unos minutos)...
call npx --yes supabase@2.121.0 start > "%TEMP%\salon-hermanos-supabase.log" 2>&1
if errorlevel 1 (
  findstr /i "already running" "%TEMP%\salon-hermanos-supabase.log" >nul
  if errorlevel 1 (
    echo.
    echo  No se pudo iniciar la base de datos. Detalle:
    type "%TEMP%\salon-hermanos-supabase.log"
    pause
    exit /b 1
  )
)
echo        Base de datos lista.

rem ---------------------------------------------------------------- 3. Web
echo  [3/3] Iniciando la web...
if not exist "node_modules" (
  echo        Instalando dependencias por primera vez...
  call npm install
)
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo        La web ya estaba corriendo.
  goto abrir
)
rem Se usa la version compilada (la misma que se publica): carga en segundos y gasta poca memoria.
rem Solo se vuelve a compilar si algo cambio desde la ultima vez.
powershell -NoProfile -Command "$d = 'dist\index.html'; if (-not (Test-Path $d)) { exit 1 }; $t = (Get-Item $d).LastWriteTime; $n = Get-ChildItem src, public, index.html, .env, tailwind.config.js -Recurse -File | Where-Object { $_.LastWriteTime -gt $t } | Select-Object -First 1; if ($n) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo        Preparando la web, tarda un par de minutos solo cuando hubo cambios...
  call npm run build > "%TEMP%\salon-hermanos-build.log" 2>&1
  if errorlevel 1 (
    echo.
    echo  No se pudo preparar la web. Detalle:
    type "%TEMP%\salon-hermanos-build.log"
    pause
    exit /b 1
  )
)
start "Salon Hermanos - web" cmd /k "npm run preview -- --host 127.0.0.1 --port 5173 --strictPort"
set /a intentos=0
:esperar_web
"%SystemRoot%\System32\timeout.exe" /t 2 /nobreak >nul
set /a intentos+=1
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if not errorlevel 1 goto abrir
if %intentos% GEQ 45 goto abrir
goto esperar_web

:abrir
start "" "http://127.0.0.1:5173"
echo.
echo  Listo.
echo    Web:     http://127.0.0.1:5173
echo    Panel:   http://127.0.0.1:5173/admin
echo    Barbero: http://127.0.0.1:5173/barber
echo.
echo  Para apagar la web, cierra la ventana "Salon Hermanos - web".
"%SystemRoot%\System32\timeout.exe" /t 8 >nul
exit /b 0
