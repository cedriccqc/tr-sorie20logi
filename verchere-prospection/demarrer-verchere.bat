@echo off
chcp 65001 >nul
title Verchere - Systeme de prospection
cd /d "%~dp0"

echo.
echo   ==========================================
echo    VERCHERE - Systeme de prospection
echo   ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [X] Node.js n'est pas installe.
    echo.
    echo   Installez-le gratuitement ici : https://nodejs.org
    echo   Choisissez la version "LTS", puis relancez ce fichier.
    echo.
    start "" https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo   [1/3] Installation des dependances ^(quelques minutes la premiere fois^)...
    call npm install
    if errorlevel 1 goto erreur
    echo   [1/3] Installation du navigateur Chromium...
    call npx playwright install chromium
) else (
    echo   [1/3] Dependances deja installees.
)

if not exist dist\public\index.html (
    echo   [2/3] Compilation de l'interface...
    call npm run build
    if errorlevel 1 goto erreur
) else (
    echo   [2/3] Interface deja compilee.
)

echo   [3/3] Demarrage du serveur...
echo.
echo   Interface : http://localhost:5000
echo   Laissez cette fenetre ouverte. Fermez-la pour arreter.
echo.

timeout /t 3 >nul
start "" http://localhost:5000

set NODE_ENV=production
set PORT=5000
call npx tsx server/index.ts

goto fin

:erreur
echo.
echo   Une erreur est survenue. Copiez le message ci-dessus.
pause
exit /b 1

:fin
pause
