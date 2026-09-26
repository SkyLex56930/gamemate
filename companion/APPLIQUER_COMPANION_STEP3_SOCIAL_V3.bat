@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  GameMate Companion - Step 3 Social V3
echo ============================================================
echo.
echo Ce correctif cumulatif va :
echo - appliquer le nettoyage V1 ;
echo - appliquer Trouver des mates V2 ;
echo - relier demandes d'amis, messages et squads ;
echo - activer la synchronisation sociale en temps reel ;
echo - verifier le build automatiquement.
echo.

if not exist "package.json" goto :wrong_folder
if not exist "src\App.tsx" goto :wrong_folder

node apply-companion-cleanup-v1.mjs
if errorlevel 1 goto :error

node apply-companion-step2-v2.mjs
if errorlevel 1 goto :error

node apply-companion-step3-social-v3.mjs
if errorlevel 1 goto :error

echo.
echo Verification TypeScript et Vite...
call npm run build
if errorlevel 1 goto :build_error

echo.
echo ============================================================
echo [OK] Correctif social V3 applique et build web valide.
echo Ensuite lance : npm run tauri build
echo ============================================================
pause
exit /b 0

:wrong_folder
echo.
echo [ERREUR] Decompresse tout le ZIP a la racine de companion.
echo Le BAT doit etre a cote de package.json, src et src-tauri.
pause
exit /b 2

:build_error
echo.
echo [ERREUR] Le correctif est installe mais le build a detecte un probleme.
echo Envoie une capture complete du message affiche au-dessus.
pause
exit /b 3

:error
echo.
echo [ERREUR] Le correctif n'a pas pu etre applique.
pause
exit /b 1
