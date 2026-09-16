@echo off
chcp 65001 >nul
title Verchere - Mode visible (depannage)
cd /d "%~dp0"

echo.
echo   ==========================================
echo    VERCHERE - Mode navigateur VISIBLE
echo   ==========================================
echo.
echo   Le navigateur Chromium va s'afficher a l'ecran pendant les
echo   recherches et les envois. Utile pour :
echo     - completer une verification humaine (captcha) vous-meme
echo     - voir pourquoi un envoi echoue
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

REM --- Verification du chemin : OneDrive / SharePoint / cloud = problemes ---
echo "%CD%" | findstr /I /C:"OneDrive" /C:"- Documents" /C:"Dropbox" /C:"Google Drive" >nul
if not errorlevel 1 (
    echo.
    echo   [!] ATTENTION - Ce dossier semble synchronise dans le cloud
    echo       ^(OneDrive / SharePoint / "... - Documents" / Dropbox^).
    echo.
    echo   L'installation echoue presque toujours a cet endroit : le service
    echo   de synchronisation verrouille les fichiers.
    echo.
    echo   RECOMMANDE : fermez cette fenetre, deplacez le dossier
    echo   "verchere-prospection" vers un chemin court et local, par exemple :
    echo.
    echo         C:\verchere
    echo.
    echo   puis relancez ce fichier depuis ce nouvel emplacement.
    echo.
    echo   Pour tenter quand meme ici, appuyez sur une touche ^(deconseille^)...
    pause >nul
)

if not exist node_modules (
    echo   [1/3] Installation des dependances ^(quelques minutes la premiere fois^)...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto erreur_install
    echo   [1/3] Installation du navigateur Chromium...
    call npx playwright install chromium
) else (
    echo   [1/3] Dependances deja installees.
)

if not exist dist\public\index.html (
    echo   [2/3] Compilation de l'interface...
    call npm run build
    if errorlevel 1 goto erreur_build
) else (
    echo   [2/3] Interface deja compilee.
)

echo   [3/3] Demarrage du serveur...
echo.
echo   Interface : http://localhost:5000
echo   Laissez cette fenetre ouverte. Fermez-la pour arreter.
echo.
echo   Si la page affiche "site inaccessible", attendez quelques
echo   secondes puis cliquez "Actualiser" : le serveur finit de demarrer.
echo.

set NODE_ENV=production
set PORT=5000
set HEADFUL=1

REM Ouvre le navigateur seulement apres un court delai, le temps que
REM le serveur soit pret (evite le "site inaccessible" au demarrage).
start "" /b cmd /c "timeout /t 8 >nul & start "" http://localhost:5000"

call npx tsx server/index.ts

goto fin

:erreur_install
echo.
echo   [X] L'installation des dependances a echoue.
echo.
echo   Cause la plus frequente : le dossier est dans un espace synchronise
echo   ^(OneDrive / SharePoint / "... - Documents" / Dropbox^), ou le chemin
echo   est tres long. Windows et OneDrive verrouillent alors des fichiers.
echo.
echo   SOLUTION : deplacez le dossier "verchere-prospection" vers un chemin
echo   court et local, par exemple :   C:\verchere
echo   Puis relancez ce fichier depuis ce nouvel emplacement.
echo.
echo   Le dossier node_modules incomplet va etre supprime pour repartir propre.
rmdir /s /q node_modules 2>nul
echo.
pause
exit /b 1

:erreur_build
echo.
echo   [X] La compilation de l'interface a echoue. Copiez le message ci-dessus.
pause
exit /b 1

:fin
pause
