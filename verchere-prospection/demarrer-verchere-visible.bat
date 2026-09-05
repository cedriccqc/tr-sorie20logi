@echo off
chcp 65001 >nul
title Verchere - Mode visible (depannage)
cd /d "%~dp0"

echo.
echo   ==========================================
echo    VERCHERE - Mode navigateur VISIBLE
echo   ==========================================
echo.
echo   Le navigateur va s'afficher a l'ecran pendant les recherches
echo   et les envois. Utile pour :
echo     - completer une verification humaine (captcha) vous-meme
echo     - voir pourquoi un envoi echoue
echo.
echo   Interface : http://localhost:5000
echo.

timeout /t 3 >nul
start "" http://localhost:5000

set NODE_ENV=production
set PORT=5000
set HEADFUL=1
call npx tsx server/index.ts

pause
